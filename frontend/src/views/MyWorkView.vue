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
import BaseCard from '../components/common/BaseCard.vue'
import PageHeader from '../components/common/PageHeader.vue'
import LoadBars from '../components/LoadBars.vue'
import { useAuthStore } from '../stores/auth'
import { useTaskStatusesStore } from '../stores/taskStatuses'
import { useToastStore } from '../stores/toast'
import {
  DEFAULT_TASK_STATUSES,
  columnLabel,
  estadosCon,
  formatHours,
  statusPill,
} from '../utils/kanban'
import { loadAspect, loadBarWidth, loadLabel, loadRatio, loadState } from '../utils/load'
import { weekRangeLabel, weekNumber, weekTitle } from '../utils/weeks'
import { plural } from '../utils/plural'

const auth = useAuthStore()
const toast = useToastStore()
const statusStore = useTaskStatusesStore()

/**
 * Estados a ofrecer para una tarea: los del proyecto de la tarea, mas los que
 * usan las tareas de la vista. Cada tarea lleva su `project_id` y los estados
 * son por proyecto. Con lista vacia, los cuatro por defecto.
 */
function estadosDe(projectId) {
  const lista = statusStore.statesOf(projectId)
  return estadosCon(
    lista.length ? lista : DEFAULT_TASK_STATUSES,
    visibleTasks.value.map((task) => task.status),
  )
}

