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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
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

/** Modos de la celda. */
const MODE = {
  HOURS: 'horas',
  PERCENT: 'porcentaje',
  PROJECTS: 'proyectos',
}

const report = ref(null)
const project = ref(null)
const error = ref(null)
const notice = ref(null)
/** Aviso que no tapa la matriz: un destino que no vale, un rechazo del servidor. */
const aviso = ref(null)
const empty = ref(false)
const loading = ref(true)
const saving = ref(false)
const skills = ref([])

const breakdown = ref(null)
const breakdownTasks = ref([])

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
    role_name: row.job_title ?? '',
    project_ids: row.project_ids ?? [],
  })),
)

/** Dias no laborables de la semana abierta, para las notas del panel. */
const breakdownHolidays = computed(() => {
  const semana = weeks.value.find((item) => item.week === breakdown.value?.week)
  return semana?.holidays ?? []
})

/** El alta de tareas solo tiene sentido con un proyecto delante. */
const canCreate = computed(() => project.value !== null)

/** Enlace al Gantt: con el proyecto que filtra, o el de toda la organizacion. */
const ganttLink = computed(() =>
  project.value ? `/gantt?project=${project.value.id}` : '/gantt',
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

/** Modos de la celda, con su etiqueta. */
const MODES = [
  { value: MODE.HOURS, label: 'Horas' },
  { value: MODE.PERCENT, label: '% de uso' },
  { value: MODE.PROJECTS, label: 'Proyectos' },
]

/** Aspecto del boton de modo: activo o inactivo. */
const MODE_ACTIVE = 'bg-siemens-900 text-white'
const MODE_INACTIVE = 'border border-slate-300 bg-white text-slate-700'

/** Aspecto de una celda mientras se arrastra una tarea. */
const PREVIEW_BORDER = 'border-2 border-dashed border-slate-500'
const PREVIEW_BLOCKED =
  'border-2 border-dashed border-slate-400 cp-striped text-slate-500 cursor-not-allowed'

/** Tarea que se esta arrastrando, con su semana y su persona de origen. */
const dragging = ref(null)

/** Si se esta enseñando la previsualizacion del arrastre. */
const previsualizando = ref(false)

/** Celda sobre la que se puede soltar, para resaltarla mientras se arrastra. */
const dropTarget = ref(null)

/** Celda por la que ha pasado el arrastre, para resolver el destino al soltar. */
const celdaHover = ref(null)

/**
 * Mostrar y ocultar filas de la matriz.
 *
 * Vive en el componente: no va a la URL, no se pide al servidor y no se
 * guarda. Es una vista de la matriz, no un filtro de los datos.
 */
const panelVisibilidad = ref(false)
const personasOcultas = ref([])
const departamentosOcultos = ref([])
const panelVisibilidadRoot = ref(null)

/** Clave del grupo de departamento: el id, o 'sin' si la persona no tiene. */
function claveDepartamento(row) {
  const id = row.department_id
  return id === null || id === undefined ? 'sin' : String(id)
}

/** Si la persona esta escondida, ya sea por ella o por su departamento. */
function personaOculta(row) {
  if (departamentosOcultos.value.includes(claveDepartamento(row))) return true
  return personasOcultas.value.includes(String(row.user_id))
}

/** Personas que se ven en la matriz. */
const filasVisibles = computed(() => rows.value.filter((row) => !personaOculta(row)))

/** Cuantas personas quedan fuera de la matriz. */
const ocultosCount = computed(() => rows.value.length - filasVisibles.value.length)

/** Nombre del departamento: el de la fila o el del catalogo. */
function nombreDepartamento(clave, row) {
  if (row.department_name) return row.department_name
  if (clave === 'sin') return 'Sin departamento'
  const encontrado = store.departments.find((item) => String(item.id) === clave)
  return encontrado?.name ?? `Departamento ${clave}`
}

/** Departamentos de las personas del informe, con sus miembros. */
const gruposVisibilidad = computed(() => {
  const grupos = new Map()
  for (const row of rows.value) {
    const clave = claveDepartamento(row)
    if (!grupos.has(clave)) {
      grupos.set(clave, { id: clave, name: nombreDepartamento(clave, row), rows: [] })
    }
    grupos.get(clave).rows.push(row)
  }
  return [...grupos.values()]
})

/** Esconde o muestra una persona. */
function alternarPersona(userId) {
  const id = String(userId)
  const row = rows.value.find((item) => String(item.user_id) === id)
  if (!row) return
  if (!personaOculta(row)) {
    personasOcultas.value = [...personasOcultas.value, id]
    return
  }
  personasOcultas.value = personasOcultas.value.filter((item) => item !== id)
  // Si el departamento estaba escondido, se muestra y se esconden sus
  // compañeros: las personas visibles no cambian.
  const clave = claveDepartamento(row)
  if (!departamentosOcultos.value.includes(clave)) return
  departamentosOcultos.value = departamentosOcultos.value.filter((item) => item !== clave)
  const acompanantes = rows.value
    .filter((item) => claveDepartamento(item) === clave && String(item.user_id) !== id)
    .map((item) => String(item.user_id))
  personasOcultas.value = [...personasOcultas.value, ...acompanantes]
}

/** Esconde o muestra un departamento entero. */
function alternarDepartamento(clave) {
  if (departamentosOcultos.value.includes(clave)) {
    departamentosOcultos.value = departamentosOcultos.value.filter((item) => item !== clave)
    return
  }
  departamentosOcultos.value = [...departamentosOcultos.value, clave]
}

/** Muestra a todo el mundo otra vez. */
function mostrarTodos() {
  personasOcultas.value = []
  departamentosOcultos.value = []
}

/** Cierra el panel de visibilidad cuando se pulsa fuera. */
function onDocumentClick(event) {
  if (!panelVisibilidadRoot.value?.contains(event.target)) panelVisibilidad.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))

