<script setup>
/**
 * Cuadricula del mes de dias no laborables.
 *
 * Cada dia muestra los dias no laborables que le tocan. Con selectable, cada
 * celda es un boton y el panel elige el dia para ver su detalle.
 *
 * El color dice a quien aplica el festivo: gris para todo el mundo, ambar
 * para un departamento y morado para una sola persona.
 */
import { computed } from 'vue'

import { monthGrid, weekdayNames } from '../utils/month'

const props = defineProps({
  month: { type: String, required: true },
  days: { type: Array, default: () => [] },
  selectable: { type: Boolean, default: false },
  selected: { type: String, default: '' },
})

const emit = defineEmits(['select'])

/** Clases de cada alcance. */
function scopeClasses(scope) {
  if (scope === 'person') return 'bg-violet-100 text-violet-800'
  if (scope === 'department') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-200 text-slate-700'
}

/** Etiqueta corta del alcance. */
function scopeLabel(scope) {
  if (scope === 'person') return 'Persona'
  if (scope === 'department') return 'Departamento'
  return 'Global'
}

/** Etiqueta del dia no laborable, con el medio dia marcado. */
function scopeTag(day) {
  const marca = day.half_day ? ' · ½' : ''
  return `${scopeLabel(day.scope)}${marca}`
}

const weeks = computed(() => monthGrid(props.month))

/** Dias no laborables de cada fecha. */
const daysByDate = computed(() => {
  const map = new Map()
  for (const day of props.days) {
    const list = map.get(day.date) ?? []
    list.push(day)
    map.set(day.date, list)
  }
  return map
})
</script>

<template>
  <div>
    <table class="w-full table-fixed border-collapse" data-testid="labor-month-grid">
      <thead>
        <tr>
          <th
            v-for="name in weekdayNames()"
            :key="name"
            class="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400"
          >
            {{ name }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(week, index) in weeks" :key="index">
          <td
            v-for="cell in week"
            :key="cell.date"
            class="border border-slate-200 p-1 align-top"
            :class="cell.inMonth ? 'bg-white' : 'bg-slate-50'"
          >
            <button
              v-if="selectable"
              type="button"
              class="w-full rounded p-0.5 text-left"
              :class="selected === cell.date ? 'bg-slate-100 ring-1 ring-siemens-700' : ''"
              :aria-pressed="selected === cell.date"
              :aria-label="`Dia ${cell.day}`"
              data-testid="labor-month-cell"
              @click="emit('select', cell.date)"
            >
              <span
                class="block text-xs font-medium"
                :class="cell.inMonth ? 'text-slate-700' : 'text-slate-400'"
              >
                {{ cell.day }}
              </span>
              <span class="mt-0.5 block space-y-0.5">
                <span
                  v-for="day in daysByDate.get(cell.date) ?? []"
                  :key="day.id"
                  class="block whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium"
                  :class="scopeClasses(day.scope)"
                  :title="day.name"
                  data-testid="labor-month-day"
                >
                  {{ scopeTag(day) }}
                </span>
              </span>
            </button>
            <template v-else>
              <div
                class="text-xs font-medium"
                :class="cell.inMonth ? 'text-slate-700' : 'text-slate-400'"
              >
                {{ cell.day }}
              </div>
              <div class="mt-0.5 space-y-0.5">
                <span
                  v-for="day in daysByDate.get(cell.date) ?? []"
                  :key="day.id"
                  class="block whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-medium"
                  :class="scopeClasses(day.scope)"
                  :title="day.name"
                  data-testid="labor-month-day"
                >
                  {{ day.name }}
                </span>
              </div>
            </template>
          </td>
        </tr>
      </tbody>
    </table>

    <ul class="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
      <li class="flex items-center gap-1">
        <span class="h-3 w-3 rounded-sm bg-slate-200"></span>
        Global
      </li>
      <li class="flex items-center gap-1">
        <span class="h-3 w-3 rounded-sm bg-amber-100"></span>
        Departamento
      </li>
      <li class="flex items-center gap-1">
        <span class="h-3 w-3 rounded-sm bg-violet-100"></span>
        Persona
      </li>
    </ul>
  </div>
</template>
