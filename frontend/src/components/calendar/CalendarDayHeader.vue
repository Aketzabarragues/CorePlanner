<script setup>
/**
 * La fila de cabecera de una semana: el rango y la clave ISO, y las siete
 * celdas de dia con su nombre, su numero clicable, el marcador de hoy y los
 * dias no laborables.
 *
 * El numero del dia abre el detalle: `open-day` con la fecha. Los dias no
 * laborables se marcan como en el calendario de trabajo: global con borde,
 * de departamento o persona en anil.
 */
import { computed } from 'vue'

import { localDateKey, weekdayNames } from '../../utils/month'
import { daysRangeLabel, isoWeekKey } from '../../utils/weeks'

const props = defineProps({
  /** Los siete dias de la semana: [{date, day, weekday, weekend}]. */
  days: { type: Array, required: true },
  /** Dias no laborables de toda la empresa y de cada departamento. */
  nonWorkingDays: { type: Array, default: () => [] },
  /** Destino del arrastre, para sombrear la banda en su rango de fechas. */
  destino: { type: Object, default: null },
})

const emit = defineEmits(['open-day'])

const NOMBRES_DIA = weekdayNames()

/** Fecha de hoy, para marcar el dia en la cabecera. */
const hoy = computed(() => localDateKey())

/** Rango de la semana: "9 - 15 nov". */
const rango = computed(() => daysRangeLabel(props.days))

/** Clave ISO de la semana: "2026-W46". */
const claveSemana = computed(() => {
  const primero = props.days[0]
  if (!primero) return ''
  return isoWeekKey(new Date(`${primero.date}T00:00:00Z`))
})

/** Dias no laborables de cada dia de la semana. */
const noLaborablesPorFecha = computed(() => {
  const mapa = new Map()
  for (const dia of props.nonWorkingDays) {
    if (!props.days.some((deLaSemana) => deLaSemana.date === dia.date)) continue
    const lista = mapa.get(dia.date) ?? []
    lista.push(dia)
    mapa.set(dia.date, lista)
  }
  return mapa
})

</script>

<template>
  <tr class="border-b border-borde bg-tarjeta-suave" data-testid="week-lane-header">
    <th
      class="w-40 border-r border-borde px-3 py-2 text-left align-top"
      scope="col"
    >
      <span class="block text-cp-xs font-bold text-texto-marca" data-testid="week-lane-range">
        {{ rango }}
      </span>
      <span class="block font-mono text-cp-micro text-texto-tenue">{{ claveSemana }}</span>
    </th>
    <th
      v-for="dia in days"
      :key="dia.date"
      class="border-b border-l border-borde px-2 py-1.5 text-left align-top"
      :class="
        dia.weekend
          ? 'cp-trama-fin-semana'
          : destino && dia.date >= destino.start && dia.date <= destino.end
            ? 'bg-aviso-fondo/60'
            : ''
      "
      scope="col"
      :data-testid="`week-lane-head-${dia.date}`"
    >
      <!-- Primera fila: nombre del dia a la izquierda y el festivo como etiqueta
           unica cortada a una linea a la derecha. -->
      <span class="flex min-w-0 items-center justify-between gap-1">
        <span class="shrink-0 text-cp-micro font-semibold uppercase tracking-wider text-texto-tenue">
          {{ NOMBRES_DIA[dia.weekday] }}
        </span>
        <span class="flex min-w-0 items-center gap-1">
          <template v-for="festivo in noLaborablesPorFecha.get(dia.date) ?? []" :key="festivo.id">
            <span
              v-if="festivo.scope === 'global'"
              class="min-w-0 max-w-full truncate rounded-pastilla border border-peligro-borde bg-peligro-fondo px-1.5 py-px text-cp-micro font-medium text-peligro-texto"
              :title="festivo.name"
              data-testid="week-lane-holiday"
            >
              {{ festivo.name }}
            </span>
            <span
              v-else-if="festivo.department_name"
              class="min-w-0 max-w-full truncate rounded-pastilla border border-aviso-borde bg-aviso-fondo px-1.5 py-px text-cp-micro font-medium text-aviso-texto"
              :title="`${festivo.name} (${festivo.department_name})`"
              data-testid="week-lane-holiday"
            >
              {{ festivo.name }}
            </span>
            <span
              v-else
              class="min-w-0 max-w-full truncate rounded-pastilla border border-info-borde bg-info-fondo px-1.5 py-px text-cp-micro font-medium text-info-texto"
              :title="festivo.user_name ? `${festivo.name} (${festivo.user_name})` : festivo.name"
              data-testid="week-lane-holiday"
            >
              {{ festivo.name }}
            </span>
          </template>
        </span>
      </span>
      <!-- Segunda fila: el numero (abre el detalle del dia) y el marcador de hoy. -->
      <span class="mt-0.5 flex items-center gap-1.5">
        <button
          type="button"
          class="text-left text-cp-sm font-bold text-texto-marca transition-colors hover:text-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          :title="`Ver el día ${dia.date}`"
          :data-testid="`week-day-${dia.date}`"
          @click="emit('open-day', dia.date)"
        >
          {{ dia.day }}
        </button>
        <span
          v-if="dia.date === hoy"
          class="rounded-pastilla bg-primario-fuerte px-1.5 py-px text-cp-micro font-bold uppercase text-sobre-primario"
          data-testid="week-lane-today"
        >
          Hoy
        </span>
      </span>
    </th>
  </tr>
</template>