/** Marca que el arrastre acaba de terminar, para que el clic no abra la celda. */
let arrastreTerminado = false

/** Temporizador que olvida el arrastre cuando no llega el evento de soltar. */
let limpiezaArrastre = null

/** Si el soltar ya se ha resuelto, para no hacerlo dos veces. */
let dropResuelto = false

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
 * la que se copia para compartirla. Con recargarAhora false el cambio no
 * cambia lo que se ve: es el modo o la celda abierta, que no piden datos.
 */
async function updateQuery(patch, recargarAhora = true) {
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
  if (recargarAhora) await recargar()
}

/** Modo de la celda: horas, porcentaje o proyectos. */
const mode = computed({
  get: () => query.value.mode ?? MODE.HOURS,
  set: (value) => updateQuery({ mode: value === MODE.HOURS ? undefined : value }, false),
})

/** Filtro de proyecto: el que elige el selector de la cabecera. */
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
 * Si una persona es miembro del proyecto de una tarea.
 *
 * El backend rechaza con un 422 a quien no es miembro del proyecto, asi que el
 * arrastre no lo ofrece como destino.
 */
function esMiembro(row, projectId) {
  if (projectId === null || projectId === undefined) return false
  return (row.project_ids ?? []).some((id) => Number(id) === Number(projectId))
}

/**
 * Lo que se previsualiza en una celda mientras se arrastra una tarea.
 *
 * Solo se previsualiza la semana de la tarea: es la unica en la que cambia el
 * reparto. Las horas que se suman son las que la tarea aporta en esa semana,
 * que es lo que da el backend, y no las estimadas enteras.
 *
 * La celda de origen enseña lo que quedaria sin la tarea, los destinos que no
 * valen se marcan como bloqueados, y los demas enseñan la carga resultante
 * con la escala de colores.
 */
function previewOf(row, week) {
  const arrastre = dragging.value
  if (!previsualizando.value || !arrastre || arrastre.week !== week) return null

  const celda = cellOf(row, week)
  const horas = arrastre.hours

  if (row.user_id === arrastre.fromUserId) {
    return {
      principal: `${centimas(Number(celda.hours ?? 0) - horas)} h`,
      sub: `origen · −${horas} h`,
      clases: `${PREVIEW_BORDER} bg-white text-slate-700`,
      permitido: true,
      origen: true,
    }
  }

  if (!esMiembro(row, arrastre.task.project_id)) {
    const nombre = projectNames.value.get(arrastre.task.project_id) ?? 'del proyecto'
    return {
      principal: 'No es miembro',
      sub: `del proyecto ${nombre}`,
      clases: PREVIEW_BLOCKED,
      permitido: false,
      origen: false,
    }
  }

  const nuevas = centimas(Number(celda.hours ?? 0) + horas)
  const state = loadState(nuevas, celda.capacity)
  const aspect = loadAspect(state)
  const ratio = loadRatio(nuevas, celda.capacity)
  return {
    principal: `${nuevas} h`,
    sub: ratio === null ? `+${horas} h` : `${ratio} % · +${horas} h`,
    clases: [aspect.cell, aspect.text, 'border-2', 'border-dashed', aspect.border]
      .filter(Boolean)
      .join(' '),
    permitido: true,
    origen: false,
  }
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
  const preview = previewOf(row, week)

  return {
    week,
    state,
    etiqueta: loadLabel(state),
    sobrecargada: isOverloaded(state) || cell.is_overloaded === true,
    principal: vacia ? '·' : cell.hours,
    capacidad: vacia ? '' : ratio === null ? 'sin capacidad' : `/${cell.capacity}`,
    porcentaje: vacia || ratio === null ? '' : `${ratio} %`,
    horasCapacidad:
      vacia || ratio === null ? '' : `${cell.hours}/${cell.capacity} h`,
    anchoBarra: loadBarWidth(cell.hours, cell.capacity),
    preview,
    clases: preview
      ? preview.clases
      : [aspect.cell, aspect.text, aspect.border].filter(Boolean).join(' '),
    claseBarra: aspect.bar,
    muestraBarra: !vacia && ratio !== null,
    proyectos: (cell.projects ?? []).map((item) => ({
      id: item.project_id,
      nombre: projectNames.value.get(item.project_id) ?? `Proyecto ${item.project_id}`,
      horas: item.hours,
    })),
  }
}

