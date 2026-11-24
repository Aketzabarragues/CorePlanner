<script setup>
/**
 * Columna de nombres del diagrama de Gantt.
 *
 * Es la lista de tareas, no de personas: el titulo de la tarea y debajo
 * `persona · proyecto`. La barra ya va coloreada por persona; repetir el
 * nombre en cada fila seria ruido, asi que la columna de persona es
 * opcional, como las demas que se pueden elegir.
 *
 * El panel es una rejilla: la columna de la tarea (la que flexa y la que se
 * puede redimensionar) y, a su derecha, las columnas elegidas, cada una con su
 * ancho fijo. Cuando no caben, el panel se desplaza en horizontal.
 *
 * La columna no hace scroll vertical propio: su pista interior se traslada
 * con el mismo desplazamiento que el diagrama, para que fila y barra no se
 * despeguen. Las filas de tarea son la version HTML de lo que el SVG ya
 * anuncia, asi que van `aria-hidden`; la cabecera de grupo si se expone,
 * porque es un boton que colapsa el grupo. La cabecera de columnas se expone
 * tambien: sus botones ordenan las tareas.
 *
 * La columna es la otra mitad de la fila: avisa de la fila bajo el puntero
 * (`fila-raton`) y recibe que filas hay que pintar (la del puntero y la de la
 * barra enfocada). El estado lo lleva el chart, que es quien tiene las
 * dos mitades del diagrama.
 *
 * El ancho es redimensionable: un asa en el borde derecho lo cambia, con el
 * raton o con el teclado. El ancho elegido lo guarda el chart; mientras
 * nadie lo toca, la columna conserva el ancho de sus clases (240 px, o
 * 160 px en pantalla estrecha).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { GANTT_METRICS } from '../../utils/ganttMetrics'
import AppIcon from '../AppIcon.vue'

const props = defineProps({
  /** Filas del layout, ya enriquecidas: [{ type, rowIndex, ... }]. */
  filas: { type: Array, required: true },
  /** Desplazamiento vertical del diagrama, en pixeles. */
  desplazamiento: { type: Number, default: 0 },
  /** Fila bajo el puntero: la que se pinta como resaltada. */
  filaResaltada: { type: Number, default: null },
  /** Fila de la barra enfocada: se marca aunque el puntero este en otra. */
  filaActiva: { type: Number, default: null },
  /** Ancho elegido por la persona: null = el que dan las clases. */
  ancho: { type: Number, default: null },
  /** Ancho minimo y maximo de la columna, en pixeles. */
  minimo: { type: Number, default: GANTT_METRICS.namesWidthSmall },
  maximo: { type: Number, default: 480 },
  /** Columnas elegidas, con su etiqueta y su ancho. */
  columnas: { type: Array, default: () => [] },
  /** Ordenacion vigente: { columna, sentido }. */
  orden: { type: Object, default: null },
})

const emit = defineEmits(['fila-raton', 'redimension', 'colapsar', 'ordenar', 'contexto'])

/** Raiz de la columna: su ancho es el que se mide. */
const raiz = ref(null)
/** Cabecera de columnas: de su primera celda se mide el ancho de la de tareas. */
const cabecera = ref(null)
/**
 * Ancho efectivo de la columna de tareas, medido.
 *
 * Solo importa mientras nadie redimensiona: es el ancho que dan las clases
 * (240 px, o 160 px en pantalla estrecha) y el punto de partida del arrastre.
 */
const anchoMedido = ref(GANTT_METRICS.namesWidth)

/** Ancho con el que se trabaja: el elegido o, si no hay, el medido. */
const anchoEfectivo = computed(() => props.ancho ?? anchoMedido.value)

/** Ancho que se anuncia en el asa: siempre en pixeles enteros. */
const anchoAnunciado = computed(() => Math.round(anchoEfectivo.value))

/** Columnas elegidas, tal y como llegan. */
const elegidas = computed(() => props.columnas ?? [])

/** Ancho que suman las columnas elegidas, en pixeles. */
const anchoExtras = computed(() =>
  elegidas.value.reduce((suma, columna) => suma + (columna.ancho ?? 0), 0),
)

