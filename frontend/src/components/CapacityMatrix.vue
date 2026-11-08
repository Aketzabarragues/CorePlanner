<script setup>
/**
 * Matriz de ocupacion.
 *
 * Con identificador de proyecto muestra la matriz de ese proyecto. Sin el, la
 * matriz es global: reúne las horas de todos los proyectos visibles y admite
 * un filtro por departamento.
 *
 * El eje de semanas es continuo: sale el rango pedido, tenga actividad o no.
 * Los filtros y el rango viven en la URL, de modo que recargar la pagina no
 * pierde nada y el enlace se puede compartir.
 *
 * Las celdas son clicables: al pulsar una se abre el desglose de las tareas
 * que componen esas horas, desde donde se pueden editar. Cualquier cambio
 * recalcula la matriz.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { overviewApi, projectsApi, skillsApi, tasksApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import {
  LOAD_STATE,
  isOverloaded,
  loadAspect,
  loadBarWidth,
  loadLabel,
  loadRatio,
  loadState,
  teamUsage,
} from '../utils/load'
import {
  currentWeekKey,
  shiftWeek,
  weekRangeLabel,
  weekTitle,
  weeksBetween,
  weeksFrom,
} from '../utils/weeks'
import AppIcon from './AppIcon.vue'
import CellBreakdown from './CellBreakdown.vue'
import AlertBanner from './common/AlertBanner.vue'
import AsyncState from './common/AsyncState.vue'
import SidePanel from './common/SidePanel.vue'

const auth = useAuthStore()
const store = useProjectsStore()
const route = useRoute()
const router = useRouter()

/** Numero de semanas del rango por defecto: la actual y las ocho siguientes. */
const RANGE_SIZE = 9

const props = defineProps({
  id: { type: [String, Number], default: null },
})

const report = ref(null)
const project = ref(null)
const error = ref(null)
const notice = ref(null)
const empty = ref(false)
const loading = ref(true)
const saving = ref(false)
const skills = ref([])

const breakdown = ref(null)
const breakdownTasks = ref([])

/** Sin identificador de proyecto la matriz es global. */
const isGlobal = computed(() => props.id === null || props.id === undefined)

const weeks = computed(() => report.value?.weeks ?? [])
const rows = computed(() => report.value?.rows ?? [])
/** Tareas que caen enteramente en dias no laborables: valen cero horas. */
const holidayTaskIds = computed(() => report.value?.holiday_task_ids ?? [])

/**
 * Personas del informe, con los proyectos de los que son miembro.
 *
 * El informe trae el perfil de cada persona, asi que no hace falta pedir los
 * miembros de cada proyecto por separado: las filas son las personas y sus
 * pertenencias.
 */
const people = computed(() =>
  rows.value.map((row) => ({
    user_id: row.user_id,
    name: row.name,
    project_ids: row.project_ids ?? [],
  })),
)

/** Titulo del panel de detalle: quien y en que semana. */
const breakdownTitle = computed(() =>
  breakdown.value ? `${breakdown.value.name} en ${breakdown.value.week}` : '',
)

/** Semana en curso, para marcar la columna con la insignia de "Hoy". */
const currentWeek = computed(() => currentWeekKey())

/** Leyenda de la escala de carga. */
const LEGEND = [
  { state: LOAD_STATE.FREE, label: 'Libre (menos del 50 %)' },
  { state: LOAD_STATE.MID, label: 'Carga media' },
  { state: LOAD_STATE.OPTIMAL, label: 'Óptimo (85–100 %)' },
  { state: LOAD_STATE.OVERLOAD, label: 'Sobrecarga leve ▲ (hasta 110 %)' },
  { state: LOAD_STATE.HIGH_OVERLOAD, label: 'Sobrecarga alta ▲ (más del 110 %)' },
]

/**
 * El estado de la pantalla vive en la URL.
 *
 * Los filtros son un valor calculado con su propio setter: al cambiarlo se
 * escribe en la URL, y de ahi lo lee la peticion del informe.
 */
const query = computed(() => route.query ?? {})

/** Marca que el cambio de la URL es nuestro y no hay que recargar por el. */
let escribiendo = false

/**
 * Escribe el estado en la URL.
 *
 * Los valores vacios se quitan: una URL con los filtros puestos se parece a
 * la que se copia para compartirla.
 */