/** Nombre de cada proyecto visible, para las etiquetas del modo Proyectos. */
const projectNames = computed(
  () => new Map(store.projects.map((item) => [item.id, item.name])),
)

/**
 * Resumen del equipo: celdas sobrecargadas, huecos libres y uso medio.
 *
 * Solo cuenta lo que el backend ya dice: las horas, las capacidades y la
 * marca de sobrecarga de cada celda.
 */
const summary = computed(() => {
  let sobrecargadas = 0
  let huecos = 0
  let horas = 0
  let capacidad = 0
  for (const row of rows.value) {
    for (const cell of row.cells) {
      if (cell.is_overloaded) sobrecargadas += 1
      const limite = cell.capacity
      if (limite === null || limite === undefined) continue
      if (limite - cell.hours >= 20) huecos += 1
      horas += Number(cell.hours ?? 0)
      capacidad += Number(limite)
    }
  }
  return {
    sobrecargadas,
    huecos,
    medio: capacidad > 0 ? Math.round((horas / capacidad) * 100) : null,
  }
})

/**
 * Paleta de las franjas de departamento.
 *
 * El indice sale del id del departamento, de modo que un departamento siempre
 * lleva el mismo color y la paleta se repite cuando se acaba.
 */
const DEPARTMENT_COLORS = [
  'bg-blue-900',
  'bg-teal-700',
  'bg-amber-700',
  'bg-violet-700',
  'bg-rose-800',
  'bg-slate-600',
]

/** Franja de la persona que no tiene departamento. */
const DEPARTMENT_COLOR_NONE = 'bg-slate-400'

/** Color de la franja de una persona. */
function departmentColorClass(departmentId) {
  if (departmentId === null || departmentId === undefined) return DEPARTMENT_COLOR_NONE
  const id = Number(departmentId)
  if (!Number.isFinite(id)) return DEPARTMENT_COLOR_NONE
  return DEPARTMENT_COLORS[Math.abs(id) % DEPARTMENT_COLORS.length]
}

