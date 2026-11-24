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
 *
 * La columna es la otra mitad de la fila: avisa de la fila bajo el puntero
 * (`fila-raton`) y recibe que filas hay que pintar (la del puntero y la de
 * la barra enfocada). El estado lo lleva el chart, que es quien tiene las
 * dos mitades del diagrama.
 */
import { GANTT_METRICS } from '../../utils/ganttMetrics'
const props = defineProps({
  /** Filas del layout, ya enriquecidas: [{ type, rowIndex, ... }]. */
  filas: { type: Array, required: true },
  /** Desplazamiento vertical del diagrama, en pixeles. */
  desplazamiento: { type: Number, default: 0 },
  /** Fila bajo el puntero: la que se pinta como resaltada. */
  filaResaltada: { type: Number, default: null },
  /** Fila de la barra enfocada: se marca aunque el puntero este en otra. */
  filaActiva: { type: Number, default: null },
})

const emit = defineEmits(['fila-raton'])

/** Cabecera de la columna: la altura es la del eje, la misma en los dos. */
const cabecera = 'Tarea'

/**
 * Tinte de la fila: el del puntero y el de la barra enfocada.
 *
 * Los dos tintes son el del diagrama (`gantt.css`): la fila se lee igual en
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
</script>

<template>
  <div
    class="gantt__nombres w-60 max-sm:w-40 shrink-0 border-r border-slate-200"
    aria-hidden="true"
    data-testid="gantt-names"
    @mouseleave="alSalir"
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
            :class="claseDeFila(fila)"
            @mouseenter="alEntrar(fila)"
            @mouseleave="alSalir"
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
            :class="claseDeFila(fila)"
            @mouseenter="alEntrar(fila)"
            @mouseleave="alSalir"
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
