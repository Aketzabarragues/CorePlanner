<script setup>
/**
 * Resumen del proyecto.
 *
 * Es el punto de entrada al proyecto: quien llega desde el listado o desde el
 * menu ve quien lo gestiona, en que estado esta, como se reparten las tareas,
 * cuanto carga el equipo cada semana y quienes lo forman.
 *
 * Las secciones del proyecto (Resumen, Tablero, Lista, Miembros y Ajustes) son
 * vistas propias: aqui solo estan los enlaces.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import { projectsApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { KANBAN_COLUMNS, formatHours, statusBar, statusPill } from '../utils/kanban'
import { projectStatus } from '../utils/navigation'
import { currentWeekKey, weeksFrom, weekNumber } from '../utils/weeks'

const props = defineProps({
  id: { type: [String, Number], required: true },
})

const auth = useAuthStore()
const store = useProjectsStore()

const error = ref(null)
const loading = ref(true)
const capacity = ref(null)
const tasks = ref([])

/** Semanas del eje del proyecto: las mismas nueve que ve la matriz. */
const RANGE_SIZE = 9

const TABS = [
  { name: 'Resumen', to: () => `/projects/${props.id}` },
  { name: 'Tablero', to: () => `/projects/${props.id}/kanban` },
  { name: 'Lista', to: () => `/projects/${props.id}/tasks` },
  { name: 'Miembros', to: () => `/projects/${props.id}/members` },
  { name: 'Ajustes', to: () => `/projects/${props.id}/settings` },
]

const project = computed(
  () => store.projects.find((item) => String(item.id) === String(props.id)) ?? null,
)

const department = computed(
  () =>
    store.departments.find((item) => item.id === project.value?.department_id) ?? null,
)

const status = computed(() => projectStatus(project.value?.status))

const rows = computed(() => capacity.value?.rows ?? [])

/** Tareas del proyecto, agrupadas por estado. */
const byStatus = computed(() =>
  KANBAN_COLUMNS.map((column) => ({
    status: column.status,
    label: column.label,
    count: tasks.value.filter((task) => task.status === column.status).length,
  })),
)

const totalTasks = computed(() => tasks.value.length)

/** Porcentaje de cada estado, para la barra segmentada. */
const statusSegments = computed(() =>
  byStatus.value.map((item) => ({
    ...item,
    width: totalTasks.value ? (item.count / totalTasks.value) * 100 : 0,
    color: statusBar(item.status),
  })),
)

/**
 * Horas del proyecto en cada semana.
 *
 * Se suman las horas que el motor ya ha repartido: la pantalla no vuelve a
 * calcular nada.
 */
const weekHours = computed(() => {
  const weeks = capacity.value?.weeks ?? []
  return weeks.map((week) => {
    const hours = rows.value.reduce((sum, row) => {
      const cell = (row.cells ?? []).find((item) => item.week === week.week)
      return sum + Number(cell?.hours ?? 0)
    }, 0)
    return { week: week.week, hours }
  })
})

const maxWeekHours = computed(() =>
  weekHours.value.reduce((max, item) => Math.max(max, item.hours), 0),
)

/** Equipo del proyecto, con su rol y las horas que lleva. */
const team = computed(() =>
  store.members.map((member) => {
    const row = rows.value.find((item) => item.user_id === member.user_id)
    return {
      user_id: member.user_id,
      name: member.name,
      role: member.role_name,
      hours: Number(row?.total_hours ?? 0),
    }
  }),
)

const totalHours = computed(() => team.value.reduce((sum, item) => sum + item.hours, 0))

/** Lo que se lee en voz alta de la barra de estados. */
const ariaTareas = computed(
  () =>
    `Tareas por estado, ${totalTasks.value} en total: ${statusSegments.value
      .map((item) => `${item.count} ${item.label}`)
      .join(', ')}`,
)

/** Lo que se lee en voz alta de las horas por semana. */
const ariaSemanas = computed(
  () =>
    `Horas del proyecto por semana: ${weekHours.value
      .map((item) => `semana ${weekNumber(item.week)}, ${item.hours} horas`)
      .join('; ')}`,
)