/** La matriz con cada celda ya resuelta. */
const matrix = computed(() =>
  filasVisibles.value.map((row) => ({
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
  const preview = previewOf(row, week)
  if (preview) {
    return `${row.name}, semana ${weekTitle(week)}: ${preview.principal}. ${preview.sub}`
  }

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
  if (departmentFilter.value) params.department_id = departmentFilter.value
  if (projectFilter.value) params.project_id = projectFilter.value
  report.value = await overviewApi.capacity(token, params)
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
    capacity: cell.capacity,
    weekly_base_hours: row.weekly_base_hours,
    is_overloaded: cell.is_overloaded,
  }
}

/**
 * Abre el detalle de una celda.
 *
 * La celda abierta vive en la URL: al recargar la pagina el panel sigue
 * abierto en la misma celda.
 */
async function openCell(row, week) {
  const cell = cellOf(row, week)
  breakdown.value = {
    user_id: row.user_id,
    name: row.name,
    week,
    hours: cell.hours,
    capacity: cell.capacity,
    weekly_base_hours: row.weekly_base_hours,
    is_overloaded: cell.is_overloaded,
  }
  await loadBreakdownTasks()
  await updateQuery({ cell: `${row.user_id}-${week}` }, false)
}

/** Cierra el detalle de la celda. */
async function closeCell() {
  breakdown.value = null
  await updateQuery({ cell: undefined }, false)
}

/** Abre la celda que dice la URL, si sigue existiendo en el informe. */
async function openCellFromUrl() {
  const valor = query.value.cell
  if (!valor) return
  // La clave de la semana tambien lleva un guion: "2-2026-W46".
  const [userId, ...resto] = String(valor).split('-')
  const week = resto.join('-')
  const row = rows.value.find((item) => String(item.user_id) === userId)
  if (!row || !week) return
  const cell = cellOf(row, week)
  breakdown.value = {
    user_id: row.user_id,
    name: row.name,
    week,
    hours: cell.hours,
    capacity: cell.capacity,
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
  const projectId = projectFilter.value || null
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
    aviso.value = 'No hay personas a las que reasignar la tarea.'
    return
  }
  await reasignarTarea(task, targetUserId, breakdown.value?.week)
}

/**
 * Reasigna una tarea y mueve las horas de la celda al momento.
 *
 * El cambio se pinta antes de que conteste el servidor y, si el servidor lo
 * rechaza, se vuelve atras. Las horas que se mueven son las de la tarea en esa
 * semana, que es lo que dice el backend; despues, el informe manda.
 */
async function reasignarTarea(task, targetUserId, semana) {
  const origen = rows.value.find((row) => row.user_id === task.assigned_to)
  const destino = rows.value.find((row) => row.user_id === targetUserId)
  if (!destino || !semana) return

  const copia = JSON.parse(JSON.stringify(report.value))
  const horas = Number(task.week_hours ?? task.estimated_hours ?? 0)
  moverHoras(origen, destino, semana, horas, task.project_id)

  saving.value = true
  try {
    await tasksApi.update(auth.token, task.id, { assigned_to: targetUserId })
  } catch (err) {
    report.value = copia
    syncBreakdownCell()
    aviso.value = `No se ha podido reasignar la tarea: ${err.message}`
    saving.value = false
    return
  }
  saving.value = false
  notice.value = `Tarea "${task.title}" reasignada a ${destino.name}.`
  aviso.value = null
  await reload()
}

/**
 * Redondea a centimas de hora, que es como cuenta el motor.
 *
 * Sin redondear, una resta deja decimales de ruido: 32 - 16.4 sale
 * 15.600000000000001.
 */
function centimas(value) {
  return Math.round(Number(value ?? 0) * 100) / 100
}

/**
 * Pasa las horas de una celda a otra, sin tocar el servidor.
 *
 * Aplica el mismo reparto que el backend: la celda de origen pierde las horas
 * de la tarea en su proyecto, y la de destino las gana.
 */
function moverHoras(origen, destino, semana, horas, projectId) {
  if (!origen) return
  const celdaOrigen = origen.cells.find((cell) => cell.week === semana)
  const celdaDestino = destino.cells.find((cell) => cell.week === semana)
  if (!celdaOrigen || !celdaDestino) return

  celdaOrigen.hours = centimas(Number(celdaOrigen.hours ?? 0) - horas)
  celdaDestino.hours = centimas(Number(celdaDestino.hours ?? 0) + horas)

  if (projectId !== null && projectId !== undefined) {
    restarProyecto(celdaOrigen, projectId, horas)
    sumarProyecto(celdaDestino, projectId, horas)
  }

  marcarSobrecarga(celdaOrigen)
  marcarSobrecarga(celdaDestino)
  recalcularTotales(origen)
  recalcularTotales(destino)
}

/** Quita las horas de un proyecto de una celda. */
function restarProyecto(celda, projectId, horas) {
  celda.projects = (celda.projects ?? [])
    .map((item) =>
      Number(item.project_id) === Number(projectId)
        ? { project_id: item.project_id, hours: centimas(Number(item.hours ?? 0) - horas) }
        : item,
    )
    .filter((item) => Number(item.hours ?? 0) > 0)
}

/** Suma las horas de un proyecto a una celda. */
function sumarProyecto(celda, projectId, horas) {
  const lista = celda.projects ?? []
  const existente = lista.find((item) => Number(item.project_id) === Number(projectId))
  if (existente) {
    existente.hours = centimas(Number(existente.hours ?? 0) + horas)
    return
  }
  celda.projects = [...lista, { project_id: projectId, hours: centimas(horas) }]
}

/** Marca la celda como sobrecargada si sus horas pasan de la capacidad. */
function marcarSobrecarga(celda) {
  const capacidad = celda.capacity
  celda.is_overloaded =
    capacidad !== null &&
    capacidad !== undefined &&
    Number(celda.hours) > Number(capacidad)
}

/** El total de la fila es la suma de sus celdas, como en el informe. */
function recalcularTotales(row) {
  const suma = row.cells.reduce((total, cell) => total + Number(cell.hours ?? 0), 0)
  row.total_hours = centimas(suma)
  row.has_overload = row.cells.some((cell) => cell.is_overloaded)
}

/** Comienza el arrastre de una tarea desde el panel de detalle. */
function startDrag(task, event) {
  const semana = breakdown.value?.week
  if (!semana) return
  dragging.value = {
    task,
    week: semana,
    hours: Number(task.week_hours ?? task.estimated_hours ?? 0),
    fromUserId: task.assigned_to,
  }
  previsualizando.value = true
  dropResuelto = false
  if (event?.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(task.id))
  }
  document.addEventListener('dragover', onDragOverDocumento)
  document.addEventListener('drop', onDropDocumento)
}

/**
 * Termina el arrastre: se apaga la previsualizacion.
 *
 * Los datos del arrastre se quedan un momento: el evento de soltar puede
 * llegar despues del de fin de arrastre, y sin ellos la tarea se perderia. Si
 * al terminar el puntero estaba sobre una celda y nadie ha soltado todavia,
 * esa celda es el destino.
 */
function endDrag() {
  previsualizando.value = false
  arrastreTerminado = true
  if (!dropResuelto && dragging.value && celdaHover.value) {
    const arrastre = dragging.value
    const sitio = filaDeCelda(celdaHover.value)
    dropResuelto = true
    if (sitio) soltarTarea(arrastre, sitio.row, sitio.week)
  }
  clearTimeout(limpiezaArrastre)
  limpiezaArrastre = setTimeout(limpiarArrastre, 500)
  setTimeout(() => {
    arrastreTerminado = false
  }, 0)
}

/** Olvida el arrastre y deja de escuchar el documento. */
function limpiarArrastre() {
  dragging.value = null
  dropTarget.value = null
  celdaHover.value = null
  clearTimeout(limpiezaArrastre)
  document.removeEventListener('dragover', onDragOverDocumento)
  document.removeEventListener('drop', onDropDocumento)
}

/**
 * La celda que hay bajo el puntero.
 *
 * El panel lateral tapa la matriz, asi que el evento de soltar puede llegar al
 * fondo del panel en vez de a la celda. Cuando pasa eso, la celda se busca por
 * geometria: `elementsFromPoint` devuelve tambien lo que queda por debajo.
 */
function celdaDelDestino(event) {
  const directa = event.target?.closest?.('[data-testid^="cell-"]')
  if (directa) return directa
  if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number') return null
  const elementos = document.elementsFromPoint(event.clientX, event.clientY)
  for (const elemento of elementos) {
    const testid = elemento.getAttribute?.('data-testid')
    if (testid && testid.startsWith('cell-')) return elemento
  }
  return null
}

/** La persona y la semana de una celda de la matriz. */
function filaDeCelda(celda) {
  const valor = (celda.getAttribute('data-testid') ?? '').replace('cell-', '')
  const [userId, ...resto] = valor.split('-')
  const week = resto.join('-')
  const row = rows.value.find((item) => String(item.user_id) === userId)
  return row ? { row, week } : null
}

/** El arrastre se resuelve en el documento, no en la celda. */
function onDragOverDocumento(event) {
  if (!dragging.value) return
  event.preventDefault()
  const celda = celdaDelDestino(event)
  celdaHover.value = celda
  const sitio = celda ? filaDeCelda(celda) : null
  const preview = sitio ? previewOf(sitio.row, sitio.week) : null
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = preview?.permitido ? 'move' : 'none'
  }
  dropTarget.value = sitio ? { user_id: sitio.row.user_id, week: sitio.week } : null
}

