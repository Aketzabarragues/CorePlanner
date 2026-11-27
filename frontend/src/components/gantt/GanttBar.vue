<script setup>
/**
 * Barra de tarea del diagrama de Gantt.
 *
 * Es una raiz <g> y el elemento interactivo del diagrama: recibe el foco
 * (roving tabindex, lo gestiona el chart) y se opera con el raton y con el
 * teclado. La posicion va por `transform`, nunca por `x`/`y`: los atributos
 * SVG no se transicionan y la barra debe caer en su sitio al soltar.
 *
 * El arrastre lo gestiona el composable del chart: la barra solo emite
 * `empezar-arrastre` con la zona donde se ha agarrado (cuerpo o asa) y deja
 * al composable el resto.
 *
 * El clic derecho pide el menu contextual de la tarea: la barra emite
 * `contexto` con la tarea, el puntero y el elemento que lo abrio, y el chart
 * lo sube a la vista.
 *
 * El raton que pasa por encima se anuncia con `entrar` y `salir`: el chart
 * dibuja con ello el globo de datos de la tarea.
 *
 * Vocabulario de la barra (que distingue una barra de otra):
 * - el COLOR es el del proyecto (pastel con borde izquierdo a color):
 *   dato guardado;
 * - el CONTORNO DISCONTINUO es del proyecto provisional (`--provisional`);
 * - el TRIANGULO es de la violacion de una dependencia (el `polygon` de
 *   abajo), y el motivo va en el `aria-label`;
 * - el MARCO es de la ruta critica (el `rect` de abajo), y la cadena se
 *   anuncia en el `aria-label`.
 * Ninguno de los cuatro se transmite solo por color: los tres ultimos
 * cambian de forma.
 */
import { computed } from 'vue'

import { GANTT_METRICS } from '../../utils/ganttMetrics'
import { conBlanco, pildora } from '../../utils/statusColor'

const props = defineProps({
  /** Barra del layout: { taskId, x, width, label, title, color, status,
   *  startIso, endIso, assignedName }. */
  barra: { type: Object, required: true },
  /** Y de la fila, en pixeles: el offset `yPos` de la fila. */
  y: { type: Number, required: true },
  /** Alto de la fila, en pixeles: centra la barra en su fila. */
  altoFila: { type: Number, default: 40 },
  /** Si la persona que entra puede escribir en el proyecto de la barra. */
  editable: { type: Boolean, default: false },
  /** Barra enfocada: lleva el tabindex y el borde de seleccion. */
  seleccionada: { type: Boolean, default: false },
  /** Barra que se esta previsualizando: baja a 60 % y no se toca. */
  previsualizada: { type: Boolean, default: false },
  /** Etiqueta aria completa: titulo, persona, fechas, avance, estado. */
  etiquetaAria: { type: String, required: true },
  /** Viola una dependencia: empieza antes de que termine su requisito. */
  viola: { type: Boolean, default: false },
  /** La tarea es de la ruta critica: lleva el marco de la cadena. */
  critica: { type: Boolean, default: false },
})

const emit = defineEmits([
  'empezar-arrastrar',
  'abrir',
  'seleccionar',
  'tecla',
  'entrar',
  'salir',
  'contexto',
])

/** Ancho minimo de barra, para que una tarea de un dia siga siendo agarrable. */
const anchoBarra = computed(() => Math.max(6, props.barra.width))

/** La etiqueta solo sale si cabe: el recorte no es un segundo nivel de aviso. */
const mostrarEtiqueta = computed(() => anchoBarra.value >= GANTT_METRICS.labelMinWidth)

/**
 * Id del clip de la etiqueta, unico por barra.
 *
 * Dos barras con el mismo id de clip se pisarian en el recorte: el id lleva el
 * identificador de la tarea, que es unico dentro del diagrama.
 */
const clipId = computed(() => `gantt-bar-clip-${props.barra.taskId}`)

/**
 * Fondo del cuerpo: el color del proyecto (dato del backend) mezclado con
 * blanco al 12 %, como la barra del calendario. Sin color de proyecto, o en
 * el provisional (que no esta firmado y se lee por el contorno, no por el
 * color), no hay relleno que decidir: el cuerpo se queda a la clase.
 */
const fondoBarra = computed(() => {
  if (props.barra.provisional === true) return null
  return props.barra.projectColor ? conBlanco(props.barra.projectColor, 0.12) : null
})

