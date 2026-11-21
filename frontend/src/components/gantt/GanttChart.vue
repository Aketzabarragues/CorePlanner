<script setup>
/**
 * Diagrama de Gantt: una sola pieza, con la columna de nombres aparte.
 *
 * El SVG tiene cuatro capas, en orden: rejilla, bandas, cuerpo y eje. El SVG
 * entero es el contenido del panel con overflow: el scroll nativo sube el
 * cuerpo y el eje se contratraslada, para que la cabecera quede clavada
 * arriba. La columna de nombres no hace scroll propio: su pista interior
 * lleva el mismo desplazamiento.
 *
 * El arrastre lo gestiona `useGanttDrag`: la barra emite donde se agarra y
 * el composable devuelve el fantasma y el rango previsualizado, que la vista
 * convierte en un PATCH. El teclado sube a la vista, que es quien conoce la
 * escala y el permiso.
 */
import { computed, ref } from 'vue'

import { addDays, dayIndex, parseIsoDate, toIsoDate } from '../../utils/ganttScale'
import { GANTT_METRICS } from '../../utils/ganttMetrics'
import { GANTT_ROW_HEIGHT } from '../../utils/ganttLayout'
import { useGanttDrag } from '../../composables/useGanttDrag'
import GanttAxis from './GanttAxis.vue'
import GanttBar from './GanttBar.vue'
import GanttGroupRow from './GanttGroupRow.vue'
import GanttNamesColumn from './GanttNamesColumn.vue'

const props = defineProps({
  /** Modelo del diagrama, de `buildLayout`. */
  layout: { type: Object, required: true },
  /** Celdas del eje, ya con las insignias de hoy y de festivo. */
  columnas: { type: Array, required: true },
  /** Filas de la columna de nombres, ya enriquecidas. */
  filasNombres: { type: Array, required: true },
  /** Si la persona que entra puede escribir en la barra: por identificador. */
  editableDe: { type: Function, required: true },
  /** Barra enfocada: la unica con tabindex 0. */
  barraEnfocada: { type: [Number, String], default: null },
  /** Etiqueta aria de cada barra, por identificador. */
  etiquetaDe: { type: Function, required: true },
  /** Frase descriptiva del SVG: tareas, proyectos, rango. */
  descripcion: { type: String, default: '' },
  /** Aviso de solo lectura, si la vista lo lleva. */
  aviso: { type: String, default: '' },
})

const emit = defineEmits(['abrir', 'seleccionar', 'tecla', 'mover', 'crear'])

const panelDiagrama = ref(null)
/** Desplazamiento vertical del diagrama: el eje lo invierte, la columna lo replica. */
const desplazamiento = ref(0)

/** Alto total del SVG: cabecera mas una fila por entrada del layout. */
const altoTotal = computed(() => GANTT_METRICS.headerHeight + props.layout.rows.length * GANTT_ROW_HEIGHT)

/** Bandas que se sombrea: en la escala de Mes no se sombrea. */
const bandas = computed(() =>
  props.layout.scale.header === 'month' ? [] : props.layout.shaded,
)

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

function alAbrirBarra(id) {
  if (arrastradaRecien) {
    arrastradaRecien = false
    return
  }
  emit('abrir', id)
}

/** X de la previsualizacion, para la banda de destino. */
const xDestino = computed(() => {
  const pre = drag.previsualizacion.value
  return pre ? dayIndex(parseIsoDate(pre.start), props.layout.start) * props.layout.pxPerDay : null
})

function alDesplazar() {
  desplazamiento.value = panelDiagrama.value ? panelDiagrama.value.scrollTop : 0
}

function alEmpezarArrastre({ barra, zona, event }) {
  // El panel es la caja del diagrama: si la soltura cae fuera, el composable
  // anula el gesto igual que con Escape (§8.5).
  drag.empezarArrastre({ barra, zona, event, dentro: panelDiagrama })
}

/**
 * Doble clic en el hueco del diagrama: punto de alta de tarea.
 *
 * El fondo es el propio SVG y las barras se dibujan encima: el doble clic
 * sobre una barra no crea nada, solo la barra abre el detalle (clic simple).
 * La fecha sale de la x (indice de dia desde el inicio del rango) y la fila
 * de la y (fila debajo de la cabecera del eje).
 */
