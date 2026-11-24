<script setup>
/**
 * Diagrama de Gantt: una sola pieza, con la columna de nombres aparte.
 *
 * El SVG tiene cinco capas, en orden: fondo, rejilla, bandas, cuerpo y eje. El
 * SVG entero es el contenido del panel con overflow: el scroll nativo sube el
 * cuerpo y el eje se contratraslada, para que la cabecera quede clavada
 * arriba. La columna de nombres no hace scroll propio: su pista interior
 * lleva el mismo desplazamiento.
 *
 * El arrastre lo gestiona `useGanttDrag`: la barra emite donde se agarra y
 * el composable devuelve el fantasma y el rango previsualizado, que la vista
 * convierte en un PATCH. El teclado sube a la vista, que es quien conoce la
 * escala y el permiso.
 *
 * El chart no dimensiona el lienzo: eso lo estira el CSS. Solo mide el ancho
 * del panel y lo informa a la vista, que de ahi calcula la escala efectiva.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { addDays, dateAtIndex, dayIndex, inclusiveDays, parseIsoDate, toIsoDate } from '../../utils/ganttScale'
import { GANTT_METRICS } from '../../utils/ganttMetrics'
import { GANTT_ROW_HEIGHT, flechaDe } from '../../utils/ganttLayout'
import { shortMonthName, weekdayNames } from '../../utils/month'
import { useGanttDrag } from '../../composables/useGanttDrag'
import GanttAxis from './GanttAxis.vue'
import GanttBar from './GanttBar.vue'
import GanttGroupRow from './GanttGroupRow.vue'
import GanttNamesColumn from './GanttNamesColumn.vue'
import GanttTooltip from './GanttTooltip.vue'

const props = defineProps({
  /** Modelo del diagrama, de `buildLayout`. */
  layout: { type: Object, required: true },
  /** Celdas del eje, ya con las insignias de hoy y de festivo. */
  columnas: { type: Array, required: true },
  /**
   * Bandas de la cabecera del eje: [{ key, label, x, width }].
   *
   * Solo la escala de dia las usa (una por mes). No confundirse con las
   * bandas sombreadas del cuerpo (`bandas`), que son las de fin de semana y
   * festivo. Si no llegan, el eje las pinta vacias.
   */
  bandasCabecera: { type: Array, default: () => [] },
  /** Filas de la columna de nombres, ya enriquecidas. */
  filasNombres: { type: Array, required: true },
  /** Si la persona que entra puede escribir en la barra: por identificador. */
  editableDe: { type: Function, required: true },
  /** Barra enfocada: la unica con tabindex 0. */
  barraEnfocada: { type: [Number, String], default: null },
  /** Etiqueta aria de cada barra, por identificador. */
  etiquetaDe: { type: Function, required: true },
  /**
   * Dependencias de cada tarea, por identificador de tarea.
   *
   * La vista las arma con el feed, que es quien tiene los vinculos y los
   * titulos: { [taskId]: [{ titulo, tipo, sentido }] }. El chart solo las
   * pinta en el globo de la barra.
   */
  dependencias: { type: Object, default: () => ({}) },
  /** Frase descriptiva del SVG: tareas, proyectos, rango. */
  descripcion: { type: String, default: '' },
  /** Aviso de solo lectura, si la vista lo lleva. */
  aviso: { type: String, default: '' },
})

const emit = defineEmits(['abrir', 'seleccionar', 'tecla', 'mover', 'crear', 'ancho-panel'])

const panelDiagrama = ref(null)
/** El lienzo: el SVG del diagrama. Su caja da la coordenada del puntero. */
const lienzo = ref(null)
/** Desplazamiento vertical del diagrama: el eje lo invierte, la columna lo replica. */
const desplazamiento = ref(0)
/**
 * Caja del lienzo en el viewport.
 *
 * Se cachea porque el raton la pide en cada movimiento: leerla cada vez
 * obliga al navegador a recalcular la maquina. Se invalida al desplazar el
 * panel (el lienzo se mueve) y al medir el ancho.
 */
let cajaLienzo = null

