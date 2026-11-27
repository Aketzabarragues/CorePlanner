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
import AppIcon from '../components/AppIcon.vue'
import AsyncState from '../components/common/AsyncState.vue'
import BaseCard from '../components/common/BaseCard.vue'
import KpiCard from '../components/common/KpiCard.vue'
import ModalDialog from '../components/ModalDialog.vue'
import PageHeader from '../components/common/PageHeader.vue'
import LoadBars from '../components/LoadBars.vue'
import { useAuthStore } from '../stores/auth'
import { useTaskStatusesStore } from '../stores/taskStatuses'
import { columnLabel, formatHours } from '../utils/kanban'
import { loadRatio } from '../utils/load'
import { projectStatus } from '../utils/navigation'
import { weekLabel, weekNumber } from '../utils/weeks'
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

/**
 * Color de estado del proyecto, por valor de estado.
 *
 * Activo va a ok, Pausado a aviso, Planificacion a info y el resto a
 * neutro: el estado es dato del backend y el color sale de los tokens.
 */
function estadoProyecto(status) {
  if (status === 'active') return 'bg-ok-fondo text-ok-texto'
  if (status === 'on_hold') return 'bg-aviso-fondo text-aviso-texto'
  if (status === 'planning') return 'bg-info-fondo text-info-texto'
  return 'bg-neutro-fondo text-neutro-texto'
}

function puntoProyecto(status) {
  if (status === 'active') return 'bg-ok-punto'
  if (status === 'on_hold') return 'bg-aviso-punto'
  if (status === 'planning') return 'bg-info-punto'
  return 'bg-neutro-punto'
}

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

