<script setup>
/**
 * Columna fija de nombres del diagrama de Gantt.
 *
 * Es la lista de tareas, no de personas: el titulo de la tarea y debajo
 * `persona · proyecto`. La barra ya va coloreada por persona; repetir el
 * nombre en cada fila seria ruido.
 *
 * La columna no hace scroll vertical propio: su pista interior se traslada
 * con el mismo desplazamiento que el diagrama, para que fila y barra no se
 * despeguen. Esta aria-hidden: es la version HTML de lo que el SVG ya
 * anuncia.
 */
import { GANTT_METRICS } from '../../utils/ganttMetrics'
const props = defineProps({
  /** Filas del layout, ya enriquecidas: [{ type, rowIndex, ... }]. */
  filas: { type: Array, required: true },
  /** Desplazamiento vertical del diagrama, en pixeles. */
  desplazamiento: { type: Number, default: 0 },
})

/** Cabecera de la columna: la altura es la del eje, la misma en los dos. */
const cabecera = 'Tarea'
</script>

<template>
  <div
    class="gantt__nombres w-60 max-sm:w-40 shrink-0 border-r border-slate-200"
    aria-hidden="true"
    data-testid="gantt-names"
  >
    <!--
      La cabecera reserva el mismo alto que la del eje (`GANTT_METRICS`): el
      numero es el unico, las dos piezas no se descuadran.
    -->
    <div
      class="flex items-center border-b border-slate-200 bg-slate-100 px-3"
      :style="{ height: `${GANTT_METRICS.headerHeight}px` }"
    >
      <span class="text-xs font-semibold text-siemens-900">{{ cabecera }}</span>
    </div>

    <div class="gantt__nombres-cuerpo overflow-hidden">
      <div
        class="gantt__nombres-pista"
        :style="{ transform: `translateY(${-desplazamiento}px)` }"
      >
        <!-- Una fila por entrada del layout, en el orden del diagrama. -->
        <template v-for="fila in filas" :key="fila.rowIndex">
          <!-- Fila de grupo: la franja de color, si la hay, y el nombre. -->
          <div
            v-if="fila.type === 'group'"
            class="flex h-9 items-center gap-2 border-b border-slate-200 bg-slate-100 px-3"
          >
            <span
              v-if="fila.color"
              class="h-4 w-1 shrink-0 rounded-full"
              :style="{ backgroundColor: fila.color }"
            />
            <span class="truncate text-[13px] font-semibold text-siemens-900">
              {{ fila.label }}
            </span>
          </div>

          <!-- Fila de tarea: el titulo y la persona con el proyecto. -->
          <div
            v-else
            class="flex h-9 flex-col justify-center border-b border-slate-100 px-3"
          >
            <span class="truncate text-xs font-medium text-slate-700" :title="fila.title">
              {{ fila.title }}
            </span>
            <span class="truncate text-[10px] text-slate-400">
              {{ fila.assignedName ?? 'Sin asignar' }} · {{ fila.projectName }}
            </span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