/**
 * Ancho del panel de diagrama: lo mide el chart y lo informa a la vista.
 *
 * El chart no dimensiona el lienzo: eso lo estira el CSS (`width: 100%`). Lo
 * unico que hace es informar del ancho disponible, que la vista usa para
 * calcular la escala efectiva (los pixeles por dia suben hasta llenar el
 * panel). Solo se emite cuando el ancho cambia de verdad.
 */
let anchoInformado = 0
let observadorAncho = null

function medirAncho() {
  const panel = panelDiagrama.value
  if (!panel) return
  cajaLienzo = null
  const ancho = panel.clientWidth
  if (!ancho || ancho === anchoInformado) return
  anchoInformado = ancho
  emit('ancho-panel', ancho)
}

onMounted(() => {
  medirAncho()
  // Sin `ResizeObserver` (por ejemplo en jsdom) el ancho se queda en el que
  // se midio al montar: no se rompe nada por no poder observar.
  if (typeof ResizeObserver === 'undefined') return
  observadorAncho = new ResizeObserver(medirAncho)
  if (panelDiagrama.value) observadorAncho.observe(panelDiagrama.value)
})

onBeforeUnmount(() => {
  observadorAncho?.disconnect()
  observadorAncho = null
  window.removeEventListener('mouseup', alSoltarRaton)
})

/**
 * Vuelve a medir el panel cuando cambia el layout.
 *
 * El ancho del panel es el hueco que le deja la vista, y ese hueco se mueve
 * con el layout (por ejemplo, cuando `main` gana o pierde la barra de scroll
 * vertical). Se mide despues del repintado (`flush: 'post'`), para usar el
 * ancho vigente y no el anterior; `medirAncho` solo emite si cambia.
 */
watch(() => props.layout, medirAncho, { flush: 'post' })

/** Alto total del SVG: cabecera mas una fila por entrada del layout. */
const altoTotal = computed(() => GANTT_METRICS.headerHeight + props.layout.rows.length * GANTT_ROW_HEIGHT)

/** Bandas que se sombrea: en la escala de Mes no se sombrea. */
const bandas = computed(() =>
  props.layout.scale.header === 'month' ? [] : props.layout.shaded,
)

/**
 * Clase de la banda sombreada del cuerpo: festivo o fin de semana.
 *
 * Son dos clases y no una con el color por parametro: el festivo lleva su
 * propio tinte porque es informacion (un dia no laborable no se trabaja).
 */
function claseDeBanda(kind) {
  return kind === 'festivo' ? 'gantt__banda-festivo' : 'gantt__banda-fin-de-semana'
}

/** Barras por identificador de tarea, para resolver los extremos de las flechas. */
const barraPorId = computed(
  () => new Map(props.layout.bars.map((barra) => [barra.taskId, barra])),
)

/**
 * Fila de la barra enfocada: se marca aunque el raton este en otra fila.
 *
 * La barra enfocada es la unica con `tabindex` 0 y la unica con
 * `aria-current`: su estado ya se anuncia. La banda de su fila es solo la
 * parte visual de ese mismo estado.
 */
const filaActiva = computed(() => {
  const id = props.barraEnfocada
  if (id === null || id === undefined) return null
  const barra = barraPorId.value.get(id)
  return barra ? barra.rowIndex : null
})

/**
 * Bandas de fila resaltada: la de la fila enfocada y la de la del puntero.
 *
 * Cada banda mide UNA fila de alto y ocupa todo el ancho del lienzo. Solo
 * se pinta una por fila: si el puntero esta sobre la fila enfocada, manda
 * la de la enfocada, que es mas marcada.
 */
const bandasFila = computed(() => {
  const activa = bandaDeFila(filaActiva.value)
  const raton = bandaDeFila(filaRaton.value)
  return {
    activa,
    raton: raton && (!activa || raton.indice !== activa.indice) ? raton : null,
  }
})

/** Banda de una fila del cuerpo, o null si la fila no existe. */
function bandaDeFila(indice) {
  if (indice === null || indice === undefined) return null
  if (!props.layout.rows[indice]) return null
  return { indice, y: indice * GANTT_ROW_HEIGHT }
}

