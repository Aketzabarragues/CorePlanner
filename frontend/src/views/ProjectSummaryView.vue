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
import { useTaskStatusesStore } from '../stores/taskStatuses'
import {
  DEFAULT_TASK_STATUSES,
  estadosCon,
  formatHours,
  statusBar,
  statusPill,
} from '../utils/kanban'
import { projectStatus } from '../utils/navigation'
import { currentWeekKey, weeksFrom, weekNumber } from '../utils/weeks'
import { plural } from '../utils/plural'

const props = defineProps({
  id: { type: [String, Number], required: true },
})

const auth = useAuthStore()
const store = useProjectsStore()
const statusStore = useTaskStatusesStore()

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

/**
 * Estados a contar: los del proyecto mas los que usan las tareas. Si la
 * peticion de estados falla, el reparto por estado sigue sumando el total
 * de tareas.
 */
const estados = computed(() =>
  estadosCon(
    statusStore.statesOf(props.id).length
      ? statusStore.statesOf(props.id)
      : DEFAULT_TASK_STATUSES,
    tasks.value.map((task) => task.status),
  ),
)

/** Tareas del proyecto, agrupadas por estado. */
const byStatus = computed(() =>
  estados.value.map((estado) => ({
    status: estado.key,
    label: estado.label,
    count: tasks.value.filter((task) => task.status === estado.key).length,
  })),
)

const totalTasks = computed(() => tasks.value.length)