async function updateQuery(patch) {
  const next = { ...query.value }
  for (const [key, value] of Object.entries(patch)) {
    if (value === '' || value === null || value === undefined) delete next[key]
    else next[key] = String(value)
  }
  escribiendo = true
  try {
    await router.replace({ query: next })
  } finally {
    escribiendo = false
  }
  await recargar()
}

/** Filtro de proyecto: solo en el espacio global. */
const projectFilter = computed({
  get: () => query.value.project ?? '',
  set: (value) => updateQuery({ project: value }),
})

/** Filtro de departamento: los proyectos que gestiona ese departamento. */
const departmentFilter = computed({
  get: () => query.value.department ?? '',
  set: (value) => updateQuery({ department: value }),
})

/** Filtro de competencia. */
const skillFilter = computed({
  get: () => query.value.skill ?? '',
  set: (value) =>
    updateQuery({
      skill: value,
      level: value ? levelFilter.value : undefined,
    }),
})

/** Nivel minimo de la competencia. */
const levelFilter = computed({
  get: () => query.value.level ?? '1',
  set: (value) => updateQuery({ level: value }),
})

/** Rango del eje: la semana inicial y la final. */
const range = computed(() => {
  const porDefecto = weeksFrom(currentWeekKey(), RANGE_SIZE)
  return {
    from: query.value.from ?? porDefecto[0],
    to: query.value.to ?? porDefecto[porDefecto.length - 1],
  }
})

/** Texto del rango que se ve: "Sem 45 - Sem 53". */
const rangeLabel = computed(
  () => `${weekTitle(range.value.from)} - ${weekTitle(range.value.to)}`,
)

/** Mueve el rango las semanas que se le pidan y lo deja en la URL. */
function moveRange(delta) {
  const size = Math.max(1, weeksBetween(range.value.from, range.value.to).length)
  const semanas = weeksFrom(shiftWeek(range.value.from, delta), size)
  updateQuery({ from: semanas[0], to: semanas[semanas.length - 1] })
}

/** Devuelve el rango a la semana en curso. */
function goToday() {
  const semanas = weeksFrom(currentWeekKey(), RANGE_SIZE)
  updateQuery({ from: semanas[0], to: semanas[semanas.length - 1] })
}

/**
 * Escribe en la URL el rango por defecto, si no viene uno.
 *
 * Asi el enlace que se copia lleva el rango que se esta viendo.
 */
async function normalizarUrl() {
  if (query.value.from && query.value.to) return
  const semanas = weeksFrom(currentWeekKey(), RANGE_SIZE)
  escribiendo = true
  try {
    await router.replace({
      query: {
        ...query.value,
        from: semanas[0],
        to: semanas[semanas.length - 1],
      },
    })
  } finally {
    escribiendo = false
  }
}

function cellOf(row, week) {
  return (
    row.cells.find((cell) => cell.week === week) ?? {
      week,
      hours: 0,
      capacity: null,
      is_overloaded: false,
    }
  )
}

/**
 * Como se ve una celda: cifras, estado de carga y clases.
 *
 * El estado lo decide la escala de carga, con la capacidad que da el backend.
 * Una celda sin horas muestra un punto; con capacidad desconocida muestra las
 * horas y nada mas: no se sabe si esta libre ni sobrecargada.
 */
function cellView(row, week) {
  const cell = cellOf(row, week)
  const state = loadState(cell.hours, cell.capacity)
  const aspect = loadAspect(state)
  const ratio = loadRatio(cell.hours, cell.capacity)
  const vacia = !(cell.hours > 0)

  return {
    week,
    state,
    etiqueta: loadLabel(state),
    sobrecargada: isOverloaded(state) || cell.is_overloaded === true,
    principal: vacia ? '·' : cell.hours,
    capacidad: vacia ? '' : ratio === null ? 'sin capacidad' : `/${cell.capacity}`,
    porcentaje: vacia || ratio === null ? '' : `${ratio} %`,
    anchoBarra: loadBarWidth(cell.hours, cell.capacity),
    clases: [aspect.cell, aspect.text, aspect.border].filter(Boolean).join(' '),
    claseBarra: aspect.bar,
    muestraBarra: !vacia && ratio !== null,
  }
}

