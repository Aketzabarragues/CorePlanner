<script setup>
/**
 * Detalle de un dia, agrupado por persona.
 *
 * Lo que ocupa un solo dia: que tareas hay, quien las lleva y en que estado.
 * Es la vista a la que se llega al pulsar un dia del mes o de la semana, donde
 * no cabria mostrarlo todo.
 *
 * Las tareas se agrupan bajo la persona que las lleva, en el mismo orden que
 * las demas vistas: por departamento y luego por nombre. Cada persona sale
 * aunque no tenga nada ese dia: saber que no esta ocupada tambien es
 * informacion.
 *
 * Al pulsar una tarea se emite su identificador con `open-task` para que la
 * vista que la contiene abra su detalle.
 */
import { computed } from 'vue'

import { columnLabel } from '../utils/kanban'
import { longDateLabel, tasksOnDay } from '../utils/month'

const props = defineProps({
  /** Fecha del dia en formato ISO. */
  date: { type: String, required: true },
  /** Personas visibles, ordenadas por departamento y luego por nombre. */
  people: { type: Array, default: () => [] },
  /** Tareas ya filtradas. */
  tasks: { type: Array, default: () => [] },
  /** Dias no laborables. */
  nonWorkingDays: { type: Array, default: () => [] },
})

const emit = defineEmits(['open-task'])

const label = computed(() => longDateLabel(props.date))

/** Tareas que ocupan el dia. */
const dayTasks = computed(() => tasksOnDay(props.tasks, props.date))

/** Dias no laborables de la fecha. */
const nonWorking = computed(() => props.nonWorkingDays.filter((day) => day.date === props.date))

/**
 * Secciones del dia: una por persona y, si hace falta, la de sin asignar.
 *
 * Las tareas de alguien que no esta en la lista de personas no salen: la
 * vista ya deja fuera a quien esta escondido.
 */
const secciones = computed(() => {
  const porPersona = new Map()
  for (const persona of props.people) porPersona.set(String(persona.id), [])
  const sueltas = []

  for (const tarea of dayTasks.value) {
    const asignado = tarea.assigned_to ?? null
    const destino = asignado === null ? sueltas : porPersona.get(String(asignado))
    if (destino) destino.push(tarea)
  }

  const lista = props.people.map((persona) => ({
    id: persona.id,
    name: persona.name,
    department_name: persona.department_name,
    tasks: porPersona.get(String(persona.id)) ?? [],
  }))

  if (sueltas.length) {
    lista.push({ id: null, name: 'Sin asignar', department_name: null, tasks: sueltas })
  }
  return lista
})

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

    <div
      v-for="seccion in secciones"
      :key="seccion.id ?? 'sin-asignar'"
      class="border-b border-slate-100 last:border-b-0"
      :data-testid="seccion.id === null ? 'day-section-sin-asignar' : `day-section-${seccion.id}`"
    >
      <div class="flex items-baseline justify-between gap-2 bg-slate-50 px-4 py-1.5">
        <h3
          class="truncate text-xs font-semibold uppercase tracking-wide text-slate-600"
          :data-testid="
            seccion.id === null ? 'day-person-sin-asignar' : `day-person-${seccion.id}`
          "
        >
          {{ seccion.name }}
        </h3>
        <span v-if="seccion.department_name" class="shrink-0 text-[10px] text-slate-400">
          {{ seccion.department_name }}
        </span>
      </div>

      <ul v-if="seccion.tasks.length" class="divide-y divide-slate-100">
        <li
          v-for="task in seccion.tasks"
          :key="task.id"
          class="cursor-pointer px-4 py-2"
          data-testid="day-task"
          @click="emit('open-task', task.id)"
        >
          <div
            class="flex items-start gap-3 rounded px-2 py-1.5 text-white"
            :style="{ backgroundColor: task.project_color }"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium" :title="task.title">{{ task.title }}</p>
              <p class="mt-0.5 truncate text-[11px] opacity-80">
                {{ columnLabel(task.status) }} · {{ task.project_name }}
              </p>
            </div>
            <span class="shrink-0 text-[11px] tabular-nums opacity-80">
              {{ task.start }} - {{ task.end }}
            </span>
          </div>
        </li>
      </ul>

      <p v-else class="px-4 py-3 text-sm text-slate-400" data-testid="day-section-empty">
        Sin tareas
      </p>
    </div>
  </div>
</template>