/** Suelta la tarea: la persona de la celda se la queda. */
async function onDropDocumento(event) {
  if (!dragging.value) return
  event.preventDefault()
  const arrastre = dragging.value
  const celda = celdaDelDestino(event) ?? celdaHover.value
  dropResuelto = true
  limpiarArrastre()
  if (!celda) return
  const sitio = filaDeCelda(celda)
  if (!sitio) return
  await soltarTarea(arrastre, sitio.row, sitio.week)
}

/** Suelta la tarea en una celda: comprueba el destino antes de mover nada. */
async function soltarTarea(arrastre, row, week) {
  if (arrastre.week !== week) {
    aviso.value = 'La tarea solo se mueve dentro de la semana abierta.'
    return
  }
  if (row.user_id === arrastre.fromUserId) return
  if (!esMiembro(row, arrastre.task.project_id)) {
    const nombre = projectNames.value.get(arrastre.task.project_id) ?? 'del proyecto'
    aviso.value = `${row.name} no es miembro del proyecto ${nombre}.`
    return
  }
  await reasignarTarea(arrastre.task, row.user_id, arrastre.week)
}

/**
 * Suelta la tarea sobre la celda.
 *
 * El evento se detiene aqui: si llega al documento, se suelta dos veces.
 */
async function dropOn(row, week, event) {
  event.stopPropagation()
  const arrastre = dragging.value
  if (!arrastre) return
  dropResuelto = true
  endDrag()
  await soltarTarea(arrastre, row, week)
}