async function load() {
  try {
    const token = await auth.ensureSession()
    await store.ensureProjects(token)
    await store.ensureMembers(token, props.id)
    const weeks = weeksFrom(currentWeekKey(), RANGE_SIZE)
    const [report, projectTasks] = await Promise.all([
      projectsApi.capacity(token, props.id, { from: weeks[0], to: weeks[weeks.length - 1] }),
      projectsApi.tasks(token, props.id),
    ])
    capacity.value = report
    tasks.value = projectTasks
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

/** Altura de la barra de una semana, en tanto por ciento de la semana mas cargada. */
function weekBarWidth(item) {
  if (!maxWeekHours.value) return 0
  return Math.round((item.hours / maxWeekHours.value) * 100)
}

/** Color de la pila del estado del proyecto. */
function projectStatusPill(tone) {
  if (tone === 'active') return 'bg-emerald-100 text-emerald-700'
  if (tone === 'paused') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

/** Aspecto de una pestana, segun sea la abierta o no. */
function tabClass(name) {
  return name === 'Resumen'
    ? 'border-siemens-900 font-medium text-siemens-900'
    : 'border-transparent text-slate-500 hover:text-slate-700'
}

onMounted(load)
watch(() => props.id, load)
useTaskReload(load)
</script>

<template>
  <div>
    <AsyncState
      :loading="loading"
      :error="error"
      loading-label="Cargando el proyecto"
      @retry="reintentar"
    >
      <template v-if="project">
        <PageHeader
          :title="project.name"
          :subtitle="department?.name ?? 'Sin departamento'"
        >
          <template #actions>
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="rounded-full px-2.5 py-1 text-xs font-semibold"
                :class="projectStatusPill(status.tone)"
                data-testid="project-status"
              >
                {{ status.label }}
              </span>
              <RouterLink
                :to="`/capacity?project=${project.id}`"
                class="flex h-10 items-center rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-siemens-900"
                data-testid="project-go-capacity"
              >
                Ver su capacidad
              </RouterLink>
              <RouterLink
                :to="`/gantt?project=${project.id}`"
                class="flex h-10 items-center rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-siemens-900"
                data-testid="project-go-gantt"
              >
                Ver su Gantt
              </RouterLink>
            </div>
          </template>
        </PageHeader>

        <p class="mb-3 text-sm text-slate-500">
          Responsable: {{ project.owner_name ?? 'sin asignar' }}
        </p>

        <nav
          aria-label="Secciones del proyecto"
          class="mb-4 flex flex-wrap gap-1 border-b border-slate-200"
        >
          <RouterLink
            v-for="item in TABS"
            :key="item.name"
            :to="item.to()"
            class="border-b-2 px-3 py-2 text-sm"
            :class="tabClass(item.name)"
            :data-testid="`project-tab-${item.name.toLowerCase()}`"
          >
            {{ item.name }}
          </RouterLink>
        </nav>

        <div class="grid gap-4 lg:grid-cols-3">
          <section
            aria-label="Estado de las tareas"
            class="rounded border border-slate-200 bg-white p-4 lg:col-span-2"
          >
            <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="text-sm font-semibold text-siemens-900">Estado de las tareas</h2>
              <span class="text-xs text-slate-500">
                {{ totalTasks }} tarea(s) en el proyecto
              </span>
            </div>

            <div
              class="flex h-3 overflow-hidden rounded-full"
              role="img"
              :aria-label="ariaTareas"
              data-testid="project-status-bar"
            >
              <span
                v-for="segmento in statusSegments"
                :key="segmento.status"
                :style="{ width: `${segmento.width}%` }"
                :class="segmento.color"
              />
            </div>

            <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div
                v-for="item in statusSegments"
                :key="item.status"
                class="rounded border border-slate-200 p-2"
                data-testid="project-status-count"
              >
                <span
                  class="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                  :class="statusPill(item.status)"
                >
                  {{ item.label }}
                </span>
                <p class="mt-1 text-xl font-semibold tabular-nums text-siemens-900">
                  {{ item.count }}
                </p>
              </div>
            </div>

            <div class="mt-4 border-t border-slate-200 pt-3">
              <p class="mb-2 text-xs font-semibold text-slate-700">
                Horas del proyecto por semana
              </p>
              <div
                class="flex items-end gap-2"
                role="img"
                :aria-label="ariaSemanas"
                data-testid="project-week-bars"
              >
                <div
                  v-for="item in weekHours"
                  :key="item.week"
                  class="flex min-w-0 flex-1 flex-col items-center gap-1"
                >
                  <span class="text-xs font-semibold tabular-nums text-slate-700">
                    {{ formatHours(item.hours) }}
                  </span>
                  <span class="flex h-24 w-full items-end rounded bg-slate-100">
                    <span
                      class="w-full rounded-t bg-siemens-700"
                      :style="{ height: `${Math.max(2, weekBarWidth(item))}%` }"
                    />
                  </span>
                  <span class="text-[11px] text-slate-500">
                    Sem {{ weekNumber(item.week) }}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section aria-label="Equipo del proyecto" class="rounded border border-slate-200 bg-white p-4">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold text-siemens-900">Equipo</h2>
              <RouterLink
                :to="`/projects/${project.id}/members`"
                class="text-xs font-semibold text-siemens-700"
              >
                Gestionar miembros
              </RouterLink>
            </div>
            <div role="list" class="flex flex-col">
              <div
                v-for="member in team"
                :key="member.user_id"
                role="listitem"
                class="flex items-center gap-3 border-t border-slate-100 py-2 first:border-t-0"
                data-testid="project-team-row"
              >
                <span
                  class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700"
                >
                  {{ member.name.slice(0, 1) }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-slate-800">{{ member.name }}</p>
                  <p class="truncate text-xs text-slate-500">{{ member.role }}</p>
                </div>
                <span class="text-sm tabular-nums text-slate-700">
                  {{ formatHours(member.hours) }}
                </span>
              </div>
              <p v-if="!team.length" class="py-2 text-sm text-slate-500">
                Todavía no hay nadie en el proyecto.
              </p>
            </div>
            <p class="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-500">
              {{ formatHours(totalHours) }} repartidas entre {{ team.length }} persona(s).
            </p>
          </section>
        </div>
      </template>

      <p v-else class="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        No se ha encontrado el proyecto.
      </p>
    </AsyncState>
  </div>
</template>