/**
 * Color del texto sobre el fondo pastel: el color del proyecto oscurecido
 * hasta el contraste de 4.5:1 contra ese pastel (`pildora` hace la matematica
 * con el mismo fondo que se pinta). Sin pastel no hay decision que tomar: se
 * queda el texto de la clase.
 */
const colorTexto = computed(() =>
  props.barra.projectColor && props.barra.provisional !== true
    ? pildora(props.barra.projectColor).color
    : null,
)

/**
 * El porcentaje se lee solo si cabe a la derecha sin pisar la etiqueta: el
 * ancho minimo es mayor que el de la etiqueta para que nunca compitan.
 */
const mostrarPorcentaje = computed(
  () => anchoBarra.value > 95 && props.barra.progress > 0,
)

/**
 * Ancho del clip de la etiqueta: el de la barra, menos la reserva del
 * porcentaje cuando este se dibuja, para que el recorte de la etiqueta no
 * llegue hasta el porcentaje.
 */
const anchoClip = computed(() =>
  mostrarPorcentaje.value
    ? anchoBarra.value - GANTT_METRICS.porcentajeReserva
    : anchoBarra.value,
)

/** Y de la barra dentro de la fila: centrada, porque el alto de la fila
 *  varia (tarea 40 px, grupo 36 px) y la barra siempre mide 24 px. */
const yOffset = computed(
  () => props.y + (props.altoFila - GANTT_METRICS.barHeight) / 2,
)

/** Zona sensible del asa: el resto del cuerpo es la barra. */
function zonaDe(event) {
  if (!props.editable) return 'body'
  const caja = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - caja.left
  if (x <= GANTT_METRICS.handleWidth) return 'start'
  if (x >= anchoBarra.value - GANTT_METRICS.handleWidth) return 'end'
  return 'body'
}

function empezarArrastre(event) {
  // Solo el boton izquierdo arrastra: el derecho abre el menu contextual y no
  // puede quedar cancelado, porque eso anularia el menu del navegador.
  if (event.button !== 0) return
  if (!props.editable) return
  event.preventDefault()
  emit('empezar-arrastrar', { barra: props.barra, zona: zonaDe(event), event })
}

/**
 * Clic derecho en la barra: pide el menu contextual de la tarea.
 *
 * El menu del navegador se anula y el evento no sube al diagrama: el hueco
 * que hay alrededor de la barra no es su contexto. El elemento que lo abrio
 * viaja con el aviso, para que el foco vuelva a la barra al cerrarse.
 */
function alMenuContexto(event) {
  event.preventDefault()
  event.stopPropagation()
  emit('contexto', {
    taskId: props.barra.taskId,
    x: event.clientX,
    y: event.clientY,
    abridor: event.currentTarget,
  })
}
</script>