/** Porcentaje de cada estado, para la barra segmentada. */
const statusSegments = computed(() =>
  byStatus.value.map((item) => ({
    ...item,
    width: totalTasks.value ? (item.count / totalTasks.value) * 100 : 0,
    color: statusBar(item.status, estados.value),
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

/** Tareas hechas: las que estan en un estado con avance completo (100 %). */
const hechas = computed(
  () =>
    tasks.value.filter((task) => {
      const estado = estados.value.find((item) => item.key === task.status)
      return (estado?.progress ?? 0) === 100
    }).length,
)

/** Porcentaje de tareas hechas, redondeado al entero mas cercano. */
const avance = computed(() =>
  totalTasks.value ? Math.round((hechas.value / totalTasks.value) * 100) : 0,
)

/** Horas del proyecto en la semana en curso: la que el motor ya repartio. */
const cargaSemana = computed(
  () => weekHours.value.find((item) => item.week === currentWeekKey())?.hours ?? 0,
)

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
      statusStore.loadProject(token, props.id).catch(() => []),
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

// Clases literales por tono del estado del proyecto (verify:css las exige en el bundle).
const PILDORA_ESTADO = {
  active: 'bg-ok-fondo text-ok-texto',
  paused: 'bg-aviso-fondo text-aviso-texto',
  neutral: 'bg-neutro-fondo text-neutro-texto',
}
const PUNTO_ESTADO = {
  active: 'bg-ok-punto',
  paused: 'bg-aviso-punto',
  neutral: 'bg-neutro-punto',
}

/** Pestana activa de este espacio: la vista es la propia seccion. */
const tab = computed(() => 'Resumen')

/** Aspecto de una pestana, segun sea la abierta o no. */
function tabClass(name) {
  return tab.value === name
    ? 'bg-tarjeta text-texto-marca font-semibold shadow-control'
    : 'text-texto-suave hover:bg-tarjeta/70 hover:text-texto'
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
                class="inline-flex items-center gap-1.5 rounded-pastilla px-2.5 py-1 text-cp-xs font-semibold"
                :class="PILDORA_ESTADO[status.tone]"
                data-testid="project-status"
              >
                <span
                  class="h-1.5 w-1.5 flex-none rounded-full"
                  :class="PUNTO_ESTADO[status.tone]"
                  aria-hidden="true"
                ></span>
                {{ status.label }}
              </span>
              <RouterLink
                :to="`/capacity?project=${project.id}`"
                class="inline-flex min-h-10 items-center rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-semibold text-texto-marca transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                data-testid="project-go-capacity"
              >
                Ver su capacidad
              </RouterLink>
              <RouterLink
                :to="`/gantt?project=${project.id}`"
                class="inline-flex min-h-10 items-center rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                data-testid="project-go-gantt"
              >
                Ver su Gantt
              </RouterLink>
            </div>
          </template>
        </PageHeader>

        <p class="mb-3 text-cp-sm text-texto-tenue">
          Responsable: {{ project.owner_name ?? 'sin asignar' }}
        </p>

        <nav
          aria-label="Secciones del proyecto"
          class="mb-4 inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-control bg-tarjeta-suave p-1"
        >
          <RouterLink
            v-for="item in TABS"
            :key="item.name"
            :to="item.to()"
            class="inline-flex min-h-9 whitespace-nowrap rounded-control px-3 py-1.5 text-cp-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            :class="tabClass(item.name)"
            :data-testid="`project-tab-${item.name.toLowerCase()}`"
          >
            {{ item.name }}
          </RouterLink>
        </nav>

        <div class="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <article class="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta">
            <span class="text-cp-micro font-semibold uppercase tracking-wider text-texto-tenue">
              Avance
            </span>
            <div class="mt-2 flex items-baseline gap-2">
              <span class="font-mono text-cp-kpi font-bold tabular-nums text-texto-marca">
                {{ avance }} %
              </span>
              <span class="font-mono text-cp-sm text-texto-tenue">
                {{ hechas }}/{{ totalTasks }}
              </span>
            </div>
            <div class="mt-3 h-1.5 w-full overflow-hidden rounded-pastilla bg-tarjeta-suave">
              <div class="h-full rounded-pastilla bg-primario" :style="{ width: `${avance}%` }"></div>
            </div>
          </article>

          <article class="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta">
            <span class="text-cp-micro font-semibold uppercase tracking-wider text-texto-tenue">
              Carga de la semana
            </span>
            <div class="mt-2 flex items-baseline gap-2">
              <span class="font-mono text-cp-kpi font-bold tabular-nums text-texto-marca">
                {{ formatHours(cargaSemana) }}
              </span>
              <span class="font-mono text-cp-sm text-texto-tenue">h</span>
            </div>
            <p class="mt-2.5 text-cp-xs text-texto-tenue">
              {{ formatHours(totalHours) }} en el proyecto
            </p>
          </article>

          <article class="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta">
            <span class="text-cp-micro font-semibold uppercase tracking-wider text-texto-tenue">
              Personas
            </span>
            <div class="mt-2 flex items-baseline gap-2">
              <span class="font-mono text-cp-kpi font-bold tabular-nums text-texto-marca">
                {{ team.length }}
              </span>
              <span class="text-cp-sm text-texto-tenue">
                {{ team.length === 1 ? 'persona' : 'personas' }}
              </span>
            </div>
            <p class="mt-2.5 text-cp-xs text-texto-tenue">
              {{ formatHours(totalHours) }} repartidas
            </p>
          </article>

          <article class="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta">
            <span class="text-cp-micro font-semibold uppercase tracking-wider text-texto-tenue">
              Tareas por estado
            </span>
            <div class="mt-2 space-y-1">
              <div
                v-for="item in statusSegments"
                :key="item.status"
                class="flex items-center justify-between gap-2"
              >
                <span
                  class="inline-flex items-center rounded-pastilla px-2 py-0.5 text-cp-micro font-semibold"
                  :style="statusPill(item.status, estados.value)"
                >
                  {{ item.label }}
                </span>
                <span class="font-mono text-cp-sm font-bold tabular-nums text-texto-marca">
                  {{ item.count }}
                </span>
              </div>
            </div>
          </article>
        </div>

        <div class="grid gap-4 lg:grid-cols-3">
          <section
            aria-label="Estado de las tareas"
            class="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta lg:col-span-2"
          >
            <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 class="font-titulo text-cp-titulo font-bold text-texto-marca">Estado de las tareas</h2>
              <span class="text-cp-xs text-texto-tenue">
                {{ plural(totalTasks, 'tarea', 'tareas') }} en el proyecto
              </span>
            </div>

            <div
              class="flex h-3 overflow-hidden rounded-pastilla"
              role="img"
              :aria-label="ariaTareas"
              data-testid="project-status-bar"
            >
              <span
                v-for="segmento in statusSegments"
                :key="segmento.status"
                :style="{ width: `${segmento.width}%`, ...segmento.color }"
              />
            </div>

            <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div
                v-for="item in statusSegments"
                :key="item.status"
                class="rounded-control border border-borde bg-tarjeta-suave p-2.5"
                data-testid="project-status-count"
              >
                <span
                  class="inline-flex items-center rounded-pastilla px-2 py-0.5 text-cp-micro font-semibold"
                  :style="statusPill(item.status, estados.value)"
                >
                  {{ item.label }}
                </span>
                <p class="mt-1.5 font-mono text-cp-titulo font-bold tabular-nums text-texto-marca">
                  {{ item.count }}
                </p>
              </div>
            </div>

            <div class="mt-4 border-t border-borde pt-3">
              <p class="mb-2 text-cp-xs font-semibold text-texto">
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
                  <span class="text-cp-xs font-semibold tabular-nums text-texto">
                    {{ formatHours(item.hours) }}
                  </span>
                  <span class="flex h-24 w-full items-end rounded bg-tarjeta-suave">
                    <span
                      class="w-full rounded-t bg-primario-medio"
                      :style="{ height: `${Math.max(2, weekBarWidth(item))}%` }"
                    />
                  </span>
                  <span class="text-cp-micro text-texto-tenue">
                    Sem {{ weekNumber(item.week) }}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section aria-label="Equipo del proyecto" class="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h2 class="font-titulo text-cp-titulo font-bold text-texto-marca">Equipo</h2>
              <RouterLink
                :to="`/projects/${project.id}/members`"
                class="inline-flex min-h-10 items-center rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-semibold text-texto-marca transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              >
                Gestionar miembros
              </RouterLink>
            </div>
            <div role="list" class="flex flex-col">
              <div
                v-for="member in team"
                :key="member.user_id"
                role="listitem"
                class="flex items-center gap-3 border-t border-borde-suave py-2 first:border-t-0"
                data-testid="project-team-row"
              >
                <span
                  class="flex h-8 w-8 flex-none items-center justify-center rounded-avatar bg-tarjeta-suave text-cp-xs font-semibold text-texto"
                >
                  {{ member.name.slice(0, 1) }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-cp-sm font-semibold text-texto">{{ member.name }}</p>
                  <p class="truncate text-cp-xs text-texto-tenue">{{ member.role }}</p>
                </div>
                <span class="text-cp-sm tabular-nums text-texto">
                  {{ formatHours(member.hours) }}
                </span>
              </div>
              <p v-if="!team.length" class="py-2 text-cp-sm text-texto-tenue">
                Todavía no hay nadie en el proyecto.
              </p>
            </div>
            <p class="mt-2 border-t border-borde pt-2 text-cp-xs text-texto-tenue">
              {{ formatHours(totalHours) }} repartidas entre {{ plural(team.length, 'persona', 'personas') }}.
            </p>
          </section>
        </div>
      </template>

      <p v-else class="rounded-tarjeta border border-dashed border-borde-fuerte bg-tarjeta p-6 text-center text-cp-sm text-texto-tenue">
        No se ha encontrado el proyecto.
      </p>
    </AsyncState>
  </div>
</template>
