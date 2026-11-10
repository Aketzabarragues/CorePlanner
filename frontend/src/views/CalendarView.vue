<script setup>
/**
 * Calendario de la planificacion.
 *
 * La misma planificacion que muestra el Gantt, vista por filas de persona: en
 * las tres vistas (mes, semana y dia) las tareas se colocan bajo la persona
 * que las lleva, de lunes a domingo, en vez de identificarse por color. El fin
 * de semana se ve atenuado y sin barras, porque el motor de capacidad no
 * reparte horas ahi. Los dias no laborables aparecen marcados en la cabecera,
 * porque forman parte del calendario de trabajo.
 *
 * El mes es una sola tabla con un grupo de filas por semana, y cada semana es
 * la misma rejilla de filas que la vista semanal. La vista de dia es el detalle
 * de un solo dia, y se abre al pulsar un dia de cualquiera de las dos.
 *
 * Es de toda la organizacion y los filtros son de presentacion: acotan lo que
 * ya esta cargado, no lo que la persona puede ver. Los tres viven en la URL
 * (`?department=`, `?project=` y `?assigned_to=`), de modo que la vista
 * abierta se puede compartir tal cual.
 *
 * Al pulsar una tarea se abre su detalle en el mismo panel que usa el Tablero.
 * Quien no puede escribir en ese proyecto lo ve en solo lectura.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { calendarApi, meApi, overviewApi, peopleApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import { useVisibilidad } from '../composables/useVisibilidad'
import AlertBanner from '../components/common/AlertBanner.vue'
import AsyncState from '../components/common/AsyncState.vue'
import VisibilityPanel from '../components/common/VisibilityPanel.vue'
import WeekLanes from '../components/common/WeekLanes.vue'
import DayDetail from '../components/DayDetail.vue'
import WeekGrid from '../components/WeekGrid.vue'
import PageHeader from '../components/common/PageHeader.vue'
import TaskDetailPanel from '../components/TaskDetailPanel.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import {
  currentMonthKey,
  localDateKey,
  longDateLabel,
  monthGrid,
  monthLabel,
  shiftDay,
  shiftMonth,
} from '../utils/month'
import { sortByDepartment } from '../utils/people'
import {
  currentWeekKey,
  isoWeekKey,
  shiftWeek,
  weekRangeLabel,
  weekWorkdays,
} from '../utils/weeks'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const store = useProjectsStore()

const view = ref('month')
const month = ref(currentMonthKey())
const week = ref(currentWeekKey())
const day = ref(localDateKey())
const tasks = ref([])
const members = ref([])
const undatedTaskIds = ref([])
const nonWorkingDays = ref([])
const people = ref([])
const error = ref(null)
const loading = ref(true)
/** Ambito de quien entra: rol y proyectos en los que puede escribir. */
const scope = ref(null)
/** Tarea abierta en el panel de detalle. */
const selectedTaskId = ref(null)

const query = computed(() => route.query ?? {})

/**
 * Escribe los filtros en la URL.
 *
 * Los valores vacios se quitan: una URL con los filtros puestos es la que se
 * copia para compartir la vista.
 */
async function updateQuery(patch) {
  const next = { ...query.value }
  for (const [key, value] of Object.entries(patch)) {
    if (value === '' || value === null || value === undefined) delete next[key]
    else next[key] = String(value)
  }
  await router.replace({ query: next })
}

/** Proyecto que filtra el calendario. */
const projectFilter = computed({
  get: () => query.value.project ?? '',
  set: (value) => updateQuery({ project: value }),
})

/** Departamento que filtra el calendario: el que gestiona cada proyecto. */
const departmentFilter = computed({
  get: () => query.value.department ?? '',
  set: (value) => updateQuery({ department: value }),
})

/** Persona que filtra el calendario: la que tiene la tarea asignada. */
const assignedToFilter = computed({
  get: () => query.value.assigned_to ?? '',
  set: (value) => updateQuery({ assigned_to: value }),
})

