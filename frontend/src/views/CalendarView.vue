<script setup>
/**
 * Calendario de la planificacion.
 *
 * La misma planificacion que muestra el Gantt, vista como una rejilla de meses:
 * cada dia del mes con las tareas que lo ocupan. Los dias no laborables
 * aparecen marcados en su celda, porque forman parte del calendario de
 * trabajo.
 *
 * Vive en los dos espacios: sin identificador muestra las tareas de los
 * proyectos visibles y con identificador las de ese proyecto.
 */
import { computed, onMounted, ref, watch } from 'vue'

import { calendarApi, overviewApi, projectsApi } from '../api/client'
import { useAuthStore } from '../stores/auth'
import {
  currentMonthKey,
  monthGrid,
  monthLabel,
  shiftMonth,
  tasksOnDay,
  weekdayNames,
} from '../utils/month'

const props = defineProps({
  id: { type: [String, Number], default: null },
})

const auth = useAuthStore()

const month = ref(currentMonthKey())
const tasks = ref([])
const members = ref([])
const undatedTaskIds = ref([])
const nonWorkingDays = ref([])
const error = ref(null)
const loading = ref(true)

/** Sin identificador de proyecto el calendario es global. */
const isGlobal = computed(() => props.id === null || props.id === undefined)

const weeks = computed(() => monthGrid(month.value))

/** Tareas de cada dia de la rejilla. */
const tasksByDay = computed(() => {
  const map = new Map()
  for (const cell of weeks.value.flat()) {
    map.set(cell.date, tasksOnDay(tasks.value, cell.date))
  }
  return map
})

/** Dias no laborables de cada fecha. */
const nonWorkingByDate = computed(() => {
  const map = new Map()
  for (const day of nonWorkingDays.value) {
    const list = map.get(day.date) ?? []
    list.push(day)
    map.set(day.date, list)
  }
  return map
})

async function load() {
  try {
    const token = await auth.ensureSession()
    const [feed, days] = await Promise.all([
      isGlobal.value ? overviewApi.gantt(token) : projectsApi.gantt(token, props.id),
      calendarApi.list(token),
    ])
    tasks.value = feed.tasks ?? []
    members.value = feed.members ?? []
    undatedTaskIds.value = feed.undated_task_ids ?? []
    nonWorkingDays.value = days ?? []
    error.value = null
  } catch (err) {
    error.value = err.message
  }
}

function moveMonth(delta) {
  month.value = shiftMonth(month.value, delta)
}

function goToday() {
  month.value = currentMonthKey()
}

onMounted(async () => {
  await load()
  loading.value = false
})

watch(
  () => props.id,
  async () => {
    loading.value = true
    await load()
    loading.value = false
  },
)
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-siemens-900">
          {{ isGlobal ? 'Calendario Global' : 'Calendario' }}
        </h1>
        <p class="mt-1 text-sm text-slate-500">
          {{
            isGlobal
              ? 'Las tareas de los proyectos visibles, dia a dia.'
              : 'Las tareas del proyecto, dia a dia.'
          }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700"
          data-testid="calendar-prev"
          @click="moveMonth(-1)"
        >
          ‹
        </button>
        <span class="min-w-36 text-center text-sm font-medium text-siemens-900" data-testid="calendar-month">
          {{ monthLabel(month) }}
        </span>
        <button
          type="button"
          class="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700"
          data-testid="calendar-next"
          @click="moveMonth(1)"
        >
          ›
        </button>
        <button
          type="button"
          class="rounded border border-siemens-900 bg-siemens-900 px-3 py-1.5 text-sm text-white"
          data-testid="calendar-today"
          @click="goToday"
        >
          Hoy
        </button>
      </div>
    </header>

    <p v-if="loading" class="text-sm text-slate-500">Cargando...</p>

    <p
      v-else-if="error"
      class="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      data-testid="calendar-error"
    >
      {{ error }}
    </p>

    <template v-else>
      <ul v-if="members.length" class="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
        <li v-for="member in members" :key="member.user_id" class="flex items-center gap-1.5">
          <span :class="['inline-block h-3 w-3 rounded-sm', member.css_class]" />
          {{ member.name }}
        </li>
      </ul>

      <p v-if="undatedTaskIds.length" class="mb-3 text-xs text-amber-700">
        {{ undatedTaskIds.length }} tarea(s) sin fechas no aparecen en el calendario.
      </p>

      <div class="overflow-x-auto rounded border border-slate-200 bg-white">
        <table class="w-full border-collapse text-sm" data-testid="calendar-grid">
          <thead>
            <tr class="bg-slate-100">
              <th
                v-for="name in weekdayNames()"
                :key="name"
                class="border border-slate-200 px-2 py-1.5 text-left text-xs font-medium uppercase tracking-wide text-slate-500"
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
                class="align-top border border-slate-200 p-1.5"
                :class="cell.inMonth ? 'bg-white' : 'bg-slate-50'"
                :data-testid="`calendar-cell-${cell.date}`"
              >
                <div class="mb-1 flex flex-wrap items-center gap-1">
                  <span
                    class="text-xs font-medium"
                    :class="cell.inMonth ? 'text-slate-700' : 'text-slate-400'"
                  >
                    {{ cell.day }}
                  </span>
                  <template
                    v-for="day in nonWorkingByDate.get(cell.date) ?? []"
                    :key="day.id"
                  >
                    <span
                      v-if="day.scope === 'global'"
                      class="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                      :title="day.name"
                      data-testid="calendar-non-working"
                    >
                      {{ day.name }}
                    </span>
                    <span
                      v-else
                      class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                      :title="day.department_name ? `${day.name} (${day.department_name})` : day.name"
                      data-testid="calendar-non-working"
                    >
                      {{ day.name }}
                    </span>
                  </template>
                </div>

                <div v-if="!cell.weekend" class="space-y-1">
                  <div
                    v-for="task in tasksByDay.get(cell.date) ?? []"
                    :key="task.id"
                    class="truncate rounded px-1.5 py-0.5 text-[11px] text-white"
                    :class="task.custom_class || 'bg-slate-500'"
                    :title="`${task.title} · ${task.assigned_name ?? 'sin asignar'} · ${task.project_name}`"
                    data-testid="calendar-task"
                  >
                    {{ task.title }}
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="mt-3 text-xs text-slate-500">
        Las tareas se ven de lunes a viernes: el motor de capacidad solo reparte
        horas entre dias laborables. El fin de semana queda vacio.
      </p>
    </template>
  </div>
</template>
