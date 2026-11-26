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
  <tr class="bg-slate-100" data-testid="week-lane-header">
    <th
      class="w-40 border-b border-slate-200 px-2 py-1.5 text-left align-top"
      scope="col"
    >
      <span class="block text-xs font-semibold text-siemens-900" data-testid="week-lane-range">
        {{ rango }}
      </span>
      <span class="block text-[10px] text-slate-400">{{ claveSemana }}</span>
    </th>
    <th
      v-for="dia in days"
      :key="dia.date"
      class="border-b border-l border-slate-200 px-2 py-1.5 text-left align-top"
      :class="
        dia.weekend
          ? 'bg-slate-50'
          : destino && dia.date >= destino.start && dia.date <= destino.end
            ? 'bg-amber-50'
            : ''
      "
      scope="col"
      :data-testid="`week-lane-head-${dia.date}`"
    >
      <span class="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {{ NOMBRES_DIA[dia.weekday] }}
      </span>
      <button
        type="button"
        class="block w-full text-left text-sm font-semibold text-siemens-900 hover:underline"
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
          class="rounded-full bg-siemens-900 px-1.5 py-px text-[10px] font-semibold text-white"
          data-testid="week-lane-today"
        >
          Hoy
        </span>
        <template v-for="festivo in noLaborablesPorFecha.get(dia.date) ?? []" :key="festivo.id">
          <span
            v-if="festivo.scope === 'global'"
            class="max-w-full truncate rounded-full border border-slate-300 bg-white px-1.5 py-px text-[10px] font-medium text-slate-700"
            :title="festivo.name"
            data-testid="week-lane-holiday"
          >
            {{ festivo.name }}
          </span>
          <span
            v-else
            class="max-w-full truncate rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800"
            :title="
              festivo.department_name
                ? `${festivo.name} (${festivo.department_name})`
                : festivo.name
            "
            data-testid="week-lane-holiday"
          >
            {{ festivo.name }}
          </span>
        </template>
      </span>
    </th>
  </tr>
</template>
