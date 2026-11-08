<script setup>
import { computed, onMounted, ref } from 'vue'

import { overviewApi, projectsApi, tasksApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import PlannerMatrix from '../components/PlannerMatrix.vue'
import { useAuthStore } from '../stores/auth'
import { isoDate, projectSplit, usageRatio, weeksRange } from '../utils/planner'
import { weekMonday } from '../utils/weeks'

const auth = useAuthStore()

const view = ref('task')
const report = ref(null)
const tasks = ref([])
const projectNames = ref(new Map())
const error = ref(null)
const notice = ref(null)
const loading = ref(true)
const dragging = ref(null)

const weeks = computed(() => report.value?.weeks ?? [])
const rows = computed(() => report.value?.rows ?? [])

/** Clase de cada pestana del conmutador de vista. */
const taskTabClass = computed(() =>
  view.value === 'task' ? 'bg-siemens-900 text-white' : 'bg-white text-slate-700',
)
const personTabClass = computed(() =>
  view.value === 'person' ? 'bg-siemens-900 text-white' : 'bg-white text-slate-700',
)
const tableTabClass = computed(() =>
  view.value === 'table' ? 'bg-siemens-900 text-white' : 'bg-white text-slate-700',
)

async function load() {
  loading.value = true
  try {
    const token = await auth.ensureSession()
    const capacity = await overviewApi.capacity(token)
    report.value = capacity
    const proyectos = await projectsApi.list(token)
    projectNames.value = new Map(proyectos.map((proyecto) => [proyecto.id, proyecto.name]))
    const rango = weeksRange(capacity.weeks ?? [])
    tasks.value = rango ? await tasksApi.list(token, rango) : []
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

/** Tareas de una persona en una semana. */
function tasksOf(userId, week) {
  const monday = weekMonday(week)
  const sunday = new Date(monday.getTime())
  sunday.setUTCDate(sunday.getUTCDate() + 6)
  const desde = isoDate(monday)
  const hasta = isoDate(sunday)
  return tasks.value.filter(
    (task) =>
      task.assigned_to === userId &&
      task.start_date &&
      task.end_date &&
      task.start_date <= hasta &&
      task.end_date >= desde,
  )
}

/** Reparto por proyecto de una celda. */
function splitOf(row, week) {
  return projectSplit(tasksOf(row.user_id, week), projectNames.value)
}

/** Fila de asignaciones: una por persona y semana con carga. */
const asignaciones = computed(() => {
  const filas = []
  for (const row of rows.value) {
    for (const cell of row.cells) {
      if (!cell.hours) continue
      const lista = tasksOf(row.user_id, cell.week)
      if (!lista.length) continue
      filas.push({ row, cell, tasks: lista })
    }
  }
  return filas
})

function startDrag(event, task) {
  dragging.value = task
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(task.id))
}

/**
 * Suelta una tarea en la celda de otra persona.
 *
 * Solo cambia el responsable: las horas se recalculan en el backend y la
 * matriz se vuelve a pedir.
 */
async function dropOn(row) {
  const task = dragging.value
  dragging.value = null
  if (!task || task.assigned_to === row.user_id) return
  try {
    await tasksApi.update(auth.token, task.id, { assigned_to: row.user_id })
    notice.value = `"${task.title}" pasa a ${row.name}.`
    await load()
  } catch (err) {
    error.value = err.message
  }
}

onMounted(load)
useTaskReload(load)
</script>

<template>
  <div>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-siemens-900">Planificador de recursos</h1>
        <p class="mt-1 text-sm text-slate-500">
          Tres vistas sobre el mismo rango de semanas: cuanto se ocupa cada
          persona, en que y con quien.
        </p>
      </div>

      <div class="flex overflow-hidden rounded border border-slate-300">
        <button
          type="button"
          class="px-3 py-1.5 text-sm"
          :class="taskTabClass"
          data-testid="planner-view-task"
          @click="view = 'task'"
        >
          Carga por tarea
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-sm"
          :class="personTabClass"
          data-testid="planner-view-person"
          @click="view = 'person'"
        >
          Linea de tiempo por persona
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-sm"
          :class="tableTabClass"
          data-testid="planner-view-table"
          @click="view = 'table'"
        >
          Tabla de planificacion
        </button>
      </div>
    </div>

    <p v-if="error" class="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="planner-error">
      {{ error }}
    </p>
    <p v-if="notice" class="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" data-testid="planner-notice">
      {{ notice }}
    </p>

    <section class="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 class="text-sm font-semibold text-slate-800">
        {{ view === 'task' ? 'Carga por persona y semana' : view === 'person' ? 'Linea de tiempo por persona' : 'Tabla de planificacion' }}
      </h2>
      <p class="mt-0.5 text-xs text-slate-500">
        <template v-if="view === 'task'">
          Celda = horas planificadas. En rojo, las semanas que superan las horas base.
        </template>
        <template v-else-if="view === 'person'">
          Cada bloque es una tarea. Arrastralo a la celda de otra persona para
          cambiarle el responsable.
        </template>
        <template v-else>
          Cada celda reparte las horas entre los proyectos de la persona.
        </template>
      </p>

      <div class="mt-3">
        <PlannerMatrix :weeks="weeks" :rows="rows">
          <template v-if="view === 'task'" #cell="{ cell }">
            <span class="block text-sm font-semibold tabular-nums text-slate-800">
              {{ cell.hours }}
            </span>
            <span class="block text-[11px] tabular-nums text-slate-500">
              {{ usageRatio(cell) === null ? '—' : `${usageRatio(cell)}%` }}
            </span>
          </template>

          <template v-else-if="view === 'person'" #cell="{ cell, row }">
            <div
              class="min-h-16 space-y-1 rounded p-1"
              :class="dragging ? 'bg-slate-50 ring-1 ring-slate-300' : ''"
              data-testid="planner-drop"
              @dragover.prevent
              @drop.prevent="dropOn(row)"
            >
              <div
                v-for="task in tasksOf(row.user_id, cell.week)"
                :key="task.id"
                draggable="true"
                class="cursor-grab truncate rounded bg-siemens-900 px-1.5 py-0.5 text-[10px] font-medium text-white"
                :title="task.title"
                data-testid="planner-task"
                @dragstart="startDrag($event, task)"
              >
                {{ task.title }}
              </div>
              <p
                v-if="!tasksOf(row.user_id, cell.week).length"
                class="text-[10px] text-slate-400"
              >
                —
              </p>
            </div>
          </template>

          <template v-else #cell="{ cell, row }">
            <div class="flex flex-wrap gap-1">
              <span
                v-for="split in splitOf(row, cell.week)"
                :key="split.projectId"
                class="rounded bg-slate-200 px-1 py-0.5 text-[10px] font-medium text-slate-700"
                :title="split.name"
                data-testid="planner-split"
              >
                {{ split.name }} ×{{ split.count }}
              </span>
              <span
                v-if="!splitOf(row, cell.week).length"
                class="text-[10px] text-slate-400"
              >
                —
              </span>
            </div>
            <p class="mt-1 text-[11px] tabular-nums text-slate-500">
              {{ cell.hours }} h
              <template v-if="usageRatio(cell) !== null">
                · {{ usageRatio(cell) }}%
              </template>
            </p>
          </template>
        </PlannerMatrix>

        <p v-if="!rows.length && !loading" class="mt-4 text-center text-sm text-slate-500" data-testid="planner-empty">
          Todavia no hay nada planificado que repartir.
        </p>
      </div>
    </section>

    <section v-if="view === 'task'" class="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 class="text-sm font-semibold text-slate-800">Asignaciones por persona</h2>
      <p class="mt-0.5 text-xs text-slate-500">Reparto dentro de cada semana.</p>
      <table class="mt-3 w-full text-sm" data-testid="planner-assignments">
        <thead>
          <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th class="whitespace-nowrap py-1.5 pr-2 font-medium">Persona</th>
            <th class="whitespace-nowrap py-1.5 pr-2 font-medium">Semana</th>
            <th class="py-1.5 pr-2 font-medium">Tareas</th>
            <th class="whitespace-nowrap py-1.5 text-right font-medium">Horas</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="fila in asignaciones"
            :key="`${fila.row.user_id}-${fila.cell.week}`"
            class="border-b border-slate-100"
            data-testid="planner-assignment"
          >
            <td class="py-1.5 pr-2 text-slate-900">{{ fila.row.name }}</td>
            <td class="py-1.5 pr-2 text-slate-700">{{ fila.cell.week }}</td>
            <td class="py-1.5 pr-2">
              <span
                v-for="task in fila.tasks"
                :key="task.id"
                class="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700"
                :title="task.title"
              >
                {{ task.title }}
              </span>
            </td>
            <td class="py-1.5 text-right font-medium tabular-nums text-slate-800">
              {{ fila.cell.hours }} h
            </td>
          </tr>
          <tr v-if="!asignaciones.length">
            <td colspan="4" class="py-4 text-center text-slate-500">
              No hay tareas asignadas en este rango.
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>