/** La matriz con cada celda ya resuelta. */
const matrix = computed(() =>
  rows.value.map((row) => ({
    fila: row,
    celdas: weeks.value.map((semana) => cellView(row, semana.week)),
  })),
)

/** Uso del equipo en cada semana: horas, capacidad y estado. */
const team = computed(() =>
  weeks.value.map((semana) => {
    const usage = teamUsage(rows.value, semana.week)
    const state = loadState(usage.hours, usage.capacity)
    const aspect = loadAspect(state)
    const ratio = loadRatio(usage.hours, usage.capacity)
    return {
      week: semana.week,
      porcentaje: ratio === null ? '' : `${ratio} %`,
      anchoBarra: loadBarWidth(usage.hours, usage.capacity),
      clases: [aspect.cell, aspect.text, aspect.border].filter(Boolean).join(' '),
      claseBarra: aspect.bar,
    }
  }),
)

/** Horas totales del equipo. */
const teamTotal = computed(() =>
  rows.value.reduce((sum, row) => sum + Number(row.total_hours ?? 0), 0),
)

/** Colores de la muestra de la leyenda. */
function legendSwatch(state) {
  const aspect = loadAspect(state)
  return [aspect.cell, aspect.border].filter(Boolean).join(' ')
}

/** Lo que se lee en voz alta al saltar a una celda. */
function cellAria(row, week) {
  const cell = cellOf(row, week)
  const partes = [`${row.name}, semana ${weekTitle(week)}`]
  if (!(cell.hours > 0)) {
    partes.push('sin horas')
    return partes.join(', ')
  }
  partes.push(`${cell.hours} h`)
  const ratio = loadRatio(cell.hours, cell.capacity)
  if (ratio === null) {
    partes.push('capacidad desconocida')
  } else {
    partes.push(`de ${cell.capacity} h`)
    partes.push(`${ratio} %`)
  }
  if (cell.is_overloaded) partes.push('sobrecarga')
  return partes.join(', ')
}

/**
 * Etiqueta del festivo de la semana.
 *
 * Se enseño el primero, y cuantos hay mas. Un festivo de medio dia va
 * marcado con "1/2".
 */
function festivoEtiqueta(holidays) {
  const primero = holidays[0]
  const marca = primero.half_day ? '1/2 ' : ''
  const extra = holidays.length > 1 ? ` +${holidays.length - 1}` : ''
  return `${marca}${primero.name}${extra}`
}

/** Todos los festivos de la semana, para el texto que aparece al pasar. */
function festivoTitulo(holidays) {
  return holidays.map((festivo) => festivo.name).join(', ')
}

/** Recarga la matriz con los filtros del estado. */
async function refresh() {
  const token = auth.token
  const params = { from: range.value.from, to: range.value.to }
  if (skillFilter.value) {
    params.skill_id = skillFilter.value
    params.min_level = levelFilter.value
  }
  if (isGlobal.value) {
    if (departmentFilter.value) params.department_id = departmentFilter.value
    if (projectFilter.value) params.project_id = projectFilter.value
    report.value = await overviewApi.capacity(token, params)
    return
  }

  report.value = await projectsApi.capacity(token, project.value.id, params)
}

async function reload() {
  try {
    await refresh()
    if (breakdown.value) {
      await loadBreakdownTasks()
      syncBreakdownCell()
    }
    error.value = null
  } catch (err) {
    handleError(err)
  }
}

/** Recarga la matriz enseñando el esqueleto: lo que se ve va a cambiar. */
async function recargar() {
  loading.value = true
  try {
    await reload()
  } finally {
    loading.value = false
  }
}

/**
 * Deja el error en pantalla y cierra la sesion si el servidor dice que ya no
 * vale.
 *
 * Solo un 401 cierra la sesion. Un 500 o un fallo de red son problemas del
 * servidor: la sesion sigue viva y recargar la vista puede resolverlo.
 */
function handleError(err) {
  error.value = err.message
  if (err.status === 401) auth.clear()
}

/** Actualiza las horas que muestra el desglose con las del informe nuevo. */
function syncBreakdownCell() {
  const row = rows.value.find((r) => r.user_id === breakdown.value.user_id)
  if (!row) return
  const cell = cellOf(row, breakdown.value.week)
  breakdown.value = {
    ...breakdown.value,
    hours: cell.hours,
    weekly_base_hours: row.weekly_base_hours,
    is_overloaded: cell.is_overloaded,
  }
}