/**
 * Mueve una tarea a la persona de al lado con el teclado.
 *
 * Mayus con las flechas hace lo mismo que arrastrar la tarea a la fila de al
 * lado: el destino tiene que ser miembro del proyecto de la tarea.
 */
async function moverConTeclado(task, delta) {
  const semana = breakdown.value?.week
  if (!semana) return
  const indice = filasVisibles.value.findIndex((row) => row.user_id === task.assigned_to)
  if (indice < 0) return
  const destino = filasVisibles.value[indice + delta]
  if (!destino) {
    aviso.value = 'No hay nadie más en esa dirección.'
    return
  }
  if (!esMiembro(destino, task.project_id)) {
    const nombre = projectNames.value.get(task.project_id) ?? 'del proyecto'
    aviso.value = `${destino.name} no es miembro del proyecto ${nombre}.`
    return
  }
  await reasignarTarea(task, destino.user_id, semana)
}

/** Crea una tarea en el proyecto abierto y recarga la matriz. */
async function createTask(payload) {
  if (!project.value) return
  saving.value = true
  try {
    await tasksApi.create(auth.token, project.value.id, payload)
    notice.value = `Tarea "${payload.title}" creada.`
    aviso.value = null
    await reload()
  } catch (err) {
    aviso.value = err.message
  } finally {
    saving.value = false
  }
}

/** Un clic en la celda abre su detalle, salvo si viene de un arrastre. */
function onCellClick(row, week) {
  if (arrastreTerminado) return
  openCell(row, week)
}

/** Catalogo de competencias, para el filtro. */
async function loadSkills(token) {
  if (skills.value.length) return
  skills.value = await skillsApi.catalog(token)
}

/**
 * Carga la matriz que toca.
 *
 * El proyecto es un filtro (`?project=`), de modo que la matriz es siempre la
 * de la organizacion: con filtro, limitada a ese proyecto.
 *
 * Se vuelve a llamar cuando cambia el filtro. El router reutiliza la misma
 * instancia del componente cuando solo cambia la consulta, de modo que sin
 * esta recarga la matriz seguiria mostrando los datos del proyecto anterior.
 */
/**
 * Quita de la URL un departamento que ya no se puede ver.
 *
 * Una URL guardada puede llevar el departamento de otra persona. Aplicar ese
 * filtro dejaria la matriz vacia sin explicar por que, asi que el filtro se
 * cae y la pantalla vuelve a enseñar lo que si es visible.
 */
async function limpiarDepartamentoInvisible() {
  const id = query.value.department
  if (!id) return
  const visible = store.departments.some((item) => String(item.id) === String(id))
  if (visible) return
  await updateQuery({ department: undefined }, false)
}

async function loadReport() {
  const token = await auth.ensureSession()
  await store.ensureProjects(token)
  await loadSkills(token)
  await normalizarUrl()
  await limpiarDepartamentoInvisible()

  const projects = store.projects
  empty.value = projects.length === 0
  if (empty.value) return

  project.value = projects.find((p) => String(p.id) === String(projectFilter.value)) ?? null
  await reload()
  await openCellFromUrl()
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
  () => [
    query.value.from,
    query.value.to,
    query.value.project,
    query.value.department,
    query.value.skill,
    query.value.level,
  ],
  () => {
    // El proyecto abierto cambia con el filtro, aunque el cambio venga del
    // propio componente: la cabecera y el alta de tareas lo necesitan.
    project.value =
      store.projects.find((p) => String(p.id) === String(projectFilter.value)) ?? null
    if (escribiendo) return
    recargar()
  },
  { flush: 'sync' },
)
</script>

