<script setup>
/**
 * Desglose de las horas de una celda: que tareas componen ese total.
 *
 * Desde aqui se puede reasignar una tarea a otra persona o cambiarle las
 * fechas y las horas. Cada cambio se guarda y la matriz se recalcula.
 */
import { computed, ref } from 'vue'

import TaskForm from './TaskForm.vue'

const props = defineProps({
  cell: { type: Object, required: true },
  tasks: { type: Array, required: true },
  members: { type: Array, required: true },
  projects: { type: Array, default: () => [] },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['save', 'delete', 'close', 'reassign'])

const editing = ref(null)
const reassigning = ref(null)

const memberName = computed(() => {
  const names = {}
  for (const member of props.members) names[member.user_id] = member.name
  return names
})

/** Nombre del proyecto de una tarea, si se ha dado la lista de proyectos. */
const projectName = computed(() => {
  const names = {}
  for (const project of props.projects) names[project.id] = project.name
  return (task) => names[task.project_id] ?? ''
})

const otherMembers = computed(() =>
  props.members.filter((member) => member.user_id !== props.cell.user_id),
)

function taskHours(task) {
  // Las horas de la tarea se muestran tal cual, sin repartir: el reparto
  // por semana lo hace el backend.
  return Number(task.estimated_hours).toFixed(2)
}

function taskRange(task) {
  if (!task.start_date || !task.end_date) return 'sin fechas'
  return `${task.start_date} -> ${task.end_date}`
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-start justify-between">
      <div>
        <h3 class="text-base font-semibold text-siemens-900">
          {{ cell.name }} en {{ cell.week }}
        </h3>
        <p class="text-sm text-slate-500">
          {{ cell.hours }} h de {{ cell.weekly_base_hours }} h base
          <span v-if="cell.is_overloaded" class="ml-1 font-semibold text-red-700">
            (sobrecargado)
          </span>
        </p>
      </div>
      <button
        type="button"
        class="rounded border border-slate-300 px-2 py-1 text-xs"
        @click="emit('close')"
      >
        Cerrar
      </button>
    </div>

    <div v-if="editing" class="rounded border border-slate-200 bg-slate-50 p-3">
      <TaskForm
        :task="editing"
        :members="members"
        :saving="saving"
        @save="(payload) => emit('save', editing.id, payload)"
        @cancel="editing = null"
      />
    </div>

    <ul v-else class="space-y-2">
      <li
        v-for="task in tasks"
        :key="task.id"
        class="rounded border border-slate-200 bg-white p-3"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{{ task.title }}</p>
            <p class="text-xs text-slate-500">
              <span v-if="projectName(task)" class="font-medium text-slate-600">
                {{ projectName(task) }} ·
              </span>
              {{ taskRange(task) }} ·
              {{ task.assigned_to ? memberName[task.assigned_to] ?? 'Desconocido' : 'Sin asignar' }}
            </p>
          </div>
          <span class="shrink-0 text-sm font-semibold tabular-nums">
            {{ taskHours(task) }} h
          </span>
        </div>

        <div
          v-if="reassigning && reassigning.task.id === task.id"
          class="rounded border border-slate-200 bg-slate-50 p-2"
        >
          <label class="block">
            <span class="text-xs font-medium">Reasignar a</span>
            <div class="mt-1 flex gap-2">
              <select
                v-model="reassigning.target"
                class="flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
              >
                <option v-for="member in otherMembers" :key="member.user_id" :value="member.user_id">
                  {{ member.name }}
                </option>
              </select>
              <button
                type="button"
                class="rounded bg-siemens-900 px-2 py-1 text-xs text-white"
                @click="emit('reassign', reassigning.task, reassigning.target); reassigning = null"
              >
                Mover
              </button>
              <button
                type="button"
                class="rounded border border-slate-300 px-2 py-1 text-xs"
                @click="reassigning = null"
              >
                Cancelar
              </button>
            </div>
          </label>
        </div>

        <div v-else class="mt-2 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            class="rounded border border-slate-300 px-2 py-1"
            @click="editing = task"
          >
            Editar
          </button>
          <button
            type="button"
            class="rounded border border-slate-300 px-2 py-1"
            :disabled="otherMembers.length === 0"
            @click="reassigning = { task, target: otherMembers[0]?.user_id ?? null }"
          >
            Reasignar
          </button>
          <button
            type="button"
            class="rounded border border-red-300 px-2 py-1 text-red-700"
            @click="emit('delete', task)"
          >
            Eliminar
          </button>
        </div>
      </li>

      <li
        v-if="tasks.length === 0"
        class="rounded border border-dashed border-slate-300 p-3 text-sm text-slate-500"
      >
        No hay tareas en esta celda.
      </li>
    </ul>
  </div>
</template>