/**
 * Flechas de dependencias, del fin del requisito al inicio de la dependiente.
 * Un vinculo cuya otra barra no esta visible (filtrada) no se dibuja.
 */
const flechas = computed(() =>
  (props.layout.dependencies ?? [])
    .map((vinculo) => flechaDe(vinculo, barraPorId.value))
    .filter(Boolean),
)

/**
 * Cruz de fecha: la columna del puntero y el dia que hay en ella.
 *
 * El dia sale de la escala (pixeles por dia) sobre el inicio del rango, con
 * el mismo patron que el doble clic del fondo. La linea se dibuja en el
 * cuerpo y la etiqueta en la cabecera, para que la fecha se lea sin tapar el
 * numero de semana ni el rango.
 */
const cruz = ref(null)
/** Posicion del puntero en el viewport: el globo la sigue. */
const puntero = ref({ x: 0, y: 0 })
/** Barra sobre la que esta el raton: la anuncia la propia barra. */
const barraSobre = ref(null)
/**
 * Fila bajo el puntero.
 *
 * La columna de nombres avisa de la fila en la que esta el raton y el
 * diagrama la calcula desde la y del puntero: las dos mitades comparten el
 * mismo numero de fila, asi que el resaltado cae en la misma fila.
 */
const filaRaton = ref(null)
/** El raton ha agarrado una barra: el gesto de arrastre esta en curso. */
const arrastrando = ref(false)

/**
 * Caja del lienzo, cacheada.
 *
 * El rect del SVG ya descuenta el scroll del panel, asi que la x del puntero
 * sobre el lienzo es la coordenada de contenido.
 */
function cajaDelLienzo() {
  if (!cajaLienzo) {
    cajaLienzo = lienzo.value ? lienzo.value.getBoundingClientRect() : null
  }
  return cajaLienzo
}

/**
 * Raton sobre el diagrama: la cruz de fecha y la posicion del puntero.
 *
 * Sobre la cabecera pegajosa no hay columna que marcar: la cruz se esconde.
 * Fuera del rango horizontal, tambien. Durante un gesto de arrastre, tambien:
 * la cruz estorba al gesto.
 */
function alMoverRaton(event) {
  puntero.value = { x: event.clientX, y: event.clientY }
  const rect = cajaDelLienzo()
  if (!rect || arrastreEnCurso.value) {
    cruz.value = null
    filaRaton.value = null
    return
  }
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  if (x < 0 || x >= props.layout.width) {
    cruz.value = null
    filaRaton.value = null
    return
  }
  if (y < desplazamiento.value + GANTT_METRICS.headerHeight) {
    cruz.value = null
    filaRaton.value = null
    return
  }
  const indiceDia = Math.floor(x / props.layout.pxPerDay)
  cruz.value = {
    indiceDia,
    // La linea va en el centro de la columna: asi se ve a que dia apunta.
    x: indiceDia * props.layout.pxPerDay + props.layout.pxPerDay / 2,
  }
  filaRaton.value = filaEnPunto(y)
}

/**
 * Fila del cuerpo bajo el puntero.
 *
 * La fila sale de la y del puntero sobre el lienzo, con el mismo patron que
 * el doble clic: el cuerpo va desplazado el alto de la cabecera, asi que la
 * fila 0 empieza en la y de la cabecera. Una fila que no existe (por debajo
 * del ultimo) no se resalta.
 */
function filaEnPunto(y) {
  const indice = Math.floor((y - GANTT_METRICS.headerHeight) / GANTT_ROW_HEIGHT)
  return props.layout.rows[indice] ? indice : null
}

/** El raton se va del diagrama: ni cruz ni globo ni fila resaltada. */
function alSalirRaton() {
  cruz.value = null
  barraSobre.value = null
  filaRaton.value = null
}

/**
 * Etiqueta de la cruz: el dia de la columna del puntero, en espanol corto.
 *
 * Va en la tercera banda de la cabecera (la del festivo), que es la unica
 * que no lleva el numero de semana ni el rango de fechas. El ancho se estima
 * por caracteres y la caja se recorta al lienzo, para que no se salga por los
 * extremos.
 */