function alDobleClicFondo(event) {
  const caja = event.currentTarget.getBoundingClientRect()
  const x = event.clientX - caja.left
  const y = event.clientY - caja.top
  if (x < 0 || x >= props.layout.width || y < GANTT_METRICS.headerHeight) return
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
  <div
    class="gantt relative flex max-h-[70vh] overflow-hidden rounded border border-slate-200 bg-white"
    role="group"
    aria-roledescription="diagrama de Gantt"
    aria-label="Diagrama de Gantt"
    :aria-describedby="aviso ? 'gantt-aviso' : undefined"
    data-testid="gantt-chart"
  >
    <GanttNamesColumn :filas="filasNombres" :desplazamiento="desplazamiento" />

    <div
      ref="panelDiagrama"
      class="gantt__diagrama flex-1 overflow-auto"
      data-testid="gantt-scroll"
      @scroll.passive="alDesplazar"
    >
      <svg
        class="gantt__svg block"
        :width="layout.width"
        :height="altoTotal"
        role="group"
        aria-labelledby="gantt-titulo"
        aria-describedby="gantt-descripcion gantt-instrucciones"
        data-testid="gantt-svg"
        @dblclick="alDobleClicFondo"
      >
        <title id="gantt-titulo">Diagrama de Gantt</title>
        <desc id="gantt-descripcion">{{ descripcion }}</desc>

        <!-- Rejilla vertical: una linea por tick del eje. Decorativa. -->
        <g class="gantt__rejilla" aria-hidden="true">
          <line
            v-for="tick in layout.axis.ticks"
            :key="tick.x"
            :x1="tick.x"
            :x2="tick.x"
            y1="0"
            :y2="altoTotal"
            stroke="#e2e8f0"
            stroke-width="1"
          />
        </g>

        <!-- Bandas de fin de semana y de dia no laborable global. -->
        <g class="gantt__bandas" aria-hidden="true">
          <rect
            v-for="banda in bandas"
            :key="`${banda.kind}-${banda.x}`"
            :x="banda.x"
            y="0"
            :width="banda.width"
            :height="altoTotal"
            :fill="banda.kind === 'festivo' ? '#fffbeb' : '#f8fafc'"
          />
        </g>

        <!-- Cuerpo: grupos, barras y linea de hoy. Sube con el scroll nativo. -->
        <g class="gantt__cuerpo">
          <template v-for="fila in layout.rows" :key="fila.rowIndex">
            <GanttGroupRow
              v-if="fila.type === 'group'"
              :grupo="fila"
              :y="fila.rowIndex * GANTT_ROW_HEIGHT"
              :ancho="layout.width"
            />

            <GanttBar
              v-else
              :barra="fila.barra"
              :y="fila.rowIndex * GANTT_ROW_HEIGHT"
              :editable="editableDe(fila.barra.taskId)"
              :seleccionada="barraEnfocada === fila.barra.taskId"
              :previsualizada="drag.previsualizacion && drag.previsualizacion.taskId === fila.barra.taskId"
              :etiqueta-aria="etiquetaDe(fila.barra.taskId)"
              @empezar-arrastrar="alEmpezarArrastre"
              @abrir="alAbrirBarra"
              @seleccionar="(id) => emit('seleccionar', id)"
              @tecla="(event, id) => emit('tecla', event, id)"
            />
          </template>

          <!-- Banda de destino del arrastre: el rango que va a caer. -->
          <rect
            v-if="drag.previsualizacion && xDestino !== null"
            :x="xDestino"
            y="0"
            :width="layout.width"
            :height="altoTotal"
            fill="rgba(0, 100, 180, 0.08)"
            aria-hidden="true"
          />

          <!-- Linea de hoy: 2 px, en el dia exacto. -->
          <line
            v-if="layout.todayIndex !== null"
            class="gantt__hoy"
            :x1="layout.todayIndex * layout.pxPerDay"
            :x2="layout.todayIndex * layout.pxPerDay"
            :y1="GANTT_METRICS.headerHeight"
            :y2="altoTotal"
            stroke="#003466"
            stroke-width="2"
            aria-hidden="true"
          />
        </g>

        <!-- Eje: se contratraslada para quedar clavado arriba. -->
        <g class="gantt__eje" :transform="`translate(0, ${desplazamiento})`">
          <GanttAxis :columnas="columnas" :ancho="layout.width" :alto="GANTT_METRICS.headerHeight" />
        </g>
      </svg>
    </div>

    <!-- Fantasma del arrastre: mismo patron que el del Kanban. -->
    <div
      v-if="drag.fantasma"
      class="pointer-events-none fixed z-50 flex h-6 select-none items-center gap-1.5 rounded border border-siemens-500 bg-white pl-1.5 pr-2 shadow-lg"
      :style="{ left: `${drag.fantasma.x}px`, top: `${drag.fantasma.y}px` }"
      data-testid="gantt-drag-ghost"
    >
      <span class="h-4 w-1 shrink-0 rounded-sm" :style="{ backgroundColor: drag.fantasma.color }" />
      <span class="text-[11px] font-medium text-slate-900">{{ drag.fantasma.etiqueta }}</span>
      <span class="rounded bg-siemens-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
        {{ drag.fantasma.rango }}
      </span>
    </div>
  </div>

  <p v-if="aviso" id="gantt-aviso" class="sr-only">{{ aviso }}</p>
  <p id="gantt-instrucciones" class="sr-only">
    Con las flechas izquierda y derecha se mueve la barra un dia, o una semana o un mes segun la
    escala; con Mayus y flechas se recorta o se alarga el extremo final; con Intro se abre el
    detalle de la tarea y con Escape se anula el arrastre.
  </p>
</template>