/** Lo que se lee encima del calendario: con filtro, solo sale ese proyecto. */
const subtitle = computed(() =>
  projectFilter.value
    ? 'Las tareas del proyecto que filtra, día a día.'
    : 'Las tareas de los proyectos visibles, día a día.',
)

/** Clase de cada pestana del conmutador de vista. */
const monthTabClass = computed(() =>
  view.value === 'month' ? 'bg-siemens-900 text-white' : 'bg-white text-slate-700',
)
const weekTabClass = computed(() =>
  view.value === 'week' ? 'bg-siemens-900 text-white' : 'bg-white text-slate-700',
)
const dayTabClass = computed(() =>
  view.value === 'day' ? 'bg-siemens-900 text-white' : 'bg-white text-slate-700',
)

const weeks = computed(() => monthGrid(month.value))

/** Departamento que gestiona cada proyecto visible. */
const departmentByProject = computed(() => {
  const map = new Map()
  for (const project of store.projects) {
    if (project.department_id === null || project.department_id === undefined) continue
    map.set(Number(project.id), Number(project.department_id))
  }
  return map
})

/**
 * Personas que se pueden esconder: las que salen en el calendario, con su
 * departamento.
 *
 * El departamento es el de la persona, no el del proyecto que gestiona: se
 * busca en el directorio. Si la persona no esta en el, no tiene departamento.
 */
const personasVisibilidad = computed(() =>
  members.value.map((member) => {
    const persona = people.value.find((item) => String(item.id) === String(member.user_id))
    return {
      id: member.user_id,
      name: member.name,
      department_id: persona?.department_id ?? null,
      department_name: persona?.department_name ?? null,
    }
  }),
)

/**
 * Mostrar y ocultar personas y departamentos.
 *
 * Vive en la vista: no va a la URL, no se pide al servidor y no se guarda.
 * Es una vista de lo que ya esta cargado, no un filtro de los datos.
 */
const {
  departamentosOcultos,
  idsOcultos,
  ocultosCount,
  ocultoPara,
  alternarPersona,
  alternarDepartamento,
  mostrarTodos,
} = useVisibilidad(personasVisibilidad)

/**
 * Tareas que pasan los tres filtros.
 *
 * Los filtros se combinan: una tarea sale solo si cumple los tres. El
 * departamento se acota con el que gestiona cada proyecto; si esa lista no se
 * ha podido leer, el filtro se deja al servidor, que ya lo aplico.
 *
 * Las tareas de las personas escondidas tampoco salen. Las que no tienen
 * persona se quedan.
 */
const visibleTasks = computed(() =>
  tasks.value.filter((task) => {
    if (projectFilter.value && String(task.project_id) !== String(projectFilter.value)) {
      return false
    }
    if (assignedToFilter.value && String(task.assigned_to ?? '') !== String(assignedToFilter.value)) {
      return false
    }
    if (departmentFilter.value && departmentByProject.value.size) {
      const department = departmentByProject.value.get(Number(task.project_id))
      if (String(department ?? '') !== String(departmentFilter.value)) return false
    }
    if (ocultoPara(task.assigned_to)) return false
    return true
  }),
)

/**
 * Personas visibles, ordenadas por departamento y luego por nombre.
 *
 * Es la lista de filas de los carriles: una por persona, aunque no tenga
 * tareas. Las escondidas por el panel de visibilidad ya no estan.
 */
const personasVisibles = computed(() =>
  sortByDepartment(personasVisibilidad.value.filter((persona) => !ocultoPara(persona.id))),
)

/** Si hay algun filtro puesto. */
const hayFiltros = computed(
  () => Boolean(projectFilter.value || departmentFilter.value || assignedToFilter.value),
)

/** Tarea abierta en el panel de detalle. */
const selectedTask = computed(
  () => tasks.value.find((task) => task.id === selectedTaskId.value) ?? null,
)

/**
 * Si se puede escribir en la tarea abierta.
 *
 * Es el mismo criterio que usa el Tablero: el proyecto tiene que estar entre
 * los editables de quien entra. Sin ambito no hay permiso.
 */
