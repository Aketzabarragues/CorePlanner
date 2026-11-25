<script setup>
/**
 * Panel global.
 *
 * Resumen de la organizacion: utilizacion de la semana de referencia, quien
 * se pasa de capacidad, como estan repartidos los proyectos y las tareas, y
 * que proyectos concentran mas trabajo.
 *
 * Todo viene de /api/panel, que se apoya en la matriz de capacidad y en el
 * listado de tareas, de modo que el panel no puede discrepar de la matriz.
 */
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { capacityIncidentsApi, meApi, panelApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import AsyncState from '../components/common/AsyncState.vue'
import ModalDialog from '../components/ModalDialog.vue'
import PageHeader from '../components/common/PageHeader.vue'
import LoadBars from '../components/LoadBars.vue'
import { useAuthStore } from '../stores/auth'
import { useTaskStatusesStore } from '../stores/taskStatuses'
import { columnLabel, formatHours } from '../utils/kanban'
import { loadRatio } from '../utils/load'
import { projectStatus } from '../utils/navigation'
import { weekNumber } from '../utils/weeks'
import { plural } from '../utils/plural'

const auth = useAuthStore()
const statusStore = useTaskStatusesStore()

const panel = ref(null)
const error = ref(null)
const loading = ref(true)

const overloaded = computed(() => panel.value?.overloaded ?? [])
const projects = computed(() => panel.value?.projects ?? [])
const weeks = computed(() => panel.value?.weeks ?? [])
const pending = computed(() => panel.value?.pending ?? [])
const byDepartment = computed(() => panel.value?.by_department ?? [])
const projectStatuses = computed(() =>
  Object.entries(panel.value?.projects_by_status ?? {}),
)
const taskStatuses = computed(() => Object.entries(panel.value?.tasks_by_status ?? {}))

const scope = ref(null)
const incidents = ref([])
const resolving = ref(null)
const resolvingNote = ref('')
const resolvingError = ref(null)

/** Incidentes pendientes: los resueltos no se reabren ni se repiten. */
const pendingIncidents = computed(() => incidents.value.filter((item) => item.state === 'pendiente'))

/**
 * El bloque de aprobaciones: solo los pendientes.
 *
 * La lista del servidor ya esta acotada al ambito de quien entra (el
 * gerente ve todos, el jefe los de su departamento y el tecnico los suyos),
 * de modo que basta con que haya algo pendiente. Sin pendientes el bloque
 * se esconde: no hay historia de resueltos aqui.
 */
const showIncidentBlock = computed(() => pendingIncidents.value.length > 0)

/** Puede resolver: el jefe del departamento de la persona o el gerente. */
function puedeResolver(incident) {
  const user = scope.value?.user
  if (!user) return false
  if (user.is_global_admin || user.company_role === 'gerente') return true
  return (
    user.company_role === 'jefe_departamento' &&
    user.department_id !== null &&
    incident.department_id === user.department_id
  )
}

/** Abre el dialogo para aprobar o rechazar un incidente, con su nota. */
function abrirResolucion(incident) {
  resolving.value = incident
  resolvingNote.value = ''
  resolvingError.value = null
}

function cerrarResolucion() {
  resolving.value = null
  resolvingError.value = null
}

async function resolver(decision) {
  const incident = resolving.value
  if (!incident) return
  resolvingError.value = null
  try {
    const token = await auth.ensureSession()
    const nota = resolvingNote.value.trim() || null
    await capacityIncidentsApi.resolve(token, incident.id, { decision, note: nota })
    // La lista vuelve del servidor: el resuelto sale de los pendientes y la
    // carga que se muestra es la actual, no la del momento de abrir.
    incidents.value = await capacityIncidentsApi.list(token)
    resolving.value = null
  } catch (err) {
    resolvingError.value = err.message
  }
}

/** Fecha corta para "abierto el": "12 mar". */
function fechaCortada(iso) {
  if (!iso) return ''
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return ''
  return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

/** Proyectos que estan en marcha. */
const activeProjects = computed(() => projects.value.filter((item) => item.status === 'active'))

/** Departamentos que gestionan los proyectos en marcha. */
const activeDepartments = computed(
  () =>
    new Set(
      activeProjects.value
        .map((item) => item.department_id)
        .filter((id) => id !== null && id !== undefined),
    ).size,
)

/** Media de utilizacion del periodo. */
const averageUtilization = computed(() => {
  const values = weeks.value
    .map((item) => item.utilization)
    .filter((value) => value !== null && value !== undefined)
  if (!values.length) return null
  const total = values.reduce((sum, value) => sum + value, 0)
  return Math.round(total / values.length)
})

/**
 * Personas que se pasan de capacidad, agrupadas por persona.
 *
 * El backend lista cada celda que se pasa; aqui se agrupan para ensenar quien
 * es y en que semanas, con su peor semana.
 */
const overloadedPeople = computed(() => {
  const porPersona = new Map()
  for (const item of overloaded.value) {
    const entry = porPersona.get(item.user_id) ?? {
      user_id: item.user_id,
      name: item.name,
      weeks: [],
      max: 0,
    }
    entry.weeks.push(item.week)
    const ratio = loadRatio(item.hours, item.capacity)
    if (ratio !== null && ratio > entry.max) entry.max = ratio
    porPersona.set(item.user_id, entry)
  }
  return [...porPersona.values()].sort((a, b) => b.max - a.max)
})

/** Tareas pendientes de planificacion, agrupadas por motivo. */
const pendingByProblem = computed(() => {
  const cuenta = { persona: 0, fechas: 0 }
  for (const item of pending.value) {
    if (item.problem === 'Sin persona') cuenta.persona += 1
    else cuenta.fechas += 1
  }
  return cuenta
})

/** Proyecto con mas carga, para escalar las barras de la lista. */
const maxProjectHours = computed(() =>
  projects.value.reduce((max, item) => Math.max(max, Number(item.estimated_hours ?? 0)), 0),
)

/** Numero de la semana, sin el año: "46". */
function numeroSemana(week) {
  return weekNumber(week)
}

/** Semanas de una persona en texto: "Semana 47" o "Semanas 46 y 47". */
function semanasTexto(weeksList) {
  const numeros = weeksList.map(numeroSemana)
  if (numeros.length === 1) return `Semana ${numeros[0]}`
  const ultimo = numeros.pop()
  return `Semanas ${numeros.join(', ')} y ${ultimo}`
}

/** Porcentaje de la barra de un proyecto. */
function projectBarWidth(project) {
  if (!maxProjectHours.value) return 0
  return Math.round((Number(project.estimated_hours ?? 0) / maxProjectHours.value) * 100)
}

/** Color de la pila del estado de un proyecto. */
function projectPill(status) {
  const tone = projectStatus(status).tone
  if (tone === 'active') return 'bg-emerald-100 text-emerald-700'
  if (tone === 'paused') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}

/** Color de la pila del motivo de una tarea pendiente. */
function problemPill(problem) {
  return problem === 'Sin persona' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-900'
}

/**
 * Etiqueta de un estado de tarea por su clave.
 *
 * El feed del panel solo lleva la clave y el conteo: no hay proyecto por
 * linea, y si dos proyectos usan la misma clave con etiquetas distintas, el
 * panel no sabe a cual pertenecen las tareas. Limitacion de la vista, no de la
 * API. Para que salga siempre la misma etiqueta, el proyecto que responde es
 * el de menor identificador entre los que definen la clave, no el primero
 * cargado, que depende del orden de insercion.
 */
function etiquetaDe(clave) {
  const proyectos = Object.entries(statusStore.byProject).sort(
    ([idA], [idB]) => Number(idA) - Number(idB),
  )
  for (const [, estados] of proyectos) {
    const estado = estados.find((item) => item.key === clave)
    if (estado) return estado.label
  }
  return columnLabel(clave)
}

async function load() {
  try {
    const token = await auth.ensureSession()
    const [panelData, scopeData, incidentData] = await Promise.all([
      panelApi.list(token),
      meApi.get(token),
      capacityIncidentsApi.list(token),
      // Los estados de los proyectos dan la etiqueta de "tareas por estado";
      // si no se pueden leer, se pinta la clave.
      statusStore.loadAll(token).catch(() => null),
    ])
    panel.value = panelData
    scope.value = scopeData
    incidents.value = incidentData
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

onMounted(load)
useTaskReload(load)
</script>

<template>
  <div>
    <PageHeader
      title="Panel"
      subtitle="Estado de la organización en el período de planificación."
    />

    <AsyncState
      :loading="loading"
      :error="error"
      error-test-id="panel-error"
      loading-label="Cargando el panel"
      @retry="reintentar"
    >
      <div class="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <RouterLink
          to="/capacity"
          class="rounded border border-slate-200 bg-white p-4 hover:border-slate-300"
          data-testid="panel-card-usage"
        >
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
            Uso del equipo, semana {{ panel.week ? weekNumber(panel.week) : '—' }}
          </p>
          <p
            class="mt-1 text-2xl font-semibold tabular-nums"
            :class="panel.utilization >= 100 ? 'text-red-700' : 'text-siemens-900'"
            data-testid="panel-utilization"
          >
            {{ panel.utilization === null ? 'sin capacidad' : `${panel.utilization} %` }}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            {{ formatHours(panel.planned_hours) }} planificadas de
            {{ formatHours(panel.capacity_hours) }} de capacidad
          </p>
          <p class="mt-1 text-xs text-slate-400">
            Media del periodo:
            {{ averageUtilization === null ? '—' : `${averageUtilization} %` }}
          </p>
        </RouterLink>

        <RouterLink
          to="/capacity"
          class="rounded border border-slate-200 bg-white p-4 hover:border-slate-300"
          data-testid="panel-card-overloaded"
        >
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
            Personas con sobrecarga
          </p>
          <p
            class="mt-1 text-2xl font-semibold tabular-nums"
            :class="overloaded.length ? 'text-red-700' : 'text-siemens-900'"
            data-testid="panel-overloaded-count"
          >
            {{ overloadedPeople.length }}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            {{ plural(overloaded.length, 'celda', 'celdas') }} por encima de su capacidad
          </p>
        </RouterLink>

        <RouterLink
          to="/projects"
          class="rounded border border-slate-200 bg-white p-4 hover:border-slate-300"
          data-testid="panel-card-projects"
        >
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
            Proyectos activos
          </p>
          <p class="mt-1 text-2xl font-semibold tabular-nums text-siemens-900">
            {{ activeProjects.length }}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            {{ plural(activeDepartments, 'departamento', 'departamentos') }} implicado{{ activeDepartments === 1 ? '' : 's' }}
          </p>
        </RouterLink>

        <RouterLink
          to="/capacity"
          class="rounded border border-slate-200 bg-white p-4 hover:border-slate-300"
          data-testid="panel-card-pending"
        >
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
            Planificación incompleta
          </p>
          <p
            class="mt-1 text-2xl font-semibold tabular-nums"
            :class="pending.length ? 'text-amber-700' : 'text-siemens-900'"
            data-testid="panel-pending-count"
          >
            {{ pending.length }}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            {{ pendingByProblem.persona }} sin persona ·
            {{ pendingByProblem.fechas }} sin fechas
          </p>
        </RouterLink>
      </div>

      <section
        v-if="byDepartment.length > 1"
        aria-label="Estado por departamento"
        class="mb-4 rounded border border-slate-200 bg-white p-4"
        data-testid="panel-departments"
      >
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-sm font-semibold text-siemens-900">Estado por departamento</h2>
          <span class="text-xs text-slate-500">
            Semana {{ panel.week ? weekNumber(panel.week) : '—' }} de cada equipo por separado
          </span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr
                class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"
              >
                <th scope="col" class="py-2 pr-3 font-medium">Departamento</th>
                <th scope="col" class="px-3 py-2 font-medium">Proyectos activos</th>
                <th scope="col" class="px-3 py-2 font-medium">Personas con sobrecarga</th>
                <th scope="col" class="px-3 py-2 font-medium">Uso del equipo</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="department in byDepartment"
                :key="department.id"
                class="border-t border-slate-100"
                data-testid="panel-department-row"
              >
                <th scope="row" class="py-2 pr-3 font-semibold text-slate-800">
                  {{ department.name }}
                </th>
                <td class="px-3 py-2 tabular-nums text-slate-700">
                  {{ department.active_projects }}
                </td>
                <td class="px-3 py-2">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
                    :class="
                      department.overloaded_people
                        ? 'bg-red-100 text-red-800'
                        : 'bg-slate-100 text-slate-600'
                    "
                  >
                    {{ department.overloaded_people }}
                  </span>
                </td>
                <td class="px-3 py-2 tabular-nums">
                  <span
                    class="font-semibold"
                    :class="
                      department.utilization === null
                        ? 'text-slate-500'
                        : department.utilization >= 100
                          ? 'text-red-700'
                          : 'text-siemens-900'
                    "
                  >
                    {{
                      department.utilization === null
                        ? 'sin capacidad'
                        : `${department.utilization} %`
                    }}
                  </span>
                  <span class="ml-2 text-xs text-slate-500">
                    {{ formatHours(department.planned_hours) }} planificadas de
                    {{ formatHours(department.capacity_hours) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        v-if="showIncidentBlock"
        aria-label="Necesitan aprobación"
        class="mb-4 rounded border border-slate-200 bg-white p-4"
        data-testid="panel-incidents"
      >
        <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-sm font-semibold text-siemens-900">Necesitan aprobación</h2>
          <span class="text-xs text-slate-500">
            {{ pendingIncidents.length }}
            {{ pendingIncidents.length === 1 ? 'incidente' : 'incidentes' }} por encima del
            umbral de aprobación
          </span>
        </div>
        <div role="list" class="flex flex-col">
          <div
            v-for="incident in pendingIncidents"
            :key="incident.id"
            role="listitem"
            class="flex flex-wrap items-center gap-3 border-t border-slate-100 py-2 first:border-t-0"
            :data-testid="`panel-incident-${incident.id}`"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-slate-800">
                {{ incident.user_name }}
                <span v-if="incident.department_name" class="font-normal text-slate-500">
                  · {{ incident.department_name }}
                </span>
              </p>
              <p class="text-xs text-slate-500">
                Semana {{ weekNumber(incident.week) }} ·
                {{ formatHours(incident.hours) }} de
                {{
                  incident.capacity === null || incident.capacity === undefined
                    ? 'capacidad desconocida'
                    : formatHours(incident.capacity)
                }}
                · abierto {{ fechaCortada(incident.created_at) }}
              </p>
            </div>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
              :class="
                incident.hours !== null &&
                incident.capacity !== null &&
                incident.hours > incident.capacity
                  ? 'bg-red-100 text-red-800'
                  : 'bg-amber-100 text-amber-800'
              "
            >
              umbral de aprobación {{ incident.requires_approval_percent }} %
            </span>
            <template v-if="puedeResolver(incident)">
              <button
                type="button"
                class="rounded border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700"
                :data-testid="`panel-incident-approve-${incident.id}`"
                @click="abrirResolucion(incident)"
              >
                Aprobar
              </button>
              <button
                type="button"
                class="rounded border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700"
                :data-testid="`panel-incident-reject-${incident.id}`"
                @click="abrirResolucion(incident)"
              >
                Rechazar
              </button>
            </template>
          </div>
        </div>
      </section>

      <div class="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section
          aria-label="Uso del equipo por semana"
          class="rounded border border-slate-200 bg-white p-4 lg:col-span-2"
        >
          <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-sm font-semibold text-siemens-900">
              Uso del equipo por semana
            </h2>
            <span class="text-xs text-slate-500">
              La línea discontinua marca el 100 % de la capacidad del equipo
            </span>
          </div>
          <LoadBars
            :weeks="weeks"
            title="Uso del equipo por semana"
            test-id="panel-bars"
          />
        </section>

        <section
          aria-label="Personas con sobrecarga"
          class="rounded border border-slate-200 bg-white p-4"
        >
          <h2 class="mb-2 text-sm font-semibold text-siemens-900">
            Personas con sobrecarga
          </h2>
          <div role="list" class="flex flex-col">
            <div
              v-for="persona in overloadedPeople"
              :key="persona.user_id"
              role="listitem"
              class="flex items-center gap-3 border-t border-slate-100 py-2 first:border-t-0"
              data-testid="panel-overloaded-row"
            >
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold text-slate-800">{{ persona.name }}</p>
                <p class="text-xs text-slate-500">{{ semanasTexto(persona.weeks) }}</p>
              </div>
              <span
                class="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
                :class="
                  persona.max > 110
                    ? 'bg-red-100 text-red-800'
                    : 'bg-amber-100 text-amber-800'
                "
              >
                hasta {{ persona.max }} %
              </span>
            </div>
            <p
              v-if="!overloadedPeople.length"
              class="py-2 text-sm text-slate-500"
              data-testid="panel-overloaded-empty"
            >
              Nadie supera su capacidad en el período.
            </p>
          </div>
          <RouterLink
            to="/capacity"
            class="mt-3 inline-flex h-10 items-center rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-siemens-900"
            data-testid="panel-go-capacity"
          >
            Ver en Capacidad
          </RouterLink>
        </section>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section aria-label="Carga por proyecto" class="rounded border border-slate-200 bg-white p-4">
          <h2 class="mb-3 text-sm font-semibold text-siemens-900">
            Proyectos con más carga
          </h2>
          <div class="flex flex-col gap-3">
            <div v-for="project in projects" :key="project.id" data-testid="panel-project-row">
              <div class="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span class="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  {{ project.name }}
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="projectPill(project.status)"
                  >
                    {{ projectStatus(project.status).label }}
                  </span>
                </span>
                <span class="text-xs tabular-nums text-slate-600">
                  {{ formatHours(project.estimated_hours) }} ·
                  {{ plural(project.people_count, 'persona', 'personas') }}
                </span>
              </div>
              <span class="block h-2 w-full rounded bg-slate-200">
                <span
                  class="block h-2 rounded bg-siemens-700"
                  :style="{ width: `${projectBarWidth(project)}%` }"
                />
              </span>
            </div>
            <p v-if="!projects.length" class="text-sm text-slate-500">
              No hay proyectos visibles.
            </p>
          </div>
        </section>

        <section
          aria-label="Planificación incompleta"
          class="rounded border border-slate-200 bg-white p-4"
        >
          <h2 class="mb-1 text-sm font-semibold text-siemens-900">
            Planificación incompleta
          </h2>
          <p class="mb-3 text-xs text-slate-500">
            Estas tareas no cuentan en la matriz hasta que tengan persona y fechas.
          </p>
          <div role="list" class="flex flex-col">
            <div
              v-for="task in pending"
              :key="task.id"
              role="listitem"
              class="flex flex-wrap items-center gap-2 border-t border-slate-100 py-2 first:border-t-0"
              data-testid="panel-pending-row"
            >
              <span class="min-w-0 flex-1 basis-48 text-sm font-medium text-slate-800">
                {{ task.title }}
              </span>
              <span class="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                {{ task.project_name }}
              </span>
              <span
                class="rounded-full px-2 py-0.5 text-xs font-semibold"
                :class="problemPill(task.problem)"
              >
                {{ task.problem }}
              </span>
              <RouterLink
                :to="`/projects/${task.project_id}/kanban`"
                class="inline-flex h-9 items-center rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-siemens-900"
                data-testid="panel-pending-resolve"
              >
                Resolver
              </RouterLink>
            </div>
            <p
              v-if="!pending.length"
              class="py-2 text-sm text-slate-500"
              data-testid="panel-pending-empty"
            >
              Toda la planificación tiene persona y fechas.
            </p>
          </div>
        </section>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section>
          <h2 class="mb-2 text-sm font-semibold text-slate-700">Proyectos por estado</h2>
          <ul
            class="rounded border border-slate-200 bg-white p-4 text-sm"
            data-testid="panel-projects-status"
          >
            <li
              v-for="[status, count] in projectStatuses"
              :key="status"
              class="flex items-center justify-between py-1"
            >
              <span class="text-slate-600">{{ projectStatus(status).label }}</span>
              <span class="font-medium tabular-nums text-siemens-900">{{ count }}</span>
            </li>
            <li v-if="!projectStatuses.length" class="py-1 text-slate-500">
              No hay proyectos visibles.
            </li>
          </ul>
        </section>

        <section>
          <h2 class="mb-2 text-sm font-semibold text-slate-700">Tareas por estado</h2>
          <ul
            class="rounded border border-slate-200 bg-white p-4 text-sm"
            data-testid="panel-tasks-status"
          >
            <li
              v-for="[status, count] in taskStatuses"
              :key="status"
              class="flex items-center justify-between py-1"
            >
              <span class="text-slate-600">{{ etiquetaDe(status) }}</span>
              <span class="font-medium tabular-nums text-siemens-900">{{ count }}</span>
            </li>
            <li v-if="!taskStatuses.length" class="py-1 text-slate-500">
              No hay tareas en el período.
            </li>
          </ul>
        </section>
      </div>
    </AsyncState>

    <ModalDialog
      :open="resolving !== null"
      title="Resolver incidente de capacidad"
      :subtitle="
        resolving
          ? `${resolving.user_name}, semana ${weekNumber(resolving.week)}`
          : ''
      "
      size="sm"
      @close="cerrarResolucion"
    >
      <p class="text-sm text-slate-600">
        Esta acción registra la decisión sobre la carga actual de la persona.
      </p>
      <label class="mt-3 block text-sm font-medium">
        Nota (opcional)
        <textarea
          v-model="resolvingNote"
          rows="2"
          maxlength="2000"
          class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          data-testid="incident-note"
        ></textarea>
      </label>
      <p
        v-if="resolvingError"
        class="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        data-testid="incident-error"
      >
        {{ resolvingError }}
      </p>
      <template #footer>
        <button
          type="button"
          class="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600"
          @click="cerrarResolucion"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700"
          data-testid="incident-reject-submit"
          @click="resolver('rechazada')"
        >
          Rechazar
        </button>
        <button
          type="button"
          class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
          data-testid="incident-approve-submit"
          @click="resolver('aprobada')"
        >
          Aprobar
        </button>
      </template>
    </ModalDialog>
  </div>
</template>
