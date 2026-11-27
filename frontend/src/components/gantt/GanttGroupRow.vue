<script setup>
/**
 * Cabecera de grupo del diagrama de Gantt.
 *
 * Es una raiz <g> dentro del SVG del diagrama: la banda de fondo, el
 * separador, la franja de color del grupo y la barra de resumen, que va de la
 * primera a la ultima fecha de las tareas del grupo.
 *
 * La barra de resumen es un cuerpo fino con un remate en cada extremo, como la
 * barra resumen de SVAR y ApexGantt. Es de solo lectura: no se arrastra y no
 * captura el puntero. Cuando el grupo esta colapsado, es lo unico que queda
 * de el: la extension del grupo en el tiempo.
 *
 * El color lo pone el grupo: el de la persona (por su clase CSS) o el del
 * proyecto (por su hex). Un grupo sin color propio se dibuja con el gris
 * neutro de la escala. La vista es quien decide el color del departamento.
 *
 * El nombre del grupo vive en la columna de nombres; aqui se anuncia para el
 * lector de pantalla, con el resumen de las tareas del grupo.
 */
import { computed } from 'vue'

/** Alto del cuerpo de la barra de resumen, en pixeles. */
const ALTO_CUERPO = 6
/** Alto del remate de cada extremo, en pixeles: sobresalen del cuerpo. */
const ALTO_REMATE = 12
/** Ancho del remate de cada extremo, en pixeles. */
const ANCHO_REMATE = 4

const props = defineProps({
  /** Fila de grupo del layout: { label, clave, rowIndex, x, width, ... }. */
  grupo: { type: Object, required: true },
  /** Y de la fila, en pixeles: rowIndex * altoFila. */
  y: { type: Number, required: true },
  /** Ancho de la franja: en pixeles, o en porcentaje del lienzo. */
  ancho: { type: [Number, String], required: true },
  /** Alto de la fila, en pixeles. */
  altoFila: { type: Number, default: 36 },
  /** Resumen que se anuncia despues del nombre: "4 tareas · del 21 al 25 de dic". */
  resumen: { type: String, default: '' },
})

/** Ancho de la barra de resumen: el del grupo, o cero si no lo tiene. */
const anchoResumen = computed(() => Math.max(0, props.grupo.width ?? 0))

/**
 * Color del grupo, como variable de CSS.
 *
 * La clase de la persona ya trae su color (`--persona-color`); el hex del
 * proyecto viene como dato. Los dos llegan al diagrama por la misma variable,
 * asi que la franja y la barra de resumen se pintan igual.
 */
const estiloColor = computed(() => {
  if (props.grupo.color) return { '--gantt-color-grupo': props.grupo.color }
  if (props.grupo.colorClass) return { '--gantt-color-grupo': 'var(--persona-color)' }
  return undefined
})
</script>

<template>
  <g
    role="heading"
    aria-level="3"
    :class="grupo.colorClass"
    :style="estiloColor"
    :data-testid="`gantt-group-${grupo.rowIndex}`"
    :aria-label="`Grupo: ${grupo.label}${resumen ? '. ' + resumen : ''}`"
  >
    <rect class="gantt__grupo-fondo" x="0" :y="y" :width="ancho" :height="altoFila" />
    <line
      class="gantt__grupo-separador"
      x1="0"
      :x2="ancho"
      :y1="y + altoFila"
      :y2="y + altoFila"
      stroke-width="1"
    />
    <!-- La franja de color es dato: el color del grupo, tal cual llega. -->
    <rect
      v-if="grupo.color || grupo.colorClass"
      class="gantt__grupo-franja"
      x="0"
      :y="y"
      width="4"
      :height="altoFila"
    />

    <!--
      Barra de resumen: el cuerpo va de la primera a la ultima fecha de las
      tareas del grupo y los remates cierran los dos extremos. Va debajo de
      las barras (que se leen encima) y no captura el puntero.
    -->
    <g v-if="anchoResumen > 0" class="gantt__resumen" aria-hidden="true">
      <rect
        class="gantt__resumen-cuerpo"
        :x="grupo.x"
        :y="y + (altoFila - ALTO_CUERPO) / 2"
        :width="anchoResumen"
        :height="ALTO_CUERPO"
        rx="3"
      />
      <rect
        class="gantt__resumen-remate"
        :x="grupo.x"
        :y="y + (altoFila - ALTO_REMATE) / 2"
        :width="ANCHO_REMATE"
        :height="ALTO_REMATE"
        rx="2"
      />
      <rect
        class="gantt__resumen-remate"
        :x="grupo.x + anchoResumen - ANCHO_REMATE"
        :y="y + (altoFila - ALTO_REMATE) / 2"
        :width="ANCHO_REMATE"
        :height="ALTO_REMATE"
        rx="2"
      />
    </g>
  </g>
</template>