const canEditSelected = computed(() => {
  const editable = scope.value?.editable_project_ids
  if (!editable || !selectedTask.value) return false
  return editable.includes(Number(selectedTask.value.project_id))
})

/**
 * Semanas del mes, con sus siete dias.
 *
 * El mes se ve como una sola tabla con un grupo de filas por semana. El fin de
 * semana sale atenuado y sin barras: el motor de capacidad solo reparte horas
 * entre dias laborables.
 */
const semanasDelMes = computed(() => weeks.value)

async function load() {
  try {
    const token = await auth.ensureSession()
    const params = {}
    if (projectFilter.value) params.project_id = projectFilter.value
    if (departmentFilter.value) params.department_id = departmentFilter.value
    if (assignedToFilter.value) params.assigned_to = assignedToFilter.value
    const [feed, days, ambito, directorio] = await Promise.all([
      overviewApi.gantt(token, params),
      calendarApi.list(token),
      // El ambito va aparte: si no se puede leer, la tarea se abre en solo
      // lectura, pero se abre.
      meApi.get(token).catch(() => null),
      peopleApi.list(token).catch(() => []),
    ])
    tasks.value = feed.tasks ?? []
    members.value = feed.members ?? []
    undatedTaskIds.value = feed.undated_task_ids ?? []
    nonWorkingDays.value = days ?? []
    scope.value = ambito
    people.value = directorio ?? []
    // Los proyectos y los departamentos de los filtros son opcionales: si no
    // se pueden leer, el calendario sigue en pie.
    await store.ensureProjects(token).catch(() => [])
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function step(delta) {
  if (view.value === 'day') {
    day.value = shiftDay(day.value, delta)
    return
  }
  if (view.value === 'week') {
    week.value = shiftWeek(week.value, delta)
    return
  }
  month.value = shiftMonth(month.value, delta)
}

/**
 * Cambia entre las vistas de mes, semana y dia.
 *
 * Al cambiar de vista cada una se coloca donde le toca: si el mes que se estaba
 * viendo es el mes en curso, la semana es la de hoy; si no, la del primer dia
 * de ese mes. Al volver al mes, el mes es el de la semana en pantalla.
 */
function setView(next) {
  if (next === view.value) return
  if (next === 'day') {
    day.value = localDateKey()
  } else if (next === 'week') {
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

/** Abre el detalle de un dia. */
function openDay(date) {
  day.value = date
  view.value = 'day'
}

/** Abre el detalle de una tarea. */
function openTask(taskId) {
  selectedTaskId.value = taskId
}

/** Cierra el panel de detalle y vuelve a pintar el calendario. */
function onTaskDeleted() {
  selectedTaskId.value = null
  load()
}

function goToday() {
  month.value = currentMonthKey()
  week.value = currentWeekKey()
  day.value = localDateKey()
}

/** Vuelve a pedir los datos y enseña el esqueleto mientras llegan. */
async function reintentar() {
  loading.value = true
  await load()
}

onMounted(load)
useTaskReload(load)

watch(
  () => [route.query.project, route.query.department, route.query.assigned_to],
  async () => {
    loading.value = true
    await load()
    loading.value = false
  },
)
</script>

<template>
  <div>
    <PageHeader title="Calendario" :subtitle="subtitle">
      <template #actions>
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
            <button
              type="button"
              class="px-3 py-1.5 text-sm"
              :class="dayTabClass"
              data-testid="calendar-view-day"
              @click="setView('day')"
            >
              Día
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
            v-else-if="view === 'week'"
            class="min-w-44 text-center text-sm font-medium text-siemens-900"
            data-testid="calendar-week"
          >
            {{ weekRangeLabel(week) }}
            <span class="ml-1 text-xs font-normal text-slate-400">{{ week }}</span>
          </span>
          <span
            v-else
            class="min-w-44 text-center text-sm font-medium text-siemens-900"
            data-testid="calendar-day"
          >
            {{ longDateLabel(day) }}
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

      </template>
    </PageHeader>

    <AsyncState
      :loading="loading"
      :error="error"
      error-test-id="calendar-error"
      loading-label="Cargando el calendario"
      @retry="reintentar"
    >
      <div class="mb-4 flex flex-wrap items-end gap-3">
        <label class="text-xs font-medium text-slate-600">
          <span class="mb-1 block">Departamento</span>
          <select
            v-model="departmentFilter"
            class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            data-testid="filter-department"
          >
            <option value="">Todos los departamentos</option>
            <option
              v-for="department in store.departments"
              :key="department.id"
              :value="String(department.id)"
            >
              {{ department.name }}
            </option>
          </select>
        </label>

        <label class="text-xs font-medium text-slate-600">
          <span class="mb-1 block">Proyecto</span>
          <select
            v-model="projectFilter"
            class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            data-testid="filter-project"
          >
            <option value="">Todos los proyectos</option>
            <option v-for="project in store.projects" :key="project.id" :value="String(project.id)">
              {{ project.name }}
            </option>
          </select>
        </label>

        <label class="text-xs font-medium text-slate-600">
          <span class="mb-1 block">Persona</span>
          <select
            v-model="assignedToFilter"
            class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            data-testid="filter-person"
          >
            <option value="">Todas las personas</option>
            <option v-for="person in people" :key="person.id" :value="String(person.id)">
              {{ person.name }}
            </option>
          </select>
        </label>

        <VisibilityPanel
          :personas="personasVisibilidad"
          :ids-ocultos="idsOcultos"
          :departamentos-ocultos="departamentosOcultos"
          :ocultos-count="ocultosCount"
          @alternar-persona="alternarPersona"
          @alternar-departamento="alternarDepartamento"
          @mostrar-todos="mostrarTodos"
        />
      </div>

      <AlertBanner
        v-if="hayFiltros && !visibleTasks.length"
        variant="info"
        class="mb-3"
        data-testid="calendar-no-match"
      >
        Ninguna tarea coincide con los filtros.
      </AlertBanner>

      <p v-if="undatedTaskIds.length" class="mb-3 text-xs text-amber-700">
        {{ undatedTaskIds.length }} tarea(s) sin fechas no aparecen en el calendario.
      </p>

      <div
        v-if="view === 'month'"
        class="overflow-x-auto rounded border border-slate-200 bg-white"
        data-testid="calendar-month-view"
      >
        <table
          class="w-full min-w-[42rem] table-fixed border-collapse text-sm"
          data-testid="calendar-month-table"
        >
          <template v-for="(semana, indice) in semanasDelMes" :key="indice">
            <WeekLanes
              :days="semana"
              :people="personasVisibles"
              :tasks="visibleTasks"
              :non-working-days="nonWorkingDays"
              @open-day="openDay"
              @open-task="openTask"
            />
          </template>
        </table>
      </div>

      <WeekGrid
        v-else-if="view === 'week'"
        :week-key="week"
        :people="personasVisibles"
        :tasks="visibleTasks"
        :non-working-days="nonWorkingDays"
        @open-day="openDay"
        @open-task="openTask"
      />

      <DayDetail
        v-else
        :date="day"
        :people="personasVisibles"
        :tasks="visibleTasks"
        :non-working-days="nonWorkingDays"
        @open-task="openTask"
      />

      <p class="mt-3 text-xs text-slate-500">
        Las tareas se ven de lunes a viernes: el motor de capacidad solo reparte
        horas entre días laborables. El fin de semana queda vacío.
      </p>
    </AsyncState>

    <!--
      Detalle de la tarea abierta al pulsarla en cualquiera de las tres vistas.
      Sin permiso de escritura en su proyecto, el panel se ve en solo lectura.
    -->
    <TaskDetailPanel
      :open="selectedTaskId !== null"
      :task-id="selectedTaskId"
      :can-edit="canEditSelected"
      @close="selectedTaskId = null"
      @saved="load"
      @deleted="onTaskDeleted"
    />
  </div>
</template>