const etiquetaCruz = computed(() => {
  const actual = cruz.value
  if (!actual) return null
  const dia = dateAtIndex(props.layout.start, actual.indiceDia)
  const nombreDia = weekdayNames()[(dia.getUTCDay() + 6) % 7].toLowerCase()
  const texto = `${nombreDia} ${dia.getUTCDate()} ${shortMonthName(dia.getUTCMonth() + 1)}`
  const ancho = texto.length * 6 + 16
  const x = Math.max(0, Math.min(actual.x - ancho / 2, props.layout.width - ancho))
  return { texto, ancho, x }
})

/**
 * Arrastre que acaba de confirmarse: el clic que sigue al mouseup no debe
 * abrir el detalle (mismo criterio que el arrastre del Kanban).
 */
let arrastradaRecien = false

const drag = useGanttDrag({
  pxPerDayDe: () => props.layout.pxPerDay,
  alConfirmar: (preview) => {
    arrastradaRecien = true
    emit('mover', preview)
  },
})

// El fantasma y la previsualizacion se declaran en primer nivel para que la
// plantilla los desarrole: una referencia anidada en un objeto plano no se
// desarrolla sola y el v-if quedaria siempre en true.
const fantasma = drag.fantasma
const previsualizacion = drag.previsualizacion

function alAbrirBarra(id) {
  if (arrastradaRecien) {
    arrastradaRecien = false
    return
  }
  emit('abrir', id)
}

/**
 * Banda de destino del arrastre: la fila donde cae la tarea y el rango nuevo.
 *
 * Es una banda de UNA fila, no un recuadro de todo el diagrama: solo se ve la
 * fila de la barra arrastrada. Su ancho es el del rango nuevo completo, asi
 * que al redimensionar se ve crecer o encoger segun se arrastra el asa.
 * Sin fila para la tarea (filtrada, por ejemplo) no se pinta banda.
 */
const bandaPrevisualizacion = computed(() => {
  const pre = drag.previsualizacion.value
  if (!pre) return null
  const fila = props.layout.rows.find((item) => item.barra?.taskId === pre.taskId)
  if (!fila) return null
  return {
    x: dayIndex(parseIsoDate(pre.start), props.layout.start) * props.layout.pxPerDay,
    y: fila.rowIndex * GANTT_ROW_HEIGHT,
    width: inclusiveDays(pre.start, pre.end) * props.layout.pxPerDay,
    height: GANTT_ROW_HEIGHT,
  }
})

function alDesplazar() {
  // El lienzo se mueve con el scroll: su caja en el viewport cambia.
  cajaLienzo = null
  desplazamiento.value = panelDiagrama.value ? panelDiagrama.value.scrollTop : 0
}

function alEmpezarArrastre({ barra, zona, event }) {
  // El panel es la caja del diagrama: si la soltura cae fuera, el composable
  // anula el gesto igual que con Escape (§8.5).
  cruz.value = null
  arrastrando.value = true
  window.addEventListener('mouseup', alSoltarRaton, { once: true })
  drag.empezarArrastre({ barra, zona, event, dentro: panelDiagrama })
}

/** El raton suelta: el gesto se acabo y el globo vuelve. */
function alSoltarRaton() {
  arrastrando.value = false
}

/**
 * Hay un gesto de arrastre en curso.
 *
 * El gesto empieza al agarrar la barra y se acaba al soltar; ademas, el
 * composable avisa del fantasma y de la previsualizacion. Con cualquiera de
 * las tres señales, la cruz y el globo se esconden: estorban al arrastre.
 */
const arrastreEnCurso = computed(
  () =>
    arrastrando.value ||
    drag.fantasma.value !== null ||
    drag.previsualizacion.value !== null,
)

/**
 * Datos del globo de la barra sobre la que esta el raton.
 *
 * El titulo, las fechas y el avance salen de la barra del layout; las
 * dependencias, del mapa que pasa la vista. Sin barra sobre el raton, o
 * durante un arrastre, no hay globo.
 */
const globo = computed(() => {
  if (arrastreEnCurso.value) return null
  const id = barraSobre.value
  if (id === null || id === undefined) return null
  const barra = barraPorId.value.get(id)
  if (!barra) return null
  return {
    titulo: barra.title,
    inicio: barra.startIso,
    fin: barra.endIso,
    duracion: inclusiveDays(barra.startIso, barra.endIso),
    avance: barra.progress ?? 0,
    dependencias: props.dependencias?.[id] ?? [],
  }
})

