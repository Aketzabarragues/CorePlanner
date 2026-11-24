<script setup>
/**
 * Cabecera del eje temporal del diagrama de Gantt.
 *
 * Es una raiz <g>, para entrar dentro del SVG del diagrama: los componentes
 * con raiz SVG heredan el espacio de nombres del SVG padre. La vista le pasa
 * las celdas ya calculadas por `buildTimeAxis`, mas las insignias de hoy y de
 * festivo, que solo la vista puede saber.
 *
 * La cabecera tiene TRES bandas, una encima de otra, para que nada se pise:
 * - banda 1: el numero de la semana o el nombre del mes. En la escala de dia
 *   la lleva la banda del mes (`bandas`), que agrupa todos sus dias.
 * - banda 2: el rango de fechas (semana), el ano (mes) o el numero del dia.
 * - banda 3: el festivo (semana y mes) o la inicial del dia (dia).
 *
 * El eje es decorativo para el lector de pantalla: lo que se anuncia son las
 * barras, con su fecha.
 */
import { GANTT_METRICS } from '../../utils/ganttMetrics'

const props = defineProps({
  /** Celdas del eje: [{ key, label, sublabel, x, width, kind, hoy, festivo }]. */
  columnas: { type: Array, required: true },
  /**
   * Bandas de la cabecera: [{ key, label, x, width }].
   *
   * Solo la escala de dia las usa: una por mes, con todos sus dias. En las
   * demas escalas la lista va vacia.
   */
  bandasCabecera: { type: Array, default: () => [] },
  /** Ancho total del eje: en pixeles, o en porcentaje del lienzo. */
  ancho: { type: [Number, String], required: true },
  /** Alto de la cabecera, en pixeles. */
  alto: { type: Number, default: GANTT_METRICS.headerHeight },
})
</script>

<template>
  <g data-testid="gantt-axis" aria-hidden="true">
    <!-- Fondo opaco: tapa el cuerpo que pasa por debajo al hacer scroll. -->
    <rect class="gantt__eje-fondo" x="0" y="0" :width="ancho" :height="alto" />

    <!--
      Banda del mes (escala de dia): el nombre del mes y su separador, mas
      marcado que el de los dias, para que se vea donde acaba un mes y
      empieza el siguiente.
    -->
    <g
      v-for="banda in bandasCabecera"
      :key="`banda-${banda.key}`"
      :data-testid="`gantt-axis-banda-${banda.key}`"
    >
      <line
        class="gantt__separador-mes"
        :x1="banda.x"
        :x2="banda.x"
        y1="0"
        :y2="alto"
        stroke-width="1"
      />
      <text class="gantt__titulo-eje" :x="banda.x + 6" y="15">
        {{ banda.label }}
      </text>
    </g>

    <g v-for="columna in columnas" :key="columna.key" :data-testid="`gantt-axis-column-${columna.key}`">
      <line
        class="gantt__rejilla-linea"
        :x1="columna.x"
        :x2="columna.x"
        y1="0"
        :y2="alto"
        stroke-width="1"
      />

      <!--
        Escala de dia: la banda 1 la lleva el mes, asi que aqui van el numero
        del dia (banda 2) y la inicial del dia de la semana (banda 3).
      -->
      <template v-if="columna.kind === 'day'">
        <text class="gantt__titulo-eje" :x="columna.x + 6" y="33">
          {{ columna.label }}
        </text>

        <!--
          Insignia "Hoy": sustituye a la inicial del dia, que en un dia
          suelto no aporta. Asi no pisa a ningun otro texto.
        -->
        <g v-if="columna.hoy">
          <rect
            class="gantt__insignia-hoy-caja"
            :x="columna.x + 4"
            y="44"
            width="26"
            height="14"
            rx="7"
          />
          <text class="gantt__insignia-hoy-texto" :x="columna.x + 17" y="54" text-anchor="middle">
            Hoy
          </text>
        </g>
        <text v-else class="gantt__subtitulo-eje" :x="columna.x + 6" y="54">
          {{ columna.sublabel }}
        </text>
      </template>

      <!--
        Escala de semana y de mes: numero o nombre arriba (banda 1), rango de
        fechas o ano en el medio (banda 2) y festivo abajo (banda 3).
      -->
      <template v-else>
        <text class="gantt__titulo-eje" :x="columna.x + 6" y="15">
          {{ columna.label }}
        </text>

        <text v-if="columna.sublabel" class="gantt__subtitulo-eje" :x="columna.x + 6" y="33">
          {{ columna.sublabel }}
        </text>

        <!-- Insignia "Hoy": a la derecha de la banda 1, donde no hay texto. -->
        <g v-if="columna.hoy">
          <rect
            class="gantt__insignia-hoy-caja"
            :x="columna.x + columna.width - 32"
            y="5"
            width="26"
            height="14"
            rx="7"
          />
          <text
            class="gantt__insignia-hoy-texto"
            :x="columna.x + columna.width - 19"
            y="15"
            text-anchor="middle"
          >
            Hoy
          </text>
        </g>

        <!--
          Insignia de festivo: en su propia banda, con la etiqueta ya recortada
          al ancho de la celda. No pisa el rango de fechas.
        -->
        <g v-if="columna.festivo">
          <rect
            class="gantt__insignia-festivo-caja"
            :x="columna.x + 6"
            y="44"
            :width="columna.festivo.ancho + 12"
            height="14"
            rx="4"
          />
          <text class="gantt__insignia-festivo-texto" :x="columna.x + 12" y="54">
            {{ columna.festivo.etiqueta }}
          </text>
        </g>
      </template>
    </g>

    <line class="gantt__eje-borde" x1="0" :x2="ancho" :y1="alto" :y2="alto" stroke-width="1" />
  </g>
</template>
