<script setup>
/**
 * Detalle de un dia.
 *
 * Lo que ocupa un solo dia: que tareas hay, quien las lleva y en que estado.
 * Es la vista a la que se llega al pulsar un dia del mes o de la semana, donde
 * no cabria mostrarlo todo.
 *
 * Al pulsar una tarea se emite su identificador con `open-task` para que la
 * vista que la contiene abra su detalle.
 */
import { computed } from 'vue'

import { columnLabel } from '../utils/kanban'
import { longDateLabel, tasksOnDay } from '../utils/month'

const props = defineProps({
  date: { type: String, required: true },
  tasks: { type: Array, default: () => [] },
  nonWorkingDays: { type: Array, default: () => [] },
})

const emit = defineEmits(['open-task'])

const label = computed(() => longDateLabel(props.date))

/** Tareas que ocupan el dia. */
const dayTasks = computed(() => tasksOnDay(props.tasks, props.date))

/** Dias no laborables de la fecha. */
const nonWorking = computed(() => props.nonWorkingDays.filter((day) => day.date === props.date))

/** Clase del distintivo de un dia no laborable, segun su alcance. */
function nonWorkingClass(scope) {
  return scope === 'global' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'
}
</script>

<template>
  <div class="rounded border border-slate-200 bg-white" data-testid="day-view">
    <div class="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <h2 class="text-base font-semibold text-siemens-900" data-testid="day-view-title">
        {{ label }}
      </h2>
      <p v-if="nonWorking.length" class="mt-1 text-xs font-medium text-amber-700">
        <span
          v-for="day in nonWorking"
          :key="day.id"
          class="mr-2 rounded-full px-2 py-0.5"
          :class="nonWorkingClass(day.scope)"
        >
          {{ day.name }}
          <span v-if="day.department_name"> · {{ day.department_name }}</span>
        </span>
      </p>
    </div>

    <ul v-if="dayTasks.length" class="divide-y divide-slate-100">
      <li
        v-for="task in dayTasks"
        :key="task.id"
        class="cursor-pointer flex items-start gap-3 px-4 py-3"
        data-testid="day-task"
        @click="emit('open-task', task.id)"
      >
        <span :class="['mt-1 h-3 w-3 shrink-0 rounded-sm', task.custom_class || 'bg-slate-400']" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-slate-800" :title="task.title">
            {{ task.title }}
          </p>
          <p class="mt-0.5 text-xs text-slate-500">
            {{ task.assigned_name ?? 'sin asignar' }} · {{ columnLabel(task.status) }} ·
            {{ task.project_name }}
          </p>
        </div>
        <span class="shrink-0 text-xs tabular-nums text-slate-400">
          {{ task.start }} - {{ task.end }}
        </span>
      </li>
    </ul>

    <p v-else class="px-4 py-6 text-sm text-slate-500" data-testid="day-empty">
      No hay tareas este día.
    </p>
  </div>
</template>