<template>
  <g
    class="gantt__barra"
    role="button"
    data-testid="gantt-bar"
    :data-task-id="barra.taskId"
    :tabindex="seleccionada ? 0 : -1"
    :aria-label="etiquetaAria"
    :aria-disabled="editable ? undefined : 'true'"
    :aria-current="seleccionada ? 'true' : undefined"
    aria-describedby="gantt-instrucciones"
    :transform="`translate(${barra.x}, ${yOffset})`"
    :class="[
      barra.color,
      {
        'gantt__barra--previsualizada': previsualizada,
        'gantt__barra--solo-lectura': !editable,
        'gantt__barra--provisional': barra.provisional === true,
      },
    ]"
    @mousedown="empezarArrastre"
    @click="emit('abrir', barra.taskId)"
    @dblclick.stop
    @contextmenu="alMenuContexto"
    @focus="emit('seleccionar', barra.taskId)"
    @keydown="emit('tecla', $event, barra.taskId)"
    @mouseenter="emit('entrar', barra.taskId)"
    @mouseleave="emit('salir')"
  >
    <!--
      Cuerpo: fondo pastel del color del proyecto (12 %, como el
      calendario). El relleno por defecto lo da gantt.css (gris de reserva
      o blanco punteado del provisional); el pastel va en estilo en linea
      porque el color es dato del backend.
    -->
    <rect
      class="gantt__barra-cuerpo"
      :width="anchoBarra"
      :height="GANTT_METRICS.barHeight"
      :rx="GANTT_METRICS.barRadius"
      :style="fondoBarra ? { fill: fondoBarra } : undefined"
    />

    <!-- Borde izquierdo: el color del proyecto tal cual, 3 px. -->
    <rect
      v-if="fondoBarra"
      class="gantt__barra-borde"
      :width="3"
      :height="GANTT_METRICS.barHeight"
      :rx="1.5"
      :style="{ fill: barra.projectColor }"
      aria-hidden="true"
    />

    <!--
      Avance: el color del proyecto al 10 % sobre el pastel (el fill inline
      lo pinta a color y el `fill-opacity` baja la capa). Sin color de
      proyecto (provisional) se queda al gris oscuro de gantt.css.
    -->
    <rect
      v-if="barra.progress > 0"
      class="gantt__barra-avance"
      :width="anchoBarra * (barra.progress / 100)"
      :height="GANTT_METRICS.barHeight"
      :rx="GANTT_METRICS.barRadius"
      :fill-opacity="fondoBarra ? 0.1 : undefined"
      :style="fondoBarra ? { fill: barra.projectColor } : undefined"
    />

    <!--
      Marca de la ruta critica: un marco solido alrededor del cuerpo de la
      barra. Distingue por forma (un marco, no un color) y no se confunde con
      el triangulo de la violacion, que va en la esquina, ni con el contorno
      discontinuo del provisional, que va justo sobre el borde del cuerpo.
    -->
    <rect
      v-if="critica"
      class="gantt__barra-critica"
      x="-3"
      y="-3"
      :width="anchoBarra + 6"
      :height="GANTT_METRICS.barHeight + 6"
      :rx="GANTT_METRICS.barRadius + 3"
      stroke-width="2"
      aria-hidden="true"
      data-testid="gantt-bar-critical"
    />

    <!--
      Etiqueta: solo si cabe entera y recortada al ancho de la barra: la cola
      del titulo no puede salirse. El clip vive en el <g> de la barra y su id
      es unico por barra (ver clipId), para que dos barras no se recorten con
      el mismo rect. Con porcentaje visible el clip descuenta su reserva, para
      que el recorte de la etiqueta no llegue hasta el porcentaje.
    -->
    <g v-if="mostrarEtiqueta">
      <clipPath :id="clipId">
        <rect :width="anchoClip" :height="GANTT_METRICS.barHeight" />
      </clipPath>
      <text
        :x="GANTT_METRICS.labelPadding"
        :y="GANTT_METRICS.barHeight / 2 + 4"
        :clip-path="`url(#${clipId})`"
        :style="colorTexto ? { fill: colorTexto } : undefined"
        class="gantt__barra-etiqueta"
        pointer-events="none"
      >{{ barra.label }}</text>
      <!--
        Porcentaje: solo si cabe a la derecha (ancho > 95 px y avance > 0).
        Mismo clip que la etiqueta para no salirse de la barra.
      -->
      <text
        v-if="mostrarPorcentaje"
        :x="anchoBarra - GANTT_METRICS.labelPadding"
        :y="GANTT_METRICS.barHeight / 2 + 4"
        :clip-path="`url(#${clipId})`"
        :style="colorTexto ? { fill: colorTexto } : undefined"
        class="gantt__barra-porcentaje"
        text-anchor="end"
        pointer-events="none"
      >{{ barra.progress }}%</text>
    </g>

    <!-- Marca de violacion: triangulo en la esquina superior derecha, dentro
         de la barra. Distingue por forma, no por color; el motivo va en la
         aria-label. -->
    <polygon
      v-if="viola"
      class="gantt__barra-violacion"
      points="10,1 20,1 15,10"
      :transform="`translate(${anchoBarra - 21} 0)`"
      stroke-width="1"
      aria-hidden="true"
      data-testid="gantt-bar-violation"
    />

    <!-- Asas de redimension: solo con permiso. El teclado usa Mayús+arriba/
         abajo, que toca el extremo final. -->
    <rect
      v-if="editable"
      class="gantt__asa gantt__asa--inicio"
      x="0"
      :width="GANTT_METRICS.handleWidth"
      :height="GANTT_METRICS.barHeight"
      style="cursor: ew-resize"
      aria-hidden="true"
      data-testid="gantt-handle-start"
    />
    <rect
      v-if="editable"
      class="gantt__asa gantt__asa--fin"
      :x="anchoBarra - GANTT_METRICS.handleWidth"
      :width="GANTT_METRICS.handleWidth"
      :height="GANTT_METRICS.barHeight"
      style="cursor: ew-resize"
      aria-hidden="true"
      data-testid="gantt-handle-end"
    />
  </g>
</template>
