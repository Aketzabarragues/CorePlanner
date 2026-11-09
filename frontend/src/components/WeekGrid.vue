<script setup>
/**
 * Rejilla de una semana ISO.
 *
 * Una columna por dia laborable, de lunes a viernes, con las tareas que ocupan
 * ese dia. El fin de semana no se muestra: el motor de capacidad solo reparte
 * horas entre dias laborables, y una columna siempre vacia no aporta nada.
 *
 * Las tareas se muestran con mas detalle que en la vista mensual: titulo,
 * persona, estado y las fechas completas.
 *
 * Al pulsar una tarea se emite su identificador con `open-task` para que la
 * vista que la contiene abra su detalle.
 */
import { computed } from 'vue'

import { columnLabel } from '../utils/kanban'
import { tasksOnDay, weekdayNames } from '../utils/month'
import { weekWorkdays } from '../utils/weeks'

const props = defineProps({
  weekKey: { type: String, required: true },
  tasks: { type: Array, default: () => [] },
  nonWorkingDays: { type: Array, default: () => [] },
})

const emit = defineEmits(['open-day', 'open-task'])

const days = computed(() => weekWorkdays(props.weekKey))
const names = computed(() => weekdayNames().slice(0, 5))

/** Tareas de cada dia de la semana. */
const tasksByDay = computed(() => {
  const map = new Map()
  for (const day of days.value) {
    map.set(day.date, tasksOnDay(props.tasks, day.date))
  }
  return map
})

/** Dias no laborables de cada fecha. */
const nonWorkingByDate = computed(() => {
  const map = new Map()
  for (const day of props.nonWorkingDays) {
    const list = map.get(day.date) ?? []
    list.push(day)
    map.set(day.date, list)
  }
  return map
})
</script>

<template>
  <div class="overflow-x-auto rounded border border-slate-200 bg-white">
    <table class="w-full border-collapse text-sm" data-testid="week-grid">
      <thead>
        <tr class="bg-slate-100">
          <th
            v-for="day in days"
            :key="day.date"
            class="border border-slate-200 px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
          >
            {{ names[day.weekday] }}
            <button
              type="button"
              class="ml-1 rounded text-sm font-semibold normal-case text-siemens-900 hover:underline"
              :title="`Ver el día ${day.date}`"
              :data-testid="`week-day-${day.date}`"
              @click="emit('open-day', day.date)"
            >
              {{ day.day }}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td
            v-for="day in days"
            :key="day.date"
            class="min-h-32 w-1/5 align-top border border-slate-200 p-2"
            :data-testid="`week-cell-${day.date}`"
          >
            <div class="mb-1.5 flex flex-wrap items-center gap-1">
              <template
                v-for="nonWorking in nonWorkingByDate.get(day.date) ?? []"
                :key="nonWorking.id"
              >
                <span
                  v-if="nonWorking.scope === 'global'"
                  class="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                  :title="nonWorking.name"
                  data-testid="week-non-working"
                >
                  {{ nonWorking.name }}
                </span>
                <span
                  v-else
                  class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                  :title="
                    nonWorking.department_name
                      ? `${nonWorking.name} (${nonWorking.department_name})`
                      : nonWorking.name
                  "
                  data-testid="week-non-working"
                >
                  {{ nonWorking.name }}
                </span>
              </template>
            </div>

            <div class="space-y-1.5">
              <div
                v-for="task in tasksByDay.get(day.date) ?? []"
                :key="task.id"
                class="cursor-pointer rounded px-2 py-1 text-[11px] text-white"
                :class="task.custom_class || 'bg-slate-500'"
                :title="`${task.title} · ${task.assigned_name ?? 'sin asignar'} · ${task.project_name} · ${task.start} - ${task.end}`"
                data-testid="week-task"
                @click="emit('open-task', task.id)"
              >
                <span class="block font-medium">{{ task.title }}</span>
                <span class="block opacity-90">
                  {{ task.assigned_name ?? 'sin asignar' }} · {{ columnLabel(task.status) }}
                </span>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
