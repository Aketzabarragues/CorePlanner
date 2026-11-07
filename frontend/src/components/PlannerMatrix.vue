<script setup>
import { weekLabel } from '../utils/weeks'

const props = defineProps({
  weeks: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
})

/** Celda de una persona en una semana. */
function cellOf(row, week) {
  return (
    row.cells.find((cell) => cell.week === week) ?? {
      week,
      hours: 0,
      capacity: null,
      is_overloaded: false,
    }
  )
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full table-fixed border-collapse" data-testid="planner-matrix">
      <thead>
        <tr>
          <th
            class="w-44 border-b border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            Persona
          </th>
          <th
            v-for="week in props.weeks"
            :key="week"
            class="border-b border-slate-200 px-2 py-2 text-center"
          >
            <span class="block text-xs font-semibold text-slate-700">{{ weekLabel(week) }}</span>
            <span class="block text-[10px] font-normal text-slate-400">{{ week }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in props.rows" :key="row.user_id" data-testid="planner-row">
          <th class="border-b border-slate-100 px-3 py-2 text-left align-top">
            <span class="block text-sm font-medium text-slate-800">{{ row.name }}</span>
            <span class="block text-xs font-normal text-slate-400">
              {{ row.weekly_base_hours }} h/semana
            </span>
          </th>
          <td
            v-for="week in props.weeks"
            :key="week"
            class="border-b border-slate-100 px-2 py-2 align-top"
            :class="cellOf(row, week).is_overloaded ? 'bg-red-100' : ''"
          >
            <slot name="cell" :cell="cellOf(row, week)" :row="row" :week="week" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