/**
 * Ancho de la columna de nombres: la de tareas mas las elegidas.
 *
 * El ancho elegido se aplica a la columna de tareas; las elegidas van a su
 * derecha con su ancho fijo. Con `null` (nadie ha redimensionado) el ancho lo
 * dan las clases, y el de las elegibles se anade por CSS.
 */
const estiloRaiz = computed(() => {
  const extras = anchoExtras.value
  const estilo = {}
  if (extras > 0) estilo['--gantt-ancho-extras'] = `${extras}px`
  if (props.ancho !== null) {
    estilo.width = `${props.ancho + extras}px`
    estilo['--gantt-ancho-tarea'] = `${props.ancho}px`
  }
  return Object.keys(estilo).length ? estilo : undefined
})

/**
 * Pistas de la rejilla: la de tareas flexa, las elegibles tienen ancho fijo.
 *
 * La misma plantilla va en la cabecera y en las filas: por eso las columnas
 * cuadran entre si.
 */
const plantillaColumnas = computed(() => {
  const pistas = ['minmax(0, 1fr)']
  for (const columna of elegidas.value) pistas.push(`${columna.ancho ?? 0}px`)
  return pistas.join(' ')
})

/** Cabeceras de la rejilla: la de la tarea y las de las elegidas. */
const encabezados = computed(() => [
  { key: 'tarea', label: 'Tarea' },
  ...elegidas.value,
])

/** Sentido de la ordenacion de una columna: `asc`, `desc` o null. */
function sentidoDe(clave) {
  if (props.orden?.columna !== clave) return null
  return props.orden.sentido
}

/** `aria-sort` de la cabecera de una columna. */
function ariaSortDe(clave) {
  const sentido = sentidoDe(clave)
  if (sentido === 'asc') return 'ascending'
  if (sentido === 'desc') return 'descending'
  return 'none'
}

/** Padding de la cabecera: el de la columna de tareas o el de las elegibles. */
function claseDeCabecera(clave) {
  return clave === 'tarea' ? 'px-3' : 'px-2'
}

/** Lo que anuncia el boton de la cabecera: que va a ordenar y como. */
function tituloDeOrden(clave) {
  const sentido = sentidoDe(clave)
  if (sentido === 'asc') return 'Ordenar por esta columna, de forma descendente'
  if (sentido === 'desc') return 'Quitar la ordenacion'
  return 'Ordenar por esta columna, de forma ascendente'
}

/**
 * Tinte de la fila: el del puntero y el de la barra enfocada.
 *
 * Los dos tintes son los del diagrama (`gantt.css`): la fila se lee igual en
 * las dos mitades. Con el puntero sobre la fila enfocada solo se pinta el
 * tinte de la enfocada, que es mas marcado.
 */
function claseDeFila(fila) {
  return {
    'gantt__nombre-fila--activa': props.filaActiva === fila.rowIndex,
    'gantt__nombre-fila--resaltada':
      props.filaResaltada === fila.rowIndex && props.filaResaltada !== props.filaActiva,
  }
}

/** El puntero entra en una fila: el chart la resalta en las dos mitades. */
function alEntrar(fila) {
  emit('fila-raton', fila.rowIndex)
}

/** El puntero se va: no queda ninguna fila resaltada por raton. */
function alSalir() {
  emit('fila-raton', null)
}

/**
 * Clic derecho en la cabecera de un grupo: pide el menu contextual del grupo.
 *
 * El menu del navegador se anula y el elemento que lo abrio viaja con el
 * aviso, para que el foco vuelva a la cabecera al cerrarse.
 */
function alMenuContexto(event, fila) {
  event.preventDefault()
  emit('contexto', {
    tipo: 'grupo',
    clave: fila.clave,
    x: event.clientX,
    y: event.clientY,
    abridor: event.currentTarget,
  })
}

/* ------------------------------------------------------------------ */
/* Ancho redimensionable                                               */
/* ------------------------------------------------------------------ */

/** Paso de las flechas del teclado: 16 px; con Mayus, de golpe mas. */
const PASO = 16
const PASO_GRANDE = 64

/** El asa esta agarrada: el ancho sigue al puntero. */
const arrastrando = ref(false)
/** Puntero y ancho en el momento de agarrar el asa. */
let inicioX = 0
let anchoInicial = 0

