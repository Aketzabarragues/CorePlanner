<script setup>
/**
 * Cabecera del eje temporal del diagrama de Gantt.
 *
 * Es una raiz <g>, para entrar dentro del SVG del diagrama: los componentes
 * con raiz SVG heredan el espacio de nombres del SVG padre. La vista le pasa
 * las celdas ya calculadas por `buildTimeAxis`, mas las insignias de hoy y de
 * festivo, que solo la vista puede saber.
 *
 * El eje es decorativo para el lector de pantalla: lo que se anuncia son las
 * barras, con su fecha.
 */
const props = defineProps({
  /** Celdas del eje: [{ key, label, sublabel, x, width, kind, hoy, festivo }]. */
  columnas: { type: Array, required: true },
  /** Ancho total del eje, en pixeles. */
  ancho: { type: Number, required: true },
  /** Alto de la cabecera, en pixeles. */
  alto: { type: Number, default: 48 },
})
</script>

<template>
  <g data-testid="gantt-axis" aria-hidden="true">
    <!-- Fondo opaco: tapa el cuerpo que pasa por debajo al hacer scroll. -->
    <rect x="0" y="0" :width="ancho" :height="alto" fill="#f1f5f9" />

    <g v-for="columna in columnas" :key="columna.key" :data-testid="`gantt-axis-column-${columna.key}`">
      <line :x1="columna.x" :x2="columna.x" y1="0" :y2="alto" stroke="#e2e8f0" stroke-width="1" />

      <!-- Titulo: "S46" / "9" / "nov". -->
      <text
        :x="columna.x + 6"
        y="19"
        fill="#003466"
        font-size="12"
        font-weight="600"
      >{{ columna.label }}</text>

      <!-- Subtitulo: "9 - 15 nov" / "Lun" / "2026". -->
      <text
        v-if="columna.sublabel"
        :x="columna.x + 6"
        y="34"
        fill="#64748b"
        font-size="10"
      >{{ columna.sublabel }}</text>

      <!-- Insignia "Hoy": la misma que usa la matriz de capacidad. En la
           escala de dia va a la derecha, porque a la izquierda cabe la
           subcabecera. -->
      <g v-if="columna.hoy && columna.kind === 'day'">
        <rect :x="columna.x + columna.width - 34" y="24" width="26" height="14" rx="7" fill="#003466" />
        <text
          :x="columna.x + columna.width - 21"
          y="34"
          text-anchor="middle"
          fill="#ffffff"
          font-size="10"
          font-weight="600"
        >Hoy</text>
      </g>

      <!-- Insignia "Hoy" en semana y mes: debajo de la subcabecera. -->
      <g v-else-if="columna.hoy">
        <rect :x="columna.x + 6" y="24" width="26" height="14" rx="7" fill="#003466" />
        <text
          :x="columna.x + 19"
          y="34"
          text-anchor="middle"
          fill="#ffffff"
          font-size="10"
          font-weight="600"
        >Hoy</text>
      </g>

      <!-- Insignia de festivo global: la misma que usa la matriz de
           capacidad. En la escala de dia no cabe: la banda ambar basta. -->
      <g v-else-if="columna.festivo">
        <rect
          :x="columna.x + 6"
          y="24"
          :width="columna.festivo.ancho + 12"
          height="14"
          rx="4"
          fill="#ffffff"
          stroke="#cbd5e1"
        />
        <text :x="columna.x + 12" y="34" fill="#475569" font-size="10" font-weight="500">
          {{ columna.festivo.etiqueta }}
        </text>
      </g>
    </g>

    <line x1="0" :x2="ancho" :y1="alto" :y2="alto" stroke="#e2e8f0" stroke-width="1" />
  </g>
</template>