/**
 * Doble clic en el hueco del diagrama: punto de alta de tarea.
 *
 * El fondo es el propio SVG y las barras se dibujan encima: el doble clic
 * sobre una barra no crea nada, solo la barra abre el detalle (clic simple).
 * La fecha sale de la x (indice de dia desde el inicio del rango). El cuerpo
 * va desplazado el alto de la cabecera, asi que la fila sale de la y menos
 * esa cabecera: la fila 0 empieza en la y del alto de la cabecera. La cabecera
 * pegajosa tapa la banda [scroll, scroll + alto), que se descarta antes de
 * mirar la fila.
 */
function alDobleClicFondo(event) {
  const caja = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - caja.left
  const y = event.clientY - caja.top
  if (x < 0 || x >= props.layout.width) return
  if (y < desplazamiento.value + GANTT_METRICS.headerHeight) return
  const indiceDia = Math.floor(x / props.layout.pxPerDay)
  const indiceFila = Math.floor((y - GANTT_METRICS.headerHeight) / GANTT_ROW_HEIGHT)
  const fila = props.layout.rows[indiceFila]
  if (!fila || fila.type !== 'bar') return
  emit('crear', {
    dateIso: toIsoDate(addDays(parseIsoDate(props.layout.start), indiceDia)),
    fila,
  })
}
</script>