/**
 * Agarrar el asa: el ancho sigue al puntero a partir del ancho vigente.
 *
 * El puntero queda capturado en el asa, asi que el gesto sigue aunque el
 * raton se salga de la columna. El ancho inicial es el efectivo: el elegido
 * si la columna se redimensiono antes, el medido si no.
 */
function alAgarrar(event) {
  if (event.button !== undefined && event.button !== 0) return
  event.preventDefault()
  arrastrando.value = true
  inicioX = event.clientX
  anchoInicial = anchoEfectivo.value
  event.currentTarget?.setPointerCapture?.(event.pointerId)
}

/** Arrastrar el asa: el ancho pedido es el inicial mas el desplazamiento. */
function alArrastrar(event) {
  if (!arrastrando.value) return
  emit('redimension', anchoInicial + (event.clientX - inicioX))
}

/** Soltar el asa: el gesto se acaba. */
function alSoltar(event) {
  if (!arrastrando.value) return
  arrastrando.value = false
  const asa = event.currentTarget
  if (asa?.hasPointerCapture?.(event.pointerId)) asa.releasePointerCapture(event.pointerId)
}

/**
 * Teclado del asa: las flechas cambian el ancho, con Mayus de golpe mas.
 *
 * `Home` y `End` van a los limites. El ancho pedido lo acota el chart, que
 * es quien guarda el valor.
 */
function alTecla(event) {
  let ancho = null
  if (event.key === 'ArrowLeft') {
    ancho = anchoEfectivo.value - (event.shiftKey ? PASO_GRANDE : PASO)
  } else if (event.key === 'ArrowRight') {
    ancho = anchoEfectivo.value + (event.shiftKey ? PASO_GRANDE : PASO)
  } else if (event.key === 'Home') {
    ancho = props.minimo
  } else if (event.key === 'End') {
    ancho = props.maximo
  }
  if (ancho === null) return
  event.preventDefault()
  emit('redimension', ancho)
}

/* ------------------------------------------------------------------ */
/* Medida del ancho por defecto                                        */
/* ------------------------------------------------------------------ */

let observador = null

/**
 * Ancho real de la columna de tareas: el de sus clases mientras nadie lo
 * cambie.
 *
 * Se mide la celda de la cabecera de tareas y no la raiz: la raiz lleva
 * tambien las columnas elegidas, que no forman parte del ancho que se
 * redimensiona.
 */
function medir() {
  const ancho = cabecera.value?.firstElementChild?.clientWidth
  if (ancho) anchoMedido.value = ancho
}

onMounted(() => {
  medir()
  // Sin `ResizeObserver` (por ejemplo en jsdom) el ancho se queda en el que
  // se midio al montar: no se rompe nada por no poder observar.
  if (typeof ResizeObserver === 'undefined') return
  observador = new ResizeObserver(medir)
  if (cabecera.value) observador.observe(cabecera.value)
})

onBeforeUnmount(() => {
  observador?.disconnect()
  observador = null
})
</script>