const report = ref(null)
const error = ref(null)
const loading = ref(true)
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
    const [informe] = await Promise.all([
      myWorkApi.list(token),
      // Vista multiproyecto: los estados de todos los proyectos visibles.
      // Si no llegan, cada tarea cae en los estados por defecto.
      statusStore.loadAll(token).catch(() => null),
    ])
    report.value = informe
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
    toast.success(`"${task.title}" pasa a ${columnLabel(status, estadosDe(task.project_id))}.`)
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
      ayuda="Tu carga por semana, los días que vienen y las tareas que tienes asignadas."
    >
      <template #actions>
        <span
          v-if="!loading && !error"
          class="inline-flex items-center gap-1.5 rounded-control border border-borde bg-tarjeta-suave px-3 py-1.5 text-cp-sm font-medium text-texto-suave"
        >
          <strong class="font-mono text-texto-marca">
            {{ plural(tasks.length, 'tarea', 'tareas') }}
          </strong>
          ·
          <strong class="font-mono text-texto-marca">{{ formatHours(totalHours) }}</strong>
          en el período
        </span>
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

      <div class="mb-6 grid gap-4 lg:grid-cols-3">
        <BaseCard
          aria-label="Carga de las próximas semanas"
          title="Mi carga, próximas semanas"
          nota="La línea discontinua marca el 100 % de tu capacidad"
          class="lg:col-span-2"
        >
          <LoadBars
            :weeks="weeks"
            title="Carga de las próximas semanas"
            test-id="my-work-bars"
          />
        </BaseCard>

        <BaseCard aria-label="Resumen de esta semana" title="Esta semana">
          <template v-if="card">
            <p class="mt-0.5 text-cp-xs text-texto-tenue">
              Semana {{ weekTitle(currentWeek.week) }} ·
              {{ weekRangeLabel(currentWeek.week) }}
            </p>
            <div class="mt-3 flex items-baseline gap-2">
              <span class="font-mono text-cp-display font-bold tabular-nums text-texto-marca">
                {{ formatHours(currentWeek.hours) }}
              </span>
              <span class="font-mono text-cp-sm text-texto-tenue">
                de {{ formatHours(currentWeek.capacity) }}
              </span>
            </div>
            <span class="mt-2.5 block h-2 w-full overflow-hidden rounded-pastilla bg-tarjeta-suave">
              <span
                class="block h-full rounded-pastilla"
                :class="card.barClass"
                :style="{ width: `${card.barWidth}%` }"
              />
            </span>
            <div class="mt-2.5 flex items-center gap-2">
              <span
                class="rounded-pastilla px-2.5 py-0.5 text-cp-xs font-semibold"
                :class="card.pillClass"
                data-testid="my-work-card-state"
              >
                {{ card.label }} · {{ card.ratioText }}
              </span>
            </div>
            <div class="mt-4 space-y-1.5 border-t border-borde-suave pt-3 text-cp-xs text-texto-suave">
              <p class="flex items-center justify-between gap-2">
                <span>{{ weekTasks.length }} {{ weekTasks.length === 1 ? 'tarea' : 'tareas' }}</span>
                <span>{{ weekProjects }} {{ weekProjects === 1 ? 'proyecto' : 'proyectos' }}</span>
              </p>
              <p
                v-if="nextHoliday"
                class="flex items-center justify-between gap-2"
                data-testid="my-work-next-holiday"
              >
                <span>Próximo festivo</span>
                <span class="inline-flex items-center gap-1.5 font-mono">
                  {{ nextHoliday.date }}
                  <span v-if="nextHoliday.perdida">
                    (−{{ formatHours(nextHoliday.perdida) }} de capacidad)
                  </span>
                </span>
              </p>
            </div>
          </template>
          <p v-else class="text-cp-sm text-texto-tenue">
            No hay ninguna semana en el periodo de planificación.
          </p>
        </BaseCard>
      </div>

      <BaseCard aria-label="Mis tareas" title="Mis tareas">
        <template #header-extra>
          <div
            role="group"
            aria-label="Filtrar tareas"
            class="inline-flex items-center gap-0.5 rounded-control bg-tarjeta-suave p-1"
          >
            <button
              v-for="item in TABS"
              :key="item.name"
              type="button"
              :aria-pressed="tab === item.name"
              class="min-h-9 rounded-control px-3 py-1.5 text-cp-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              :class="
                tab === item.name
                  ? 'bg-tarjeta text-texto-marca font-semibold shadow-control'
                  : 'text-texto-suave hover:bg-tarjeta/70 hover:text-texto'
              "
              :data-testid="`my-work-tab-${item.name}`"
              @click="tab = item.name"
            >
              {{ item.label }}
            </button>
          </div>
        </template>

        <div role="list" class="flex flex-col">
          <div
            v-for="task in visibleTasks"
            :key="task.id"
            role="listitem"
            class="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-borde-suave py-3 transition-colors hover:bg-tarjeta-suave/60"
            data-testid="my-work-task"
          >
            <div class="min-w-0 flex-1 basis-60">
              <p class="text-cp-sm font-bold text-texto">{{ task.title }}</p>
              <div class="mt-0.5 flex flex-wrap items-center gap-2 text-cp-xs text-texto-tenue">
                <span
                  class="rounded-control bg-neutro-fondo px-2 py-0.5 font-mono font-semibold text-neutro-texto"
                >
                  {{ task.project_name }}
                </span>
                <span class="font-mono">{{ taskDates(task) }}</span>
              </div>
            </div>

            <span class="w-14 text-right font-mono text-cp-sm font-bold tabular-nums text-texto">
              {{ formatHours(task.hours) }}
            </span>

            <span
              class="w-32 rounded-pastilla px-2.5 py-0.5 text-center text-cp-xs font-semibold"
              :style="statusPill(task.status, estadosDe(task.project_id))"
            >
              {{ columnLabel(task.status, estadosDe(task.project_id)) }}
            </span>

            <select
              :value="task.status"
              :disabled="saving"
              :aria-label="`Cambiar el estado de ${task.title}`"
              class="min-h-10 rounded-control border border-borde-fuerte bg-tarjeta px-2.5 py-1.5 text-cp-sm text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:opacity-60"
              data-testid="my-work-status"
              @change="changeStatus(task, $event)"
            >
              <option
                v-for="option in estadosDe(task.project_id)"
                :key="option.key"
                :value="option.key"
              >
                {{ option.label }}
              </option>
            </select>
          </div>
          <p
            v-if="!visibleTasks.length"
            class="border-t border-borde-suave py-4 text-center text-cp-sm text-texto-tenue"
            data-testid="my-work-empty"
          >
            No tienes tareas en esta pestaña.
          </p>
        </div>
      </BaseCard>
    </AsyncState>
  </div>
</template>