<template>
  <!--
    Tope relativo al hueco que le reserva la vista (`max-h-full`), no un tope
    fijo de pantalla: el diagrama mide lo que ocupa su contenido pero nunca
    mas que el espacio disponible, y el panel de scroll (`gantt__diagrama`)
    sigue desplazandose cuando las filas no caben.
  -->
  <div
    class="gantt relative flex max-h-full overflow-hidden rounded border border-slate-200 bg-white"
    role="group"
    aria-roledescription="diagrama de Gantt"
    aria-label="Diagrama de Gantt"
    :aria-describedby="aviso ? 'gantt-aviso' : undefined"
    data-testid="gantt-chart"
  >
    <GanttNamesColumn
      :filas="filasNombres"
      :desplazamiento="desplazamiento"
      :fila-resaltada="filaRaton"
      :fila-activa="filaActiva"
      @fila-raton="filaRaton = $event"
    />

    <div
      ref="panelDiagrama"
      class="gantt__diagrama flex-1 overflow-auto"
      data-testid="gantt-scroll"
      @scroll.passive="alDesplazar"
    >
      <!--
        Lienzo: se estira al ancho del panel por CSS (`width: 100%`) y el
        `min-width` del elemento impide que baje del ancho del rango. Asi el
        panel se llena siempre y, cuando el rango es mas ancho, el scroll
        horizontal sigue mostrando todo el contenido.
      -->
      <svg
        ref="lienzo"
        class="gantt__svg block"
        :width="layout.width"
        :style="{ minWidth: `${layout.width}px` }"
        :height="altoTotal"
        role="group"
        aria-labelledby="gantt-titulo"
        aria-describedby="gantt-descripcion gantt-instrucciones"
        data-testid="gantt-svg"
        @dblclick="alDobleClicFondo"
        @mousemove="alMoverRaton"
        @mouseleave="alSalirRaton"
      >
        <title id="gantt-titulo">Diagrama de Gantt</title>
        <desc id="gantt-descripcion">{{ descripcion }}</desc>

        <!-- Punta de flecha de los vinculos precedes; los relates no llevan. -->
        <defs>
          <marker
            id="gantt-punta"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path class="gantt__punta" d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>

        <!-- Fondo del lienzo: neutro, hasta el borde del lienzo. -->
        <rect class="gantt__lienzo" x="0" y="0" width="100%" :height="altoTotal" aria-hidden="true" />

        <!-- Rejilla vertical: una linea por tick del eje. Decorativa. -->
        <g class="gantt__rejilla" aria-hidden="true">
          <line
            v-for="tick in layout.axis.ticks"
            :key="tick.x"
            class="gantt__rejilla-linea"
            :x1="tick.x"
            :x2="tick.x"
            y1="0"
            :y2="altoTotal"
            stroke-width="1"
          />
          <!--
            Lineas secundarias: dias dentro de la semana (escala de semana) y
            semanas dentro del mes (escala de mes). Mas claras que las del
            limite de celda, para que la rejilla se lea de un vistazo.
          -->
          <line
            v-for="subtick in layout.axis.subticks"
            :key="`sub-${subtick.x}`"
            class="gantt__rejilla-linea-fina"
            :x1="subtick.x"
            :x2="subtick.x"
            y1="0"
            :y2="altoTotal"
            stroke-width="1"
          />
          <!-- Borde derecho: cierra la rejilla en el ultimo pixel del lienzo. -->
          <rect
            class="gantt__rejilla-borde"
            x="100%"
            y="0"
            width="1"
            :height="altoTotal"
            transform="translate(-1, 0)"
            pointer-events="none"
          />
        </g>

        <!-- Bandas de fin de semana y de dia no laborable global. -->
        <g class="gantt__bandas" aria-hidden="true">
          <rect
            v-for="banda in bandas"
            :key="`${banda.kind}-${banda.x}`"
            :class="claseDeBanda(banda.kind)"
            :x="banda.x"
            y="0"
            :width="banda.width"
            :height="altoTotal"
          />
        </g>

        <!-- Cuerpo: grupos, barras y linea de hoy. Sube con el scroll nativo.
             Va desplazado el alto de la cabecera, para que la fila 0 quede
             debajo de la cabecera pegajosa y no debajo de ella. -->
        <g class="gantt__cuerpo" :transform="`translate(0, ${GANTT_METRICS.headerHeight})`">
          <!--
            Bandas de fila resaltada: la de la fila enfocada y la de la fila
            bajo el puntero. Van detras de las barras, que se leen encima, y
            no capturan el puntero. Son decorativas: el estado de la barra
            enfocada ya lo anuncia su `aria-current`.
          -->
          <rect
            v-if="bandasFila.activa"
            class="gantt__fila-activa"
            x="0"
            :y="bandasFila.activa.y"
            width="100%"
            :height="GANTT_ROW_HEIGHT"
            aria-hidden="true"
          />
          <rect
            v-if="bandasFila.raton"
            class="gantt__fila-resaltada"
            x="0"
            :y="bandasFila.raton.y"
            width="100%"
            :height="GANTT_ROW_HEIGHT"
            aria-hidden="true"
          />

          <!--
            Banda de destino del arrastre: la FILA donde cae la tarea, con el
            ancho del rango nuevo. Se dibuja antes de las barras, para que se
            lean encima.
          -->
          <rect
            v-if="bandaPrevisualizacion"
            class="gantt__banda-arrastre"
            :x="bandaPrevisualizacion.x"
            :y="bandaPrevisualizacion.y"
            :width="bandaPrevisualizacion.width"
            :height="bandaPrevisualizacion.height"
            data-testid="gantt-drag-preview"
          />

          <template v-for="fila in layout.rows" :key="fila.rowIndex">
            <GanttGroupRow
              v-if="fila.type === 'group'"
              :grupo="fila"
              :y="fila.rowIndex * GANTT_ROW_HEIGHT"
              ancho="100%"
            />

            <GanttBar
              v-else
              :barra="fila.barra"
              :y="fila.rowIndex * GANTT_ROW_HEIGHT"
              :editable="editableDe(fila.barra.taskId)"
              :seleccionada="barraEnfocada === fila.barra.taskId"
              :previsualizada="previsualizacion && previsualizacion.taskId === fila.barra.taskId"
              :etiqueta-aria="etiquetaDe(fila.barra.taskId)"
              :viola="fila.barra.violates === true"
              @empezar-arrastrar="alEmpezarArrastre"
              @abrir="alAbrirBarra"
              @seleccionar="(id) => emit('seleccionar', id)"
              @tecla="(event, id) => emit('tecla', event, id)"
              @entrar="barraSobre = $event"
              @salir="barraSobre = null"
            />
          </template>

          <!-- Linea de hoy: 2 px, en el dia exacto. -->
          <line
            v-if="layout.todayIndex !== null"
            class="gantt__hoy"
            :x1="layout.todayIndex * layout.pxPerDay"
            :x2="layout.todayIndex * layout.pxPerDay"
            y1="0"
            :y2="layout.rows.length * GANTT_ROW_HEIGHT"
            stroke-width="2"
            aria-hidden="true"
          />

          <!-- Flechas de dependencias, encima de las barras: no capturan el
               puntero para no estorbar el arrastre. -->
          <g class="gantt__flechas" aria-hidden="true">
            <polyline
              v-for="flecha in flechas"
              :key="`dep-${flecha.depends_on_id}-${flecha.task_id}`"
              class="gantt__flecha"
              :points="flecha.puntos.map(([x, y]) => `${x},${y}`).join(' ')"
              stroke-width="1.5"
              :stroke-dasharray="flecha.conPunta ? undefined : '5 4'"
              :marker-end="flecha.conPunta ? 'url(#gantt-punta)' : undefined"
              :data-testid="`gantt-dependency-${flecha.depends_on_id}-${flecha.task_id}`"
            />
          </g>

          <!--
            Cruz de fecha: la columna del puntero, por encima de las barras.
            Decorativa: no captura el puntero ni estorba al arrastre.
          -->
          <g class="gantt__cruz" aria-hidden="true" pointer-events="none">
            <line
              v-if="cruz"
              :x1="cruz.x"
              :x2="cruz.x"
              y1="0"
              :y2="layout.rows.length * GANTT_ROW_HEIGHT"
              stroke-width="1"
            />
          </g>
        </g>

        <!-- Eje: se contratraslada para quedar clavado arriba. -->
        <g class="gantt__eje" :transform="`translate(0, ${desplazamiento})`">
          <GanttAxis
            :columnas="columnas"
            :bandas-cabecera="bandasCabecera"
            ancho="100%"
            :alto="GANTT_METRICS.headerHeight"
          />

          <!--
            Fecha de la cruz: en la tercera banda de la cabecera, la del
            festivo, para no tapar ni el numero de semana ni el rango de
            fechas. La caja se recorta al lienzo en los extremos.
          -->
          <g v-if="etiquetaCruz" class="gantt__cruz-etiqueta" aria-hidden="true">
            <rect
              class="gantt__cruz-caja"
              :x="etiquetaCruz.x"
              y="42"
              :width="etiquetaCruz.ancho"
              height="18"
              rx="4"
            />
            <text class="gantt__cruz-fecha" :x="etiquetaCruz.x + 8" y="55">
              {{ etiquetaCruz.texto }}
            </text>
          </g>
        </g>
      </svg>
    </div>

    <!-- Fantasma del arrastre: mismo patron que el del Kanban. -->
    <div
      v-if="fantasma"
      class="pointer-events-none fixed z-50 flex h-6 select-none items-center gap-1.5 rounded border border-siemens-500 bg-white pl-1.5 pr-2 shadow-lg"
      :style="{ left: `${fantasma.x}px`, top: `${fantasma.y}px` }"
      data-testid="gantt-drag-ghost"
    >
      <span class="h-4 w-1 shrink-0 rounded-sm" :style="{ backgroundColor: fantasma.color }" />
      <span class="text-[11px] font-medium text-slate-900">{{ fantasma.etiqueta }}</span>
      <span class="rounded bg-siemens-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {{ fantasma.rango }}
      </span>
    </div>

    <!-- Globo de la barra sobre la que esta el raton: mismo patron que el fantasma. -->
    <GanttTooltip :datos="globo" :x="puntero.x" :y="puntero.y" />
  </div>

  <p v-if="aviso" id="gantt-aviso" class="sr-only">{{ aviso }}</p>
  <p id="gantt-instrucciones" class="sr-only">
    Con las flechas izquierda y derecha se mueve la barra un dia, o una semana o un mes segun la
    escala; con Mayus y flechas se recorta o se alarga el extremo final; con Intro se abre el
    detalle de la tarea y con Escape se anula el arrastre.
  </p>
</template>