<template>
  <div
    ref="raiz"
    class="gantt__nombres relative shrink-0 border-r border-slate-200"
    :style="estiloRaiz"
    data-testid="gantt-names"
    @mouseleave="alSalir"
  >
    <!--
      La cabecera reserva el mismo alto que la del eje (`GANTT_METRICS`): el
      numero es el unico, las dos piezas no se descuadran. Cada cabecera de
      columna es un boton que ordena: el sentido lo dice `aria-sort`.
    -->
    <div
      ref="cabecera"
      class="gantt__nombres-cabecera grid border-b border-slate-200 bg-slate-100"
      :style="{
        height: `${GANTT_METRICS.headerHeight}px`,
        gridTemplateColumns: plantillaColumnas,
      }"
    >
      <button
        v-for="columna in encabezados"
        :key="columna.key"
        type="button"
        class="flex items-center gap-1 text-left text-xs font-semibold text-siemens-900 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-siemens-500"
        :class="claseDeCabecera(columna.key)"
        :aria-sort="ariaSortDe(columna.key)"
        :title="tituloDeOrden(columna.key)"
        :data-testid="`gantt-sort-${columna.key}`"
        @click="emit('ordenar', columna.key)"
      >
        <span class="truncate">{{ columna.label }}</span>
        <span v-if="sentidoDe(columna.key)" aria-hidden="true" class="text-[10px]">
          {{ sentidoDe(columna.key) === 'asc' ? '↑' : '↓' }}
        </span>
      </button>
    </div>

    <div class="gantt__nombres-cuerpo overflow-hidden">
      <div
        class="gantt__nombres-pista"
        :style="{ transform: `translateY(${-desplazamiento}px)` }"
      >
        <!-- Una fila por entrada del layout, en el orden del diagrama. -->
        <template v-for="fila in filas" :key="fila.rowIndex">
          <!--
            Fila de grupo: la cabecera del grupo es un boton que lo colapsa o
            lo despliega. El estado vive en la URL y la vista lo decide; aqui
            solo se avisa de la pulsacion con la clave del grupo.
          -->
          <button
            v-if="fila.type === 'group'"
            type="button"
            class="flex h-9 w-full items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3 text-left hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-siemens-500"
            :class="claseDeFila(fila)"
            :aria-expanded="!fila.colapsado"
            :title="fila.colapsado ? 'Expandir grupo' : 'Colapsar grupo'"
            :data-testid="`gantt-group-toggle-${fila.clave}`"
            @click="emit('colapsar', fila.clave)"
            @contextmenu="alMenuContexto($event, fila)"
            @mouseenter="alEntrar(fila)"
            @mouseleave="alSalir"
          >
            <span
              class="h-3 w-3 shrink-0 text-slate-500 transition-transform"
              :class="fila.colapsado ? '' : 'rotate-90'"
            >
              <AppIcon name="chevronRight" />
            </span>
            <span
              v-if="fila.color || fila.colorClass"
              class="h-4 w-1 shrink-0 rounded-full"
              :class="fila.colorClass"
              :style="fila.color ? { backgroundColor: fila.color } : undefined"
            />
            <span class="truncate text-[13px] font-semibold text-siemens-900">
              {{ fila.label }}
            </span>
          </button>

          <!--
            Fila de tarea: el titulo y la persona con el proyecto, y el valor
            de cada columna elegida. Es la version HTML de lo que el SVG ya
            anuncia, asi que el lector de pantalla no la oye: solo la cabecera
            de grupo y las cabeceras de columna, que son botones.
          -->
          <div
            v-else
            aria-hidden="true"
            class="grid h-9 items-center border-b border-slate-100"
            :class="claseDeFila(fila)"
            :style="{ gridTemplateColumns: plantillaColumnas }"
            @mouseenter="alEntrar(fila)"
            @mouseleave="alSalir"
          >
            <div class="flex min-w-0 flex-col justify-center px-3">
              <span class="truncate text-xs font-medium text-slate-700" :title="fila.title">
                {{ fila.title }}
              </span>
              <span class="truncate text-[10px] text-slate-400">
                {{ fila.assignedName ?? 'Sin asignar' }} · {{ fila.projectName }}
              </span>
            </div>
            <span
              v-for="columna in elegidas"
              :key="columna.key"
              class="truncate px-2 text-[11px] text-slate-600"
              :title="fila.celdas?.[columna.key]"
              :data-testid="`gantt-celda-${columna.key}`"
            >
              {{ fila.celdas?.[columna.key] }}
            </span>
          </div>
        </template>
      </div>
    </div>

    <!--
      Asa de redimension: separa la columna de nombres del diagrama. Es un
      separador con valor (el ancho), asi que el teclado tambien la mueve:
      las flechas cambian el ancho y `Home` y `End` van a los limites.
    -->
    <div
      role="separator"
      aria-orientation="vertical"
      :aria-valuenow="anchoAnunciado"
      :aria-valuemin="minimo"
      :aria-valuemax="maximo"
      aria-label="Ancho de la columna de tareas"
      tabindex="0"
      class="group absolute inset-y-0 right-0 z-10 w-2 -translate-x-1/2 cursor-col-resize touch-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-siemens-500"
      data-testid="gantt-names-handle"
      @pointerdown="alAgarrar"
      @pointermove="alArrastrar"
      @pointerup="alSoltar"
      @pointercancel="alSoltar"
      @keydown="alTecla"
    >
      <span
        class="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-300 transition-colors group-hover:bg-siemens-500"
      />
    </div>
  </div>
</template>
