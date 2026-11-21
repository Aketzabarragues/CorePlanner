<script setup>
/**
 * Cabecera de grupo del diagrama de Gantt.
 *
 * Es una raiz <g> dentro del SVG del diagrama: solo la banda de fondo, el
 * separador y, si el grupo lo lleva, la franja de color. El nombre del grupo
 * vive en la columna de nombres; aqui solo se anuncia para el lector de
 * pantalla.
 */
const props = defineProps({
  /** Fila de grupo del layout: { label, rowIndex }. */
  grupo: { type: Object, required: true },
  /** Y de la fila, en pixeles: rowIndex * altoFila. */
  y: { type: Number, required: true },
  /** Ancho del diagrama, en pixeles. */
  ancho: { type: Number, required: true },
  /** Alto de la fila, en pixeles. */
  altoFila: { type: Number, default: 36 },
  /** Color de la franja, o null si el grupo no lleva color. */
  color: { type: String, default: null },
  /** Resumen que se anuncia despues del nombre: "4 tareas · Ana, Jorge". */
  resumen: { type: String, default: '' },
})
</script>

<template>
  <g
    role="heading"
    aria-level="3"
    :data-testid="`gantt-group-${grupo.rowIndex}`"
    :aria-label="`Grupo: ${grupo.label}${resumen ? '. ' + resumen : ''}`"
  >
    <rect x="0" :y="y" :width="ancho" :height="altoFila" fill="#f1f5f9" />
    <line
      x1="0"
      :x2="ancho"
      :y1="y + altoFila"
      :y2="y + altoFila"
      stroke="#e2e8f0"
      stroke-width="1"
    />
    <rect v-if="color" x="0" :y="y" width="4" :height="altoFila" :fill="color" />
  </g>
</template>
