<script setup>
/**
 * Calendario de la planificacion.
 *
 * La misma planificacion que muestra el Gantt, vista como una rejilla de meses:
 * cada dia del mes con las tareas que lo ocupan. Los dias no laborables
 * aparecen marcados en su celda, porque forman parte del calendario de
 * trabajo.
 *
 * La vista semanal es el mismo calendario con otro corte: una columna por dia
 * laborable de la semana ISO, con mas detalle en cada tarea.
 *
 * Vive en los dos espacios: sin identificador muestra las tareas de los
 * proyectos visibles y con identificador las de ese proyecto.
 */
import { computed, onMounted, ref, watch } from 'vue'

import { calendarApi, overviewApi, projectsApi } from '../api/client'
import WeekGrid from '../components/WeekGrid.vue'
import { useAuthStore } from '../stores/auth'
import {
  currentMonthKey,
  monthGrid,
  monthLabel,
  shiftMonth,
  splitTasks,
  tasksOnDay,
  weekdayNames,
} from '../utils/month'
import {
  currentWeekKey,
  isoWeekKey,
  shiftWeek,
  weekRangeLabel,
  weekWorkdays,
} from '../utils/weeks'

const props = defineProps({
  id: { type: [String, Number], default: null },
})

const auth = useAuthStore()

const view = ref('month')
const month = ref(currentMonthKey())
const week = ref(currentWeekKey())
const tasks = ref([])
const members = ref([])
const undatedTaskIds = ref([])
const nonWorkingDays = ref([])
const error = ref(null)
const loading = ref(true)

/** Sin identificador de proyecto el calendario es global. */
const isGlobal = computed(() => props.id === null || props.id === undefined)

/** Clase de cada pestana del conmutador de vista. */
const monthTabClass = computed(() =>
  view.value === 'month' ? 'bg-siemens-900 text-white' : 'bg-white text-slate-700',
)
const weekTabClass = computed(() =>
  view.value === 'week' ? 'bg-siemens-900 text-white' : 'bg-white text-slate-700',
)

const weeks = computed(() => monthGrid(month.value))

/**
 * Tareas de cada dia de la rejilla.
 *
 * La celda tiene un alto fijo, asi que de cada dia solo se ven unas cuantas
 * tareas: las demas se cuentan en un "+N mas".
 */
const tasksByDay = computed(() => {
  const map = new Map()
  for (const cell of weeks.value.flat()) {
    map.set(cell.date, splitTasks(tasksOnDay(tasks.value, cell.date)))
  }
  return map
})

/** Titulos de las tareas que no caben en la celda de un dia. */
function hiddenTitles(date) {
  return (tasksByDay.value.get(date)?.hidden ?? []).map((task) => task.title).join(' · ')
}

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

function step(delta) {
  if (view.value === 'week') {
    week.value = shiftWeek(week.value, delta)
    return
  }
  month.value = shiftMonth(month.value, delta)
}

/**
 * Cambia entre la vista de mes y la de semana.
 *
 * Al cambiar de vista cada una se coloca donde le toca: si el mes que se estaba
 * viendo es el mes en curso, la semana es la de hoy; si no, la del primer dia
 * de ese mes. Al volver al mes, el mes es el de la semana en pantalla.
 */
function setView(next) {
  if (next === view.value) return
  if (next === 'week') {
    const [year, monthNumber] = month.value.split('-').map(Number)
    const now = new Date()
    const sameMonth = now.getFullYear() === year && now.getMonth() === monthNumber - 1
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    const first = new Date(Date.UTC(year, monthNumber - 1, 1))
    week.value = isoWeekKey(sameMonth ? today : first)
  } else {
    month.value = weekWorkdays(week.value)[0].date.slice(0, 7)
  }
  view.value = next
}

function goToday() {
  month.value = currentMonthKey()
  week.value = currentWeekKey()
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

      <div class="flex flex-wrap items-center gap-2">
        <div class="flex overflow-hidden rounded border border-slate-300">
          <button
            type="button"
            class="px-3 py-1.5 text-sm"
            :class="monthTabClass"
            data-testid="calendar-view-month"
            @click="setView('month')"
          >
            Mes
          </button>
          <button
            type="button"
            class="px-3 py-1.5 text-sm"
            :class="weekTabClass"
            data-testid="calendar-view-week"
            @click="setView('week')"
          >
            Semana
          </button>
        </div>

        <button
          type="button"
          class="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700"
          data-testid="calendar-prev"
          @click="step(-1)"
        >
          ‹
        </button>
        <span
          v-if="view === 'month'"
          class="min-w-36 text-center text-sm font-medium text-siemens-900"
          data-testid="calendar-month"
        >
          {{ monthLabel(month) }}
        </span>
        <span
          v-else
          class="min-w-44 text-center text-sm font-medium text-siemens-900"
          data-testid="calendar-week"
        >
          {{ weekRangeLabel(week) }}
          <span class="ml-1 text-xs font-normal text-slate-400">{{ week }}</span>
        </span>
        <button
          type="button"
          class="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700"
          data-testid="calendar-next"
          @click="step(1)"
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

      <div
        v-if="view === 'month'"
        class="overflow-x-auto rounded border border-slate-200 bg-white"
      >
        <table class="w-full table-fixed border-collapse text-sm" data-testid="calendar-grid">
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
                class="h-28 overflow-hidden align-top border border-slate-200 p-1.5"
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

                <div v-if="!cell.weekend" class="space-y-1 overflow-hidden">
                  <div
                    v-for="task in tasksByDay.get(cell.date)?.visible ?? []"
                    :key="task.id"
                    class="truncate rounded px-1.5 py-0.5 text-[11px] text-white"
                    :class="task.custom_class || 'bg-slate-500'"
                    :title="`${task.title} · ${task.assigned_name ?? 'sin asignar'} · ${task.project_name}`"
                    data-testid="calendar-task"
                  >
                    {{ task.title }}
                  </div>
                  <p
                    v-if="(tasksByDay.get(cell.date)?.hidden.length ?? 0) > 0"
                    class="px-1 text-[10px] font-medium text-slate-500"
                    :title="hiddenTitles(cell.date)"
                    data-testid="calendar-more"
                  >
                    +{{ tasksByDay.get(cell.date)?.hidden.length }} más
                  </p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <WeekGrid
        v-else
        :week-key="week"
        :tasks="tasks"
        :non-working-days="nonWorkingDays"
      />

      <p class="mt-3 text-xs text-slate-500">
        Las tareas se ven de lunes a viernes: el motor de capacidad solo reparte
        horas entre dias laborables. El fin de semana queda vacio.
      </p>
    </template>
  </div>
</template>
