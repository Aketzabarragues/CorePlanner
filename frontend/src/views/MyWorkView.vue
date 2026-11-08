<script setup>
/**
 * Mi trabajo.
 *
 * Vista personal: lo que la persona tiene asignado y cuanto le carga cada
 * semana. El periodo es una ventana continua de semanas, la misma que ve en
 * la matriz de capacidad global, de modo que las dos vistas hablan de las
 * mismas semanas.
 *
 * La pantalla avisa de las semanas en las que se pasa de capacidad, ensena el
 * grafico de las semanas que vienen y deja cambiar el estado de una tarea sin
 * salir de ella.
 */
import { computed, onMounted, ref } from 'vue'

import { myWorkApi, tasksApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import AlertBanner from '../components/common/AlertBanner.vue'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import LoadBars from '../components/LoadBars.vue'
import { useAuthStore } from '../stores/auth'
import { KANBAN_COLUMNS, columnLabel, formatHours, statusPill } from '../utils/kanban'
import { loadAspect, loadBarWidth, loadLabel, loadRatio, loadState } from '../utils/load'
import { weekRangeLabel, weekNumber, weekTitle } from '../utils/weeks'

const auth = useAuthStore()

const report = ref(null)
const error = ref(null)
const loading = ref(true)
const notice = ref(null)
const saving = ref(false)
const tab = ref('now')

const TABS = [
  { name: 'now', label: 'Esta semana' },
  { name: 'next', label: 'Próximas' },
  { name: 'done', label: 'Completadas' },
]

const weeks = computed(() => report.value?.weeks ?? [])
const tasks = computed(() => report.value?.tasks ?? [])
const totalHours = computed(() => report.value?.total_hours ?? 0)

/** Semana de referencia: la actual si cae en el periodo. */
const currentWeek = computed(() => {
  const key = report.value?.current_week
  return weeks.value.find((item) => item.week === key) ?? null
})

/** Semanas en las que la persona se pasa de capacidad. */
const overloaded = computed(() => weeks.value.filter((item) => item.is_overloaded))

/** Tareas que tocan la semana de referencia. */
const weekTasks = computed(() => {
  const key = report.value?.current_week ?? ''
  return tasks.value.filter((item) => (item.weeks ?? []).includes(key))
})

/** Proyectos en los que trabaja en la semana de referencia. */
const weekProjects = computed(
  () => new Set(weekTasks.value.map((item) => item.project_id)).size,
)

/**
 * El siguiente festivo del periodo y lo que le quita de capacidad.
 *
 * Solo se mira hacia delante: un festivo pasado no avisa de nada.
 */
const nextHoliday = computed(() => {
  const key = report.value?.current_week ?? ''
  const siguiente = weeks.value.find((item) => item.week > key && item.holidays?.length)
  if (!siguiente) return null
  const festivo = siguiente.holidays[0]
  const perdida =
    Number(siguiente.capacity_without ?? 0) - Number(siguiente.capacity ?? 0)
  return {
    date: festivo.date,
    name: festivo.name,
    week: siguiente.week,
    perdida: perdida > 0 ? perdida : null,
  }
})

/** Tareas que todavia no estan completadas. */
const pendingTasks = computed(() => tasks.value.filter((item) => item.status !== 'done'))

/** Tareas de la pestana abierta. */
const visibleTasks = computed(() => {
  const key = report.value?.current_week ?? ''
  if (tab.value === 'done') return tasks.value.filter((item) => item.status === 'done')
  if (tab.value === 'now') {
    return pendingTasks.value.filter((item) => (item.weeks ?? []).includes(key))
  }
  return pendingTasks.value.filter(
    (item) =>
      (item.weeks ?? []).some((week) => week > key) &&
      !(item.weeks ?? []).includes(key),
  )
})

/** Aspecto de la semana de referencia: barra, pila y porcentaje. */
const card = computed(() => {
  const cell = currentWeek.value
  if (!cell) return null
  const state = loadState(cell.hours, cell.capacity)
  const aspect = loadAspect(state)
  const ratio = loadRatio(cell.hours, cell.capacity)
  return {
    state,
    ratio,
    ratioText: ratio === null ? 'sin capacidad' : `${ratio} %`,
    barWidth: loadBarWidth(cell.hours, cell.capacity),
    barClass: aspect.bar,
    pillClass: [aspect.cell, aspect.text].filter(Boolean).join(' '),
    label: loadLabel(state),
  }
})

async function load() {
  try {
    const token = await auth.ensureSession()
    report.value = await myWorkApi.list(token)
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

/** Vuelve a pedir los datos y enseña el esqueleto mientras llegan. */
async function reintentar() {
  loading.value = true
  await load()
}

/**
 * Cambia el estado de una tarea.
 *
 * La tarea se mueve al instante y la lista se recarga con lo que conteste el
 * servidor, que es lo que manda. Si la API falla, el desplegable vuelve a su
 * valor anterior.
 */
async function changeStatus(task, event) {
  const status = event.target.value
  if (!status || status === task.status) return
  saving.value = true
  try {
    await tasksApi.update(auth.token, task.id, { status })
    task.status = status
    notice.value = `"${task.title}" pasa a ${columnLabel(status)}.`
    error.value = null
  } catch (err) {
    error.value = err.message
    event.target.value = task.status
  } finally {
    saving.value = false
    await load()
  }
}

/** Fechas de una tarea en texto corto: "2 - 4 nov 2026". */
function taskDates(task) {
  if (!task.start_date || !task.end_date) return 'Sin fechas'
  return `${task.start_date} → ${task.end_date}`
}

onMounted(load)
useTaskReload(load)
</script>

<template>
  <div>
    <PageHeader
      title="Mi trabajo"
      subtitle="Lo que tienes asignado y cuánto carga cada semana."
    >
      <template #actions>
        <p v-if="!loading && !error" class="text-sm text-slate-600">
          {{ tasks.length }} tarea(s) · {{ formatHours(totalHours) }} en el período
        </p>
      </template>
    </PageHeader>

    <AsyncState
      :loading="loading"
      :error="error"
      error-test-id="my-work-error"
      loading-label="Cargando tu trabajo"
      @retry="reintentar"
    >
      <AlertBanner
        v-for="semana in overloaded"
        :key="semana.week"
        variant="warning"
        class="mb-3"
        data-testid="my-work-overload"
      >
        <span class="font-medium">
          La semana {{ weekNumber(semana.week) }} está sobrecargada:
          {{ formatHours(semana.hours) }} para {{ formatHours(semana.capacity) }} de
          capacidad.
        </span>
        Tienes {{ formatHours(semana.hours - semana.capacity) }} por encima. Reparte
        el trabajo o avisa al responsable del proyecto.
      </AlertBanner>

      <AlertBanner
        v-if="notice"
        variant="success"
        class="mb-3"
        dismissible
        data-testid="my-work-notice"
        @dismiss="notice = null"
      >
        {{ notice }}
      </AlertBanner>

      <div class="mb-6 grid gap-4 lg:grid-cols-3">
        <section
          aria-label="Carga de las próximas semanas"
          class="rounded border border-slate-200 bg-white p-4 lg:col-span-2"
        >
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-sm font-semibold text-siemens-900">
              Mi carga, próximas semanas
            </h2>
            <span class="text-xs text-slate-500">
              La línea discontinua marca el 100 % de tu capacidad
            </span>
          </div>
          <LoadBars
            :weeks="weeks"
            title="Carga de las próximas semanas"
            test-id="my-work-bars"
          />
        </section>

        <section
          aria-label="Resumen de esta semana"
          class="rounded border border-slate-200 bg-white p-4"
        >
          <h2 class="text-sm font-semibold text-siemens-900">Esta semana</h2>
          <template v-if="card">
            <p class="mt-1 text-xs text-slate-500">
              Semana {{ weekTitle(currentWeek.week) }} ·
              {{ weekRangeLabel(currentWeek.week) }}
            </p>
            <p class="mt-2 flex items-baseline gap-2">
              <span class="text-3xl font-semibold tabular-nums text-siemens-900">
                {{ formatHours(currentWeek.hours) }}
              </span>
              <span class="text-sm text-slate-500">
                de {{ formatHours(currentWeek.capacity) }}
              </span>
            </p>
            <span class="mt-2 block h-2 w-full rounded bg-slate-200">
              <span
                class="block h-2 rounded"
                :class="card.barClass"
                :style="{ width: `${card.barWidth}%` }"
              />
            </span>
            <span
              class="mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
              :class="card.pillClass"
              data-testid="my-work-card-state"
            >
              {{ card.label }} · {{ card.ratioText }}
            </span>
            <div class="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
              <p>
                <span class="font-semibold text-slate-800">{{ weekTasks.length }}</span>
                {{ weekTasks.length === 1 ? 'tarea' : 'tareas' }} en
                {{ weekProjects }} {{ weekProjects === 1 ? 'proyecto' : 'proyectos' }}
              </p>
              <p v-if="nextHoliday" class="mt-1" data-testid="my-work-next-holiday">
                Próximo festivo:
                <span class="font-semibold text-slate-800">{{ nextHoliday.date }}</span>
                <span v-if="nextHoliday.perdida">
                  (−{{ formatHours(nextHoliday.perdida) }} de capacidad)
                </span>
              </p>
            </div>
          </template>
          <p v-else class="mt-2 text-sm text-slate-500">
            No hay ninguna semana en el periodo de planificación.
          </p>
        </section>
      </div>

      <section aria-label="Mis tareas" class="rounded border border-slate-200 bg-white p-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-sm font-semibold text-siemens-900">Mis tareas</h2>
          <div
            role="group"
            aria-label="Filtrar tareas"
            class="flex overflow-hidden rounded border border-slate-300 bg-white"
          >
            <button
              v-for="item in TABS"
              :key="item.name"
              type="button"
              :aria-pressed="tab === item.name"
              class="min-h-10 border-0 px-4 text-sm font-medium"
              :class="
                tab === item.name
                  ? 'bg-siemens-900 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              "
              :data-testid="`my-work-tab-${item.name}`"
              @click="tab = item.name"
            >
              {{ item.label }}
            </button>
          </div>
        </div>

        <div role="list" class="flex flex-col">
          <div
            v-for="task in visibleTasks"
            :key="task.id"
            role="listitem"
            class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 py-3"
            data-testid="my-work-task"
          >
            <div class="min-w-0 flex-1 basis-60">
              <p class="text-sm font-semibold text-slate-900">{{ task.title }}</p>
              <p class="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span
                  class="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700"
                >
                  {{ task.project_name }}
                </span>
                <span>{{ taskDates(task) }}</span>
              </p>
            </div>
            <span class="w-14 text-right text-sm font-semibold tabular-nums text-slate-800">
              {{ formatHours(task.hours) }}
            </span>
            <span
              class="w-32 rounded-full px-2.5 py-0.5 text-center text-xs font-semibold"
              :class="statusPill(task.status)"
            >
              {{ columnLabel(task.status) }}
            </span>
            <select
              :value="task.status"
              :disabled="saving"
              :aria-label="`Cambiar el estado de ${task.title}`"
              class="h-10 rounded border border-slate-300 bg-white px-2 text-sm text-slate-700 disabled:opacity-60"
              data-testid="my-work-status"
              @change="changeStatus(task, $event)"
            >
              <option v-for="option in KANBAN_COLUMNS" :key="option.status" :value="option.status">
                {{ option.label }}
              </option>
            </select>
          </div>
          <p
            v-if="!visibleTasks.length"
            class="border-t border-slate-100 py-4 text-center text-sm text-slate-500"
            data-testid="my-work-empty"
          >
            No tienes tareas en esta pestaña.
          </p>
        </div>
      </section>
    </AsyncState>
  </div>
</template>
