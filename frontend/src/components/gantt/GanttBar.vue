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
 * El raton que pasa por encima se anuncia con `entrar` y `salir`: el chart
 * dibuja con ello el globo de datos de la tarea.
 */
import { computed } from 'vue'

import { GANTT_METRICS } from '../../utils/ganttMetrics'

const props = defineProps({
  /** Barra del layout: { taskId, x, width, label, title, color, status,
   *  startIso, endIso, assignedName }. */
  barra: { type: Object, required: true },
  /** Y de la fila, en pixeles: rowIndex * altoFila. */
  y: { type: Number, required: true },
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
})

const emit = defineEmits(['empezar-arrastrar', 'abrir', 'seleccionar', 'tecla', 'entrar', 'salir'])

/** Ancho minimo de barra, para que una tarea de un dia siga siendo agarrable. */
const anchoBarra = computed(() => Math.max(6, props.barra.width))

/** La etiqueta solo sale si cabe: no se recorta a la mitad. */
const mostrarEtiqueta = computed(() => anchoBarra.value >= GANTT_METRICS.labelMinWidth)

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
  if (!props.editable) return
  event.preventDefault()
  emit('empezar-arrastrar', { barra: props.barra, zona: zonaDe(event), event })
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
    :transform="`translate(${barra.x}, ${y + 6})`"
    :class="[
      barra.color,
      {
        'gantt__barra--previsualizada': previsualizada,
        'gantt__barra--solo-lectura': !editable,
        'gantt__barra--provisional': barra.provisional === true,
      },
    ]"
    @mousedown.prevent="empezarArrastre"
    @click="emit('abrir', barra.taskId)"
    @dblclick.stop
    @focus="emit('seleccionar', barra.taskId)"
    @keydown="emit('tecla', $event, barra.taskId)"
    @mouseenter="emit('entrar', barra.taskId)"
    @mouseleave="emit('salir')"
  >
    <!-- Cuerpo: el relleno lo da gantt.css con el color de la persona. -->
    <rect
      class="gantt__barra-cuerpo"
      :width="anchoBarra"
      :height="GANTT_METRICS.barHeight"
      :rx="GANTT_METRICS.barRadius"
    />

    <!-- Avance: el color de identidad oscurecido 28 %. -->
    <rect
      v-if="barra.progress > 0"
      class="gantt__barra-avance"
      :width="anchoBarra * (barra.progress / 100)"
      :height="GANTT_METRICS.barHeight"
      :rx="GANTT_METRICS.barRadius"
      fill="rgba(0, 0, 0, 0.28)"
    />

    <!-- Etiqueta: solo si cabe entera. -->
    <text
      v-if="mostrarEtiqueta"
      :x="GANTT_METRICS.labelPadding"
      :y="GANTT_METRICS.barHeight / 2 + 4"
      class="gantt__barra-etiqueta"
      pointer-events="none"
    >{{ barra.label }}</text>

    <!-- Marca de violacion: triangulo en la esquina superior derecha, dentro
         de la barra. Distingue por forma, no por color; el motivo va en la
         aria-label. -->
    <polygon
      v-if="viola"
      class="gantt__barra-violacion"
      points="10,1 20,1 15,10"
      :transform="`translate(${anchoBarra - 21} 0)`"
      fill="#475569"
      stroke="#fff"
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
      fill="transparent"
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
      fill="transparent"
      style="cursor: ew-resize"
      aria-hidden="true"
      data-testid="gantt-handle-end"
    />
  </g>
</template>
