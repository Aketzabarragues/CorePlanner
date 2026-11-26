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
      <span class="block font-mono text-cp-xs font-bold text-texto-marca" data-testid="week-lane-range">
        {{ rango }}
      </span>
      <span class="block font-mono text-cp-micro text-texto-tenue">{{ claveSemana }}</span>
    </th>
    <th
      v-for="dia in days"
      :key="dia.date"
      class="border-b border-l border-borde px-2 py-2 text-left align-top"
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
      <span class="block text-cp-micro font-semibold uppercase tracking-wider text-texto-tenue">
        {{ NOMBRES_DIA[dia.weekday] }}
      </span>
      <button
        type="button"
        class="block w-full text-left font-mono text-cp-sm font-semibold text-texto-marca transition-colors hover:text-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
        :title="`Ver el día ${dia.date}`"
        :data-testid="`week-day-${dia.date}`"
        @click="emit('open-day', dia.date)"
      >
        {{ dia.day }}
      </button>
      <!-- Tercera fila: hoy y dias no laborables; altura minima para que todas las
           celdas midan igual aunque no tengan evento. -->
      <span class="mt-0.5 flex min-h-[1.25rem] flex-wrap gap-1">
        <span
          v-if="dia.date === hoy"
          class="rounded-pastilla bg-primario-fuerte px-1.5 py-px text-cp-micro font-bold uppercase text-sobre-primario"
          data-testid="week-lane-today"
        >
          Hoy
        </span>
        <template v-for="festivo in noLaborablesPorFecha.get(dia.date) ?? []" :key="festivo.id">
          <span
            v-if="festivo.scope === 'global'"
            class="max-w-full truncate rounded-pastilla border border-peligro-borde bg-peligro-fondo px-1.5 py-px text-cp-micro font-medium text-peligro-texto"
            :title="festivo.name"
            data-testid="week-lane-holiday"
          >
            {{ festivo.name }}
          </span>
          <span
            v-else-if="festivo.department_name"
            class="max-w-full truncate rounded-pastilla border border-aviso-borde bg-aviso-fondo px-1.5 py-px text-cp-micro font-medium text-aviso-texto"
            :title="`${festivo.name} (${festivo.department_name})`"
            data-testid="week-lane-holiday"
          >
            {{ festivo.name }}
          </span>
          <span
            v-else
            class="max-w-full truncate rounded-pastilla border border-info-borde bg-info-fondo px-1.5 py-px text-cp-micro font-medium text-info-texto"
            :title="festivo.user_name ? `${festivo.name} (${festivo.user_name})` : festivo.name"
            data-testid="week-lane-holiday"
          >
            {{ festivo.name }}
          </span>
        </template>
      </span>
    </th>
  </tr>
</template>