async function openCell(row, week) {
  const cell = cellOf(row, week)
  breakdown.value = {
    user_id: row.user_id,
    name: row.name,
    week,
    hours: cell.hours,
    weekly_base_hours: row.weekly_base_hours,
    is_overloaded: cell.is_overloaded,
  }
  await loadBreakdownTasks()
}

/**
 * Descarga las tareas de la persona en la semana abierta.
 *
 * El backend filtra por persona y por semana, de modo que solo llegan las
 * tareas que componen la celda. Si hay un proyecto filtrado, tambien se pide
 * el desglose de ese proyecto: la celda es de ese proyecto y el panel tiene
 * que contar la misma historia.
 */
async function loadBreakdownTasks() {
  if (!breakdown.value) return
  const token = auth.token
  const params = { week: breakdown.value.week, assigned_to: breakdown.value.user_id }
  const projectId = isGlobal.value ? projectFilter.value || null : project.value.id
  breakdownTasks.value = projectId
    ? await projectsApi.tasks(token, projectId, params)
    : await tasksApi.list(token, params)
}

async function saveTask(taskId, payload) {
  saving.value = true
  try {
    await tasksApi.update(auth.token, taskId, payload)
    notice.value = 'Tarea actualizada.'
    await reload()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteTask(task) {
  saving.value = true
  try {
    await tasksApi.remove(auth.token, task.id)
    notice.value = `Tarea "${task.title}" eliminada.`
    await reload()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

/** Reasigna una tarea a otra persona del proyecto. */
async function reassignTask(task, targetUserId) {
  if (targetUserId === null || targetUserId === undefined) {
    error.value = 'No hay personas a las que reasignar la tarea.'
    return
  }
  await saveTask(task.id, { assigned_to: targetUserId })
}

/** Catalogo de competencias, para el filtro. */
async function loadSkills(token) {
  if (skills.value.length) return
  skills.value = await skillsApi.catalog(token)
}

/**
 * Carga la matriz que toca.
 *
 * En el espacio global no hay proyecto que abrir: se piden los datos de
 * toda la organizacion. En un proyecto se busca entre los visibles y se
 * carga su matriz.
 *
 * Se vuelve a llamar cuando cambia el identificador de la ruta. El router
 * reutiliza la misma instancia del componente cuando solo cambia el
 * parametro, de modo que sin esta recarga la matriz seguiria mostrando los
 * datos del proyecto anterior.
 */
async function loadReport() {
  const token = await auth.ensureSession()
  await store.ensureProjects(token)
  await loadSkills(token)
  await normalizarUrl()

  if (isGlobal.value) {
    project.value = null
    await reload()
    return
  }

  const projects = store.projects
  empty.value = projects.length === 0
  if (empty.value) return

  project.value = projects.find((p) => String(p.id) === String(props.id)) ?? projects[0]
  await reload()
}

/** Vuelve a pedir la matriz y enseña el esqueleto mientras llega. */
async function reintentar() {
  loading.value = true
  try {
    await loadReport()
  } catch (err) {
    handleError(err)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    await loadReport()
  } catch (err) {
    handleError(err)
  } finally {
    loading.value = false
  }
})
useTaskReload(loadReport)

watch(
  () => props.id,
  async () => {
    loading.value = true
    try {
      await loadReport()
    } catch (err) {
      handleError(err)
    } finally {
      loading.value = false
    }
  },
)

watch(
  () => route.query,
  () => {
    if (escribiendo) return
    recargar()
  },
  { flush: 'sync' },
)
</script>

<template>
  <div>
    <header class="mb-3">
      <h1 class="text-xl font-semibold text-siemens-900">
        {{ isGlobal ? 'Capacidad Global' : 'Matriz de ocupación' }}
      </h1>
      <p v-if="project" class="mt-1 text-sm text-slate-500">{{ project.name }}</p>
      <p v-else-if="isGlobal" class="mt-1 text-sm text-slate-500">
        Reparto de horas de todos los proyectos visibles.
      </p>
    </header>

    <div class="mb-4 flex flex-wrap items-end gap-3">
      <label v-if="isGlobal" class="text-xs font-medium text-slate-600">
        <span class="mb-1 block">Proyecto</span>
        <select
          v-model="projectFilter"
          class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          data-testid="filter-project"
        >
          <option value="">Todos los proyectos</option>
          <option v-for="item in store.projects" :key="item.id" :value="String(item.id)">
            {{ item.name }}
          </option>
        </select>
      </label>

      <label class="text-xs font-medium text-slate-600">
        <span class="mb-1 block">Departamento</span>
        <select
          v-model="departmentFilter"
          class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          data-testid="filter-department"
        >
          <option value="">Todos los departamentos</option>
          <option
            v-for="item in store.departments"
            :key="item.id"
            :value="String(item.id)"
          >
            {{ item.name }}
          </option>
        </select>
      </label>

      <label class="text-xs font-medium text-slate-600">
        <span class="mb-1 block">Competencia</span>
        <select
          v-model="skillFilter"
          class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          data-testid="filter-skill"
        >
          <option value="">Cualquiera</option>
          <option v-for="item in skills" :key="item.id" :value="String(item.id)">
            {{ item.name }}
          </option>
        </select>
      </label>

      <label v-if="skillFilter" class="text-xs font-medium text-slate-600">
        <span class="mb-1 block">Nivel mínimo</span>
        <select
          v-model="levelFilter"
          class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          data-testid="filter-level"
        >
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </label>

      <div class="flex items-center gap-1">
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-600"
          aria-label="Semanas anteriores"
          data-testid="range-previous"
          @click="moveRange(-1)"
        >
          <span class="h-4 w-4"><AppIcon name="chevronLeft" /></span>
        </button>
        <button
          type="button"
          class="h-8 rounded border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
          data-testid="range-today"
          @click="goToday"
        >
          Hoy
        </button>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-600"
          aria-label="Semanas siguientes"
          data-testid="range-next"
          @click="moveRange(1)"
        >
          <span class="h-4 w-4"><AppIcon name="chevronRight" /></span>
        </button>
        <span class="ml-1 text-xs text-slate-500" data-testid="range-label">
          {{ rangeLabel }}
        </span>
      </div>
    </div>

    <AsyncState
      :loading="loading"
      :error="error"
      :empty="empty"
      empty-title="Todavía no hay proyectos visibles"
      empty-text="Crea el primero en Configuración para empezar a repartir la carga."
      loading-label="Cargando la matriz de capacidad"
      @retry="reintentar"
    >
      <AlertBanner v-if="notice" variant="success" class="mb-3">
        {{ notice }}
      </AlertBanner>

      <div class="max-h-[70vh] overflow-auto rounded border border-slate-200 bg-white">
        <table class="w-full border-collapse text-sm">
          <thead class="sticky top-0 z-10 bg-slate-100">
            <tr class="bg-slate-100">
              <th
                class="sticky left-0 z-20 border border-slate-200 bg-slate-100 px-3 py-2 text-left"
              >
                Persona
              </th>
              <th
                v-for="semana in weeks"
                :key="semana.week"
                class="border border-slate-200 px-2 py-2 text-center"
              >
                <span class="block text-xs font-semibold text-slate-700">
                  {{ weekTitle(semana.week) }}
                </span>
                <span class="block text-[10px] font-normal text-slate-500">
                  {{ weekRangeLabel(semana.week) }}
                </span>
                <span
                  v-if="semana.week === currentWeek"
                  class="mt-0.5 mr-1 inline-block rounded-full bg-siemens-900 px-1.5 py-px text-[10px] font-semibold text-white"
                >
                  Hoy
                </span>
                <span
                  v-if="semana.holidays && semana.holidays.length"
                  class="mt-0.5 inline-block rounded-full border border-slate-300 bg-slate-50 px-1.5 py-px text-[10px] font-medium text-slate-700"
                  :title="festivoTitulo(semana.holidays)"
                  data-testid="holiday-badge"
                >
                  {{ festivoEtiqueta(semana.holidays) }}
                </span>
              </th>
              <th class="border border-slate-200 px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entrada in matrix" :key="entrada.fila.user_id">
              <th
                class="sticky left-0 z-10 border border-slate-200 bg-white px-3 py-2 text-left font-medium"
              >
                {{ entrada.fila.name }}
                <span class="block text-xs font-normal text-slate-400">
                  {{ entrada.fila.weekly_base_hours }} h/semana
                </span>
              </th>
              <td
                v-for="celda in entrada.celdas"
                :key="celda.week"
                class="border border-slate-200 p-1"
              >
                <button
                  type="button"
                  class="flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded border px-1 py-1.5"
                  :class="celda.clases"
                  :title="`Ver tareas de ${entrada.fila.name} en ${celda.week}`"
                  :aria-label="cellAria(entrada.fila, celda.week)"
                  :data-testid="`cell-${entrada.fila.user_id}-${celda.week}`"
                  @click="openCell(entrada.fila, celda.week)"
                >
                  <span class="flex items-center gap-1">
                    <span v-if="celda.sobrecargada" class="h-3 w-3 shrink-0">
                      <AppIcon name="warning" />
                    </span>
                    <span class="text-sm font-semibold tabular-nums">{{ celda.principal }}</span>
                    <span class="text-[11px] tabular-nums opacity-80">
                      {{ celda.capacidad }}
                    </span>
                  </span>
                  <span v-if="celda.porcentaje" class="text-[10px] tabular-nums opacity-80">
                    {{ celda.porcentaje }}
                  </span>
                  <span
                    v-if="celda.muestraBarra"
                    class="block h-1 w-3/4 rounded bg-slate-900/10"
                  >
                    <span
                      class="block h-1 rounded"
                      :class="celda.claseBarra"
                      :style="{ width: `${celda.anchoBarra}%` }"
                    ></span>
                  </span>
                </button>
              </td>
              <td class="border border-slate-200 px-3 py-2 text-right tabular-nums">
                {{ entrada.fila.total_hours }}
              </td>
            </tr>

            <tr class="bg-slate-50">
              <th
                class="sticky left-0 z-10 border border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium"
              >
                Equipo
                <span class="block text-xs font-normal text-slate-400">uso agregado</span>
              </th>
              <td
                v-for="semana in team"
                :key="semana.week"
                class="border border-slate-200 p-1"
              >
                <div
                  class="flex min-h-14 flex-col items-center justify-center gap-1 rounded border px-1 py-1.5"
                  :class="semana.clases"
                >
                  <span class="text-sm font-semibold tabular-nums">
                    {{ semana.porcentaje || '·' }}
                  </span>
                  <span class="block h-1 w-3/4 rounded bg-slate-900/10">
                    <span
                      class="block h-1 rounded"
                      :class="semana.claseBarra"
                      :style="{ width: `${semana.anchoBarra}%` }"
                    ></span>
                  </span>
                </div>
              </td>
              <td class="border border-slate-200 px-3 py-2 text-right tabular-nums">
                {{ teamTotal }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
        <span v-for="item in LEGEND" :key="item.state" class="flex items-center gap-1.5">
          <span class="h-3 w-3 rounded border" :class="legendSwatch(item.state)"></span>
          {{ item.label }}
        </span>
      </div>
    </AsyncState>

    <p
      v-if="!loading && !error && holidayTaskIds.length"
      class="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
      data-testid="capacity-holiday-warning"
    >
      {{ holidayTaskIds.length }} tarea(s) caen enteramente en días no laborables y no se
      imputan: su carga no aparece en la matriz.
    </p>

    <p
      v-if="!loading && !error && rows.some((r) => r.has_overload)"
      class="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
    >
      Las celdas con triangulo son las semanas que superan la capacidad de la persona.
      Pulsa una celda para ver y editar las tareas que la componen.
    </p>

    <!-- Panel de detalle de la celda -->
    <SidePanel :open="Boolean(breakdown)" :title="breakdownTitle" @close="breakdown = null">
      <template #subtitle>
        <p v-if="breakdown" class="mt-1 text-sm text-slate-500">
          {{ breakdown.hours }} h de {{ breakdown.weekly_base_hours }} h base
          <span v-if="breakdown.is_overloaded" class="ml-1 font-semibold text-red-700">
            (sobrecargado)
          </span>
        </p>
      </template>

      <CellBreakdown
        :cell="breakdown"
        :tasks="breakdownTasks"
        :members="people"
        :projects="isGlobal ? store.projects : []"
        :saving="saving"
        @save="saveTask"
        @delete="deleteTask"
        @reassign="reassignTask"
      />
    </SidePanel>
  </div>
</template>