/** Rango del periodo en el slot de contexto: "S48 – S03". */
const rangoPeriodo = computed(() => {
  if (!weeks.value.length) return ''
  const primera = weekLabel(weeks.value[0].week)
  const ultima = weekLabel(weeks.value[weeks.value.length - 1].week)
  return primera === ultima ? primera : `${primera} – ${ultima}`
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
      ayuda="Resumen del uso del equipo, la carga por semana, los proyectos con más carga y la planificación incompleta del periodo activo."
    >
      <template v-if="rangoPeriodo" #contexto>
        Periodo activo ·
        <span class="font-mono" data-testid="panel-period-range">{{ rangoPeriodo }}</span>
      </template>
      <template #actions>
        <RouterLink
          to="/capacity"
          class="inline-flex min-h-10 items-center rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-semibold text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
        >
          Ir a Capacidad
        </RouterLink>
        <RouterLink
          to="/gantt"
          class="inline-flex min-h-10 items-center rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
        >
          Abrir Gantt
        </RouterLink>
      </template>
    </PageHeader>

    <AsyncState
      :loading="loading"
      :error="error"
      error-test-id="panel-error"
      loading-label="Cargando el panel"
      @retry="reintentar"
    >
      <div class="mb-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          etiqueta="Uso del equipo"
          :valor="panel.utilization === null ? 'sin capacidad' : `${panel.utilization} %`"
          :insignia="{ tono: 'info', texto: `Media ${averageUtilization === null ? '—' : averageUtilization + ' %'}` }"
          :barra="panel.utilization === null || panel.utilization === 0 ? null : panel.utilization"
          :detalle="`${formatHours(panel.planned_hours)} / ${formatHours(panel.capacity_hours)}`"
          to="/capacity"
          test-id="panel-card-usage"
        >
          <template #valor>
            <span
              class="whitespace-nowrap font-mono text-cp-kpi font-bold tabular-nums"
              :class="panel.utilization === null ? 'text-texto-tenue' : 'text-texto-marca'"
              data-testid="panel-utilization"
            >
              {{ panel.utilization === null ? 'sin capacidad' : `${panel.utilization} %` }}
            </span>
          </template>
        </KpiCard>

        <KpiCard
          etiqueta="Personas con sobrecarga"
          :valor="overloadedPeople.length"
          :insignia="
            overloaded.length
              ? { tono: 'peligro', texto: 'Sobrecarga', punto: true }
              : { tono: 'ok', texto: 'Saludable', punto: true }
          "
          :nota="`${plural(overloaded.length, 'celda', 'celdas')} por encima de su capacidad`"
          to="/capacity"
          test-id="panel-card-overloaded"
        >
          <template #valor>
            <span
              class="whitespace-nowrap font-mono text-cp-kpi font-bold tabular-nums"
              :class="overloaded.length ? 'text-peligro-texto' : 'text-texto-marca'"
              data-testid="panel-overloaded-count"
            >
              {{ overloadedPeople.length }}
            </span>
          </template>
        </KpiCard>

        <KpiCard
          etiqueta="Proyectos activos"
          :valor="activeProjects.length"
          :insignia="{ tono: 'neutro', texto: `${activeDepartments} depto.` }"
          :nota="`${plural(activeDepartments, 'departamento', 'departamentos')} implicado${activeDepartments === 1 ? '' : 's'}`"
          to="/projects"
          test-id="panel-card-projects"
        />

        <KpiCard
          etiqueta="Planificación incompleta"
          :valor="pending.length"
          :insignia="
            pending.length
              ? { tono: 'aviso', texto: 'Pendiente', punto: true }
              : { tono: 'ok', texto: 'Al día', punto: true }
          "
          :nota="`${pendingByProblem.persona} sin persona · ${pendingByProblem.fechas} sin fechas`"
          to="/capacity"
          test-id="panel-card-pending"
        >
          <template #valor>
            <span
              class="whitespace-nowrap font-mono text-cp-kpi font-bold tabular-nums"
              :class="pending.length ? 'text-aviso-texto' : 'text-texto-marca'"
              data-testid="panel-pending-count"
            >
              {{ pending.length }}
            </span>
          </template>
        </KpiCard>
      </div>

      <BaseCard
        v-if="byDepartment.length > 1"
        aria-label="Estado por departamento"
        title="Estado por departamento"
        :nota="`Semana ${panel.week ? weekNumber(panel.week) : '—'} de cada equipo por separado`"
        data-testid="panel-departments"
      >
        <div class="overflow-x-auto">
          <table class="w-full text-left text-cp-sm">
            <thead>
              <tr class="border-b border-borde text-cp-xs uppercase tracking-wider text-texto-tenue">
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
                class="border-t border-borde-suave"
                data-testid="panel-department-row"
              >
                <th scope="row" class="py-2 pr-3 font-semibold text-texto">
                  {{ department.name }}
                </th>
                <td class="px-3 py-2 tabular-nums text-texto-suave">
                  {{ department.active_projects }}
                </td>
                <td class="px-3 py-2">
                  <span
                    class="rounded-pastilla px-2 py-0.5 text-cp-xs font-semibold tabular-nums"
                    :class="
                      department.overloaded_people
                        ? 'bg-peligro-fondo text-peligro-texto'
                        : 'bg-neutro-fondo text-neutro-texto'
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
                        ? 'text-texto-tenue'
                        : department.utilization >= 100
                          ? 'text-peligro-texto'
                          : 'text-texto-marca'
                    "
                  >
                    {{
                      department.utilization === null
                        ? 'sin capacidad'
                        : `${department.utilization} %`
                    }}
                  </span>
                  <span class="ml-2 text-cp-xs text-texto-tenue">
                    {{ formatHours(department.planned_hours) }} planificadas de
                    {{ formatHours(department.capacity_hours) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </BaseCard>

      <BaseCard
        v-if="showIncidentBlock"
        aria-label="Necesitan aprobación"
        title="Necesitan aprobación"
        :nota="`${pendingIncidents.length} ${
          pendingIncidents.length === 1 ? 'incidente' : 'incidentes'
        } por encima del umbral de aprobación`"
        data-testid="panel-incidents"
      >
        <div role="list" class="flex flex-col">
          <div
            v-for="incident in pendingIncidents"
            :key="incident.id"
            role="listitem"
            class="flex flex-wrap items-center gap-3 border-t border-borde-suave py-2 first:border-t-0"
            :data-testid="`panel-incident-${incident.id}`"
          >
            <div class="min-w-0 flex-1">
              <p class="text-cp-sm font-semibold text-texto">
                {{ incident.user_name }}
                <span v-if="incident.department_name" class="font-normal text-texto-tenue">
                  · {{ incident.department_name }}
                </span>
              </p>
              <p class="text-cp-xs text-texto-tenue">
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
              class="rounded-pastilla px-2 py-0.5 text-cp-xs font-semibold tabular-nums"
              :class="
                incident.hours !== null &&
                incident.capacity !== null &&
                incident.hours > incident.capacity
                  ? 'bg-peligro-fondo text-peligro-texto'
                  : 'bg-aviso-fondo text-aviso-texto'
              "
            >
              umbral de aprobación {{ incident.requires_approval_percent }} %
            </span>
            <template v-if="puedeResolver(incident)">
              <button
                type="button"
                class="rounded-control border border-ok-borde bg-tarjeta px-3 py-1.5 text-cp-xs font-semibold text-ok-texto transition-colors hover:bg-ok-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                :data-testid="`panel-incident-approve-${incident.id}`"
                @click="abrirResolucion(incident)"
              >
                Aprobar
              </button>
              <button
                type="button"
                class="rounded-control border border-peligro-borde bg-tarjeta px-3 py-1.5 text-cp-xs font-semibold text-peligro-texto transition-colors hover:bg-peligro-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                :data-testid="`panel-incident-reject-${incident.id}`"
                @click="abrirResolucion(incident)"
              >
                Rechazar
              </button>
            </template>
          </div>
        </div>
      </BaseCard>

      <div class="mb-4 grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        <BaseCard
          aria-label="Uso del equipo por semana"
          title="Uso del equipo por semana"
          nota="La línea discontinua marca el 100 % de la capacidad del equipo"
          class="lg:col-span-2"
        >
          <LoadBars
            :weeks="weeks"
            title="Uso del equipo por semana"
            test-id="panel-bars"
            :total-personas="panel.total_people"
          />
        </BaseCard>

        <section
          aria-label="Personas con sobrecarga"
          class="rounded-tarjeta border border-borde bg-tarjeta p-5 shadow-tarjeta"
        >
          <div class="mb-3 flex items-center justify-between gap-2">
            <h2 class="font-titulo text-cp-titulo font-bold text-texto-marca">
              Personas con sobrecarga
            </h2>
            <span
              class="rounded-pastilla bg-neutro-fondo px-2 py-0.5 font-mono text-cp-xs font-bold text-neutro-texto"
            >
              {{ overloadedPeople.length }}
            </span>
          </div>
          <div role="list" class="flex flex-col">
            <div
              v-for="persona in overloadedPeople"
              :key="persona.user_id"
              role="listitem"
              class="flex items-center gap-3 border-t border-borde-suave py-2 first:border-t-0"
              data-testid="panel-overloaded-row"
            >
              <div class="min-w-0 flex-1">
                <p class="text-cp-sm font-semibold text-texto">{{ persona.name }}</p>
                <p class="text-cp-xs text-texto-tenue">{{ semanasTexto(persona.weeks) }}</p>
              </div>
              <span
                class="rounded-pastilla bg-peligro-fondo px-2 py-0.5 text-cp-xs font-semibold tabular-nums text-peligro-texto"
              >
                hasta {{ persona.max }} %
              </span>
            </div>
            <div
              v-if="!overloadedPeople.length"
              class="rounded-control border border-borde bg-tarjeta-suave px-4 py-4 text-center"
              data-testid="panel-overloaded-empty"
            >
              <span
                class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-ok-fondo text-ok-texto"
              >
                <span class="inline-flex h-4 w-4">
                  <AppIcon name="check" />
                </span>
              </span>
              <p class="mt-2 text-cp-sm font-semibold text-texto">Equipo equilibrado</p>
              <p class="mt-0.5 text-cp-xs text-texto-tenue">
                Nadie supera su capacidad semanal en el periodo.
              </p>
            </div>
          </div>
          <RouterLink
            to="/capacity"
            class="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 text-cp-sm font-semibold text-texto-marca transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            data-testid="panel-go-capacity"
          >
            Ver en Capacidad
          </RouterLink>
        </section>
      </div>

      <div class="mb-4 grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <BaseCard aria-label="Carga por proyecto" title="Proyectos con más carga">
          <div class="flex flex-col gap-3">
            <div v-for="project in projects" :key="project.id" data-testid="panel-project-row">
              <div class="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <span class="truncate text-cp-sm font-semibold text-texto">
                    {{ project.name }}
                  </span>
                  <span
                    class="rounded-pastilla px-2 py-0.5 text-cp-micro font-semibold"
                    :class="estadoProyecto(project.status)"
                  >
                    {{ projectStatus(project.status).label }}
                  </span>
                </div>
                <span class="shrink-0 font-mono text-cp-xs text-texto-suave">
                  {{ formatHours(project.estimated_hours) }} ·
                  {{ plural(project.people_count, 'persona', 'personas') }}
                </span>
              </div>
              <span class="block h-2 w-full overflow-hidden rounded-pastilla bg-tarjeta-suave">
                <span
                  class="block h-2 rounded-pastilla bg-primario-medio"
                  :style="{ width: `${projectBarWidth(project)}%` }"
                ></span>
              </span>
            </div>
            <p v-if="!projects.length" class="text-cp-sm text-texto-tenue">
              No hay proyectos visibles.
            </p>
          </div>
        </BaseCard>

        <BaseCard
          aria-label="Planificación incompleta"
          title="Planificación incompleta"
          nota="Estas tareas no cuentan en la matriz hasta que tengan persona y fechas."
        >
          <div role="list" class="flex flex-col">
            <div
              v-for="task in pending"
              :key="task.id"
              role="listitem"
              class="flex flex-wrap items-center gap-2 border-t border-borde-suave py-2 first:border-t-0"
              data-testid="panel-pending-row"
            >
              <span class="min-w-0 flex-1 basis-48 text-cp-sm font-medium text-texto">
                {{ task.title }}
              </span>
              <span
                class="rounded-control bg-neutro-fondo px-1.5 py-0.5 text-cp-xs font-semibold text-neutro-texto"
              >
                {{ task.project_name }}
              </span>
              <span
                class="rounded-pastilla bg-aviso-fondo px-2 py-0.5 text-cp-xs font-semibold text-aviso-texto"
              >
                {{ task.problem }}
              </span>
              <RouterLink
                :to="`/projects/${task.project_id}/kanban`"
                class="inline-flex min-h-10 items-center rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-xs font-semibold text-texto-marca transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                data-testid="panel-pending-resolve"
              >
                Resolver
              </RouterLink>
            </div>
            <p
              v-if="!pending.length"
              class="py-2 text-cp-sm text-texto-tenue"
              data-testid="panel-pending-empty"
            >
              Toda la planificación tiene persona y fechas.
            </p>
          </div>
        </BaseCard>
      </div>

      <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section
          class="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta"
          data-testid="panel-projects-status"
        >
          <h2 class="mb-3 text-cp-xs font-bold uppercase tracking-wider text-texto-tenue">
            Proyectos por estado
          </h2>
          <div
            v-for="[status, count] in projectStatuses"
            :key="status"
            class="flex items-center justify-between py-1.5 text-cp-sm"
          >
            <span class="flex items-center gap-2 font-medium text-texto">
              <span class="h-2 w-2 rounded-full" :class="puntoProyecto(status)" aria-hidden="true"></span>
              {{ projectStatus(status).label }}
            </span>
            <span class="rounded-control bg-neutro-fondo px-2 py-0.5 font-mono font-bold text-texto-marca">
              {{ count }}
            </span>
          </div>
          <div v-if="!projectStatuses.length" class="py-1.5 text-cp-sm text-texto-tenue">
            No hay proyectos visibles.
          </div>
        </section>

        <section
          class="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta"
          data-testid="panel-tasks-status"
        >
          <h2 class="mb-3 text-cp-xs font-bold uppercase tracking-wider text-texto-tenue">
            Tareas por estado
          </h2>
          <div
            v-for="[status, count] in taskStatuses"
            :key="status"
            class="flex items-center justify-between py-1.5 text-cp-sm"
          >
            <span class="flex items-center gap-2 font-medium text-texto">
              <span class="h-2 w-2 rounded-full bg-neutro-punto" aria-hidden="true"></span>
              {{ etiquetaDe(status) }}
            </span>
            <span class="rounded-control bg-neutro-fondo px-2 py-0.5 font-mono font-bold text-texto-marca">
              {{ count }}
            </span>
          </div>
          <div v-if="!taskStatuses.length" class="py-1.5 text-cp-sm text-texto-tenue">
            No hay tareas en el período.
          </div>
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
      <p class="text-cp-sm text-texto-suave">
        Esta acción registra la decisión sobre la carga actual de la persona.
      </p>
      <label class="mt-3 block text-cp-sm font-medium text-texto">
        Nota (opcional)
        <textarea
          v-model="resolvingNote"
          rows="2"
          maxlength="2000"
          class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          data-testid="incident-note"
        ></textarea>
      </label>
      <p
        v-if="resolvingError"
        class="mt-3 rounded-control border border-peligro-borde bg-peligro-fondo p-3 text-cp-sm text-peligro-texto"
        data-testid="incident-error"
      >
        {{ resolvingError }}
      </p>
      <template #footer>
        <button
          type="button"
          class="rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 text-cp-sm font-medium text-texto-suave transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          @click="cerrarResolucion"
        >
          Cancelar
        </button>
        <button
          type="button"
          class="rounded-control border border-peligro-borde bg-tarjeta px-3 py-2 text-cp-sm font-semibold text-peligro-texto transition-colors hover:bg-peligro-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          data-testid="incident-reject-submit"
          @click="resolver('rechazada')"
        >
          Rechazar
        </button>
        <button
          type="button"
          class="rounded-control bg-primario-fuerte px-3 py-2 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          data-testid="incident-approve-submit"
          @click="resolver('aprobada')"
        >
          Aprobar
        </button>
      </template>
    </ModalDialog>
  </div>
</template>