<template>
  <div>
    <header class="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-siemens-900">Capacidad</h1>
        <p v-if="project" class="mt-1 text-sm text-slate-500">{{ project.name }}</p>
        <p v-else class="mt-1 text-sm text-slate-500">
          Reparto de horas de todos los proyectos visibles.
        </p>
      </div>

      <div class="flex items-center gap-1" role="group" aria-label="Modo de la celda">
        <button
          v-for="item in MODES"
          :key="item.value"
          type="button"
          class="rounded px-3 py-1.5 text-sm font-medium"
          :class="mode === item.value ? MODE_ACTIVE : MODE_INACTIVE"
          :aria-pressed="mode === item.value"
          :data-testid="`mode-${item.value}`"
          @click="mode = item.value"
        >
          {{ item.label }}
        </button>
      </div>
    </header>

    <div class="mb-4 flex flex-wrap items-end gap-2">
      <label
        v-if="store.departments.length > 1"
        class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5"
      >
        <span class="text-xs uppercase tracking-wide text-slate-500">Departamento</span>
        <select
          v-model="departmentFilter"
          data-testid="capacity-filter-department"
          class="border-0 bg-transparent text-sm font-medium text-slate-700 focus:ring-0"
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

      <label
        v-if="store.projects.length"
        class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5"
      >
        <span class="text-xs uppercase tracking-wide text-slate-500">Proyecto</span>
        <select
          v-model="projectFilter"
          data-testid="capacity-filter-project"
          class="border-0 bg-transparent text-sm font-medium text-slate-700 focus:ring-0"
        >
          <option value="">Todos los proyectos</option>
          <option
            v-for="item in store.projects"
            :key="item.id"
            :value="String(item.id)"
          >
            {{ item.name }}
          </option>
        </select>
      </label>

      <label
        class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5"
      >
        <span class="text-xs uppercase tracking-wide text-slate-500">Competencia</span>
        <select
          v-model="skillFilter"
          data-testid="capacity-filter-skill"
          class="border-0 bg-transparent text-sm font-medium text-slate-700 focus:ring-0"
        >
          <option value="">Cualquiera</option>
          <option v-for="item in skills" :key="item.id" :value="String(item.id)">
            {{ item.name }}
          </option>
        </select>
      </label>

      <label
        v-if="skillFilter"
        class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5"
      >
        <span class="text-xs uppercase tracking-wide text-slate-500">Nivel mínimo</span>
        <select
          v-model="levelFilter"
          data-testid="capacity-filter-level"
          class="border-0 bg-transparent text-sm font-medium text-slate-700 focus:ring-0"
        >
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </select>
      </label>

      <div ref="panelVisibilidadRoot" class="relative">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700"
          :aria-expanded="panelVisibilidad"
          data-testid="toggle-visibility"
          @click="panelVisibilidad = !panelVisibilidad"
        >
          <span class="h-4 w-4 text-slate-500"><AppIcon name="users" /></span>
          Mostrar/ocultar
          <span
            v-if="ocultosCount"
            class="rounded-full bg-siemens-900 px-1.5 text-[10px] font-semibold text-white"
            data-testid="hidden-count"
          >
            {{ ocultosCount }} {{ ocultosCount === 1 ? 'oculto' : 'ocultos' }}
          </span>
        </button>

        <div
          v-if="panelVisibilidad"
          class="absolute left-0 z-30 mt-1 w-72 rounded-md bg-white p-3 shadow-lg ring-1 ring-slate-200"
          data-testid="visibility-panel"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Visibilidad
            </span>
            <button
              v-if="ocultosCount"
              type="button"
              class="text-xs font-medium text-siemens-700 underline"
              data-testid="show-all"
              @click="mostrarTodos"
            >
              Mostrar todos
            </button>
          </div>

          <div v-for="grupo in gruposVisibilidad" :key="grupo.id" class="mt-2">
            <label class="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                class="h-4 w-4"
                :checked="departamentosOcultos.includes(grupo.id)"
                :data-testid="`hide-department-${grupo.id}`"
                @change="alternarDepartamento(grupo.id)"
              />
              {{ grupo.name }}
            </label>
            <label
              v-for="fila in grupo.rows"
              :key="fila.user_id"
              class="ml-5 mt-1 flex items-center gap-2 text-sm text-slate-600"
            >
              <input
                type="checkbox"
                class="h-4 w-4"
                :checked="personaOculta(fila)"
                :data-testid="`hide-person-${fila.user_id}`"
                @change="alternarPersona(fila.user_id)"
              />
              {{ fila.name }}
            </label>
          </div>
        </div>
      </div>

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

      <AlertBanner
        v-if="aviso"
        variant="warning"
        class="mb-3"
        data-testid="capacity-warning"
        dismissible
        @dismiss="aviso = null"
      >
        {{ aviso }}
      </AlertBanner>

      <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span
          class="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 font-medium text-red-800"
          data-testid="summary-overload"
        >
          <span class="h-3.5 w-3.5"><AppIcon name="warning" /></span>
          {{ summary.sobrecargadas }}
          {{ summary.sobrecargadas === 1 ? 'celda sobrecargada' : 'celdas sobrecargadas' }}
        </span>
        <span
          class="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 font-medium text-blue-900"
          data-testid="summary-free"
        >
          {{ summary.huecos }}
          {{ summary.huecos === 1 ? 'hueco' : 'huecos' }} de 20 h o más libres
        </span>
        <span
          class="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700"
          data-testid="summary-average"
        >
          Uso medio del equipo: {{ summary.medio ?? '—' }} %
        </span>
      </div>

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
                class="sticky left-0 z-10 border border-slate-200 bg-white text-left font-medium"
              >
                <div class="flex items-stretch gap-2 px-3 py-2">
                  <span
                    class="w-1 shrink-0 rounded-full"
                    :class="departmentColorClass(entrada.fila.department_id)"
                    :data-testid="`department-stripe-${entrada.fila.user_id}`"
                  ></span>
                  <span class="min-w-0 flex-1">
                    {{ entrada.fila.name }}
                    <span class="block text-xs font-normal text-slate-400">
                      {{ entrada.fila.weekly_base_hours }} h/semana
                    </span>
                    <span
                      v-if="entrada.fila.department_name"
                      class="block text-[11px] font-normal text-slate-500"
                      :data-testid="`department-name-${entrada.fila.user_id}`"
                    >
                      {{ entrada.fila.department_name }}
                    </span>
                  </span>
                </div>
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
                  :aria-pressed="breakdown?.user_id === entrada.fila.user_id && breakdown?.week === celda.week"
                  :data-testid="`cell-${entrada.fila.user_id}-${celda.week}`"
                  :data-preview="celda.preview ? 'si' : 'no'"
                  @click="onCellClick(entrada.fila, celda.week)"
                  @drop.prevent="dropOn(entrada.fila, celda.week, $event)"
                >
                  <template v-if="celda.preview">
                    <span class="text-sm font-semibold tabular-nums">
                      {{ celda.preview.principal }}
                    </span>
                    <span class="text-[10px] tabular-nums opacity-80">
                      {{ celda.preview.sub }}
                    </span>
                  </template>

                  <template v-else-if="mode === MODE.HOURS">
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
                  </template>

                  <template v-else-if="mode === MODE.PERCENT">
                    <span class="text-sm font-semibold tabular-nums">
                      {{ celda.porcentaje || '·' }}
                    </span>
                    <span class="text-[10px] tabular-nums opacity-80">
                      {{ celda.horasCapacidad }}
                    </span>
                  </template>

                  <template v-else>
                    <span v-if="!celda.proyectos.length" class="text-sm font-semibold">·</span>
                    <span
                      v-for="proyecto in celda.proyectos"
                      :key="proyecto.id"
                      class="block max-w-full truncate rounded bg-slate-900/10 px-1 text-[10px] font-medium"
                      :title="`${proyecto.nombre}: ${proyecto.horas} h`"
                      data-testid="cell-project"
                    >
                      {{ proyecto.nombre }} · {{ proyecto.horas }} h
                    </span>
                  </template>
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
    <SidePanel
      :open="Boolean(breakdown)"
      :title="breakdownTitle"
      :modal="false"
      @close="closeCell"
    >
      <template #subtitle>
        <p v-if="breakdown" class="mt-1 text-sm text-slate-500">
          Semana {{ weekTitle(breakdown.week) }} · {{ weekRangeLabel(breakdown.week) }}
        </p>
      </template>

      <CellBreakdown
        :cell="breakdown"
        :tasks="breakdownTasks"
        :members="people"
        :projects="store.projects"
        :holidays="breakdownHolidays"
        :saving="saving"
        :can-create="canCreate"
        :gantt-link="ganttLink"
        @save="saveTask"
        @delete="deleteTask"
        @reassign="reassignTask"
        @create="createTask"
        @move="moverConTeclado"
        @dragstart="startDrag"
        @dragend="endDrag"
      />
    </SidePanel>
  </div>
</template>
