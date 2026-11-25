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
 * ya esta cargado, no lo que la persona puede ver. El de departamento vive en
 * la URL (`?department=`) y el de proyecto, en la ruta del proyecto o en el
 * filtro de la URL (`?project=`), de modo que la vista abierta se puede
 * compartir tal cual.
 *
 * Al pulsar una tarea se abre su detalle en el mismo panel que usa el Tablero.
 * Quien no puede escribir en ese proyecto lo ve en solo lectura.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { calendarApi, meApi, overviewApi, peopleApi, tasksApi } from '../api/client'
import { useArrastre } from '../composables/useArrastre'
import { useProyectoFiltro } from '../composables/useProyectoFiltro'
import { useTaskReload } from '../composables/useTaskReload'
import { useVisibilidad } from '../composables/useVisibilidad'
import AlertBanner from '../components/common/AlertBanner.vue'
import AsyncState from '../components/common/AsyncState.vue'
import FilterField from '../components/common/FilterField.vue'
import SegmentedControl from '../components/common/SegmentedControl.vue'
import VisibilityPanel from '../components/common/VisibilityPanel.vue'
import WeekLanes from '../components/common/WeekLanes.vue'
import DayDetail from '../components/DayDetail.vue'
import WeekGrid from '../components/WeekGrid.vue'
import PageHeader from '../components/common/PageHeader.vue'
import ModalDialog from '../components/ModalDialog.vue'
import TaskDetailDialog from '../components/TaskDetailDialog.vue'
import TaskForm from '../components/TaskForm.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { useTaskStatusesStore } from '../stores/taskStatuses'
import { dateChangePayload, diffDays } from '../utils/ganttScale'
import { moveRange } from '../utils/ganttLayout'
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
  weekDays,
  weekRangeLabel,
  weekWorkdays,
  weekWithTasksNear,
} from '../utils/weeks'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const store = useProjectsStore()
const statusStore = useTaskStatusesStore()

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
/** Proyecto abierto en el alta del dia, con la fecha del dia. */
const altaDelDia = ref(null)
const saving = ref(false)
/** Aviso que no tapa el calendario: un rechazo del servidor al guardar. */
const aviso = ref(null)
/** Contenedor vertical de la tabla del mes, para desplazarlo a la semana con trabajo. */
const mesScroll = ref(null)

const query = computed(() => route.query ?? {})

/**
 * Escribe el estado de la vista en la URL.
 *
 * Los valores vacios se quitan: una URL con lo puesto es la que se copia para
 * compartir la vista. Lo usan los filtros y el estado de la vista (que vista
 * se ve y en que fecha).
 */
async function updateQuery(patch) {
  const next = { ...query.value }
  for (const [key, value] of Object.entries(patch)) {
    if (value === '' || value === null || value === undefined) delete next[key]
    else next[key] = String(value)
  }
  await router.replace({ query: next })
}

/** Proyecto que fija la ruta, cuando la vista esta en el espacio del proyecto. */
const proyectoDeLaRuta = useProyectoFiltro()

/**
 * Proyecto que filtra el calendario.
 *
 * En el espacio del proyecto lo da la ruta y no se toca desde aqui; en el
 * global, lo escribe el desplegable.
 */
const projectFilter = computed({
  get: () => proyectoDeLaRuta.value,
  set: (value) => updateQuery({ project: value }),
})

/** Departamento que filtra el calendario: el que gestiona cada proyecto. */
const departmentFilter = computed({
  get: () => query.value.department ?? '',
  set: (value) => updateQuery({ department: value }),
})

/** Vistas del calendario, para el selector comun. */
const VISTAS = [
  { value: 'month', label: 'Mes' },
  { value: 'week', label: 'Semana' },
  { value: 'day', label: 'Día' },
]

/**
 * Estado del calendario segun la URL.
 *
 * La vista y la fecha en pantalla viajan en la URL, como en el resto de vistas:
 * `?view=` dice si se ve el mes, la semana o el dia; `?month=` es el mes
 * abierto (YYYY-MM) y `?day=` el dia abierto (YYYY-MM-DD), que en la vista de
 * semana es el lunes de la semana en pantalla. Los valores por defecto no se
 * escriben: el mes en curso, el dia de hoy y la vista de mes son lo que se ve
 * sin nada en la URL.
 */
const MES_EN_URL = /^\d{4}-\d{2}$/
const DIA_EN_URL = /^\d{4}-\d{2}-\d{2}$/

/** Semana ISO a la que pertenece un dia. */
function semanaDe(dia) {
  return isoWeekKey(new Date(`${dia}T00:00:00Z`))
}

/**
 * Aplica el estado de la URL a la vista.
 *
 * La URL manda: recargar o compartir el enlace reproduce la misma vista. Un
 * parametro que no vale se ignora, y lo que falta se queda en su defecto.
 */
function aplicarEstadoDeLaUrl() {
  const q = query.value
  const vista = VISTAS.find((item) => item.value === q.view)?.value ?? 'month'
  const mes =
    typeof q.month === 'string' && MES_EN_URL.test(q.month) ? q.month : currentMonthKey()
  const dia = typeof q.day === 'string' && DIA_EN_URL.test(q.day) ? q.day : localDateKey()
  view.value = vista
  month.value = mes
  day.value = dia
  // La semana se ancla en el dia: es la semana que lo contiene.
  if (vista === 'week') week.value = semanaDe(dia)
}

/**
 * Escribe la vista y la fecha en pantalla en la URL.
 *
 * Es lo que hace que el enlace se pueda compartir: al abrirlo, el calendario
 * se abre como estaba.
 */
async function escribirEstado() {
  const patch = { view: undefined, month: undefined, day: undefined }
  if (view.value !== 'month') patch.view = view.value
  if (view.value === 'month') {
    if (month.value !== currentMonthKey()) patch.month = month.value
  } else if (view.value === 'day') {
    if (day.value !== localDateKey()) patch.day = day.value
  } else {
    // En la vista de semana, el dia es el lunes de la semana en pantalla.
    const lunes = weekDays(week.value)[0].date
    if (lunes !== weekDays(currentWeekKey())[0].date) patch.day = lunes
  }
  await updateQuery(patch)
}

/** Opciones de los filtros: la de "todos" delante y las visibles detras. */
const opcionesDepartamento = computed(() => [
  { value: '', label: 'Todos los departamentos' },
  ...store.departments.map((item) => ({ value: String(item.id), label: item.name })),
])
const opcionesProyecto = computed(() => [
  { value: '', label: 'Todos los proyectos' },
  ...store.projects.map((item) => ({ value: String(item.id), label: item.name })),
])

/**
 * Lo que se lee encima del calendario.
 *
 * El alta de tarea de un dia necesita un proyecto fijo: la ruta o el filtro
 * de la URL. Sin el, el detalle de dia no crea nada y lo dice aqui.
 */
const subtitle = computed(() => {
  if (!projectFilter.value) {
    return 'Las tareas de los proyectos visibles, día a día. Sin proyecto en contexto no se pueden crear tareas en el día.'
  }
  return 'Las tareas del proyecto que filtra, día a día.'
})

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
const hayFiltros = computed(() => Boolean(projectFilter.value || departmentFilter.value))

/** Tareas sin fechas: en plural correcto, con una sola no se lee "1 tareas". */
const avisoSinFechas = computed(() => {
  const n = undatedTaskIds.value.length
  return n === 1
    ? '1 tarea sin fechas no aparece en el calendario.'
    : `${n} tareas sin fechas no aparecen en el calendario.`
})

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

/** Proyectos en los que quien entra puede escribir, para las barras y el alto. */
const editableProjects = computed(() => scope.value?.editable_project_ids ?? [])

/**
 * Si quien entra puede escribir en el proyecto del dia.
 *
 * Es el mismo criterio que las barras: el proyecto del filtro entre los
 * editables. Sin proyecto en contexto no se crea tarea en parte ninguna y
 * sin permiso no hay edicion inline: la vista de dia se ve en solo lectura.
 */
const dayCanEdit = computed(() => {
  const editable = scope.value?.editable_project_ids
  if (!editable || !projectFilter.value) return false
  return editable.includes(Number(projectFilter.value))
})

/**
 * Semana en pantalla sin tareas, para el aviso de la vista semanal.
 *
 * Se compara contra los siete dias de la semana, no solo los laborables: una
 * tarea que solo ocupa el fin de semana tambien cuenta.
 */
const semanaSinTareas = computed(() => {
  const dias = weekDays(week.value)
  const inicio = dias[0].date
  const fin = dias[6].date
  return visibleTasks.value.every((task) => task.start > fin || task.end < inicio)
})

/**
 * Semana mas cercana a la de la vista que tenga tareas, dentro del rango visible.
 *
 * La siguiente que tenga tareas, o la anterior si no hay ninguna por delante.
 * Sin ninguna, `null`: el boton de salto no se muestra.
 */
const semanaConTrabajo = computed(() => weekWithTasksNear(week.value, visibleTasks.value, null, null))

/** Salta a la semana visible mas cercana con tareas. */
async function irASemanaConTrabajo() {
  if (!semanaConTrabajo.value) return
  week.value = semanaConTrabajo.value
  await escribirEstado()
}

/**
 * Arrastrar una barra a otro dia: la tarea se mueve a ese dia conservando su
 * duracion, y se guarda con el mismo PATCH que el Gantt al mover una barra.
 *
 * La soltura se resuelve contra la tabla en pantalla: con `table-fixed` las
 * siete columnas de dia tienen el mismo ancho, de modo que el dia destino es
 * el que cae bajo el puntero, medido desde el borde de la columna de nombres.
 * La semana destino la da la altura del puntero: cada semana del mes es un
 * <tbody> con su `data-semana`, y en la vista semanal el unico <tbody> es la
 * semana de la vista.
 */
function diaBajoPuntero(x, y) {
  const tabla = document.querySelector(
    '[data-testid="calendar-month-table"], [data-testid="week-grid"] table',
  )
  if (!tabla) return null
  const caja = tabla.getBoundingClientRect()
  if (x < caja.left || x > caja.right || y < caja.top || y > caja.bottom) return null
  const nombre = tabla.querySelector('th')
  const anchoNombre = nombre ? nombre.getBoundingClientRect().right - caja.left : 0
  const anchoDia = (caja.right - caja.left - anchoNombre) / 7
  const columnas = Math.min(6, Math.max(0, Math.floor((x - caja.left - anchoNombre) / anchoDia)))
  // La semana es la del <tbody> que contiene la altura del puntero: la fila de
  // cabecera de dias pertenece a su <tbody>, asi que soltar sobre ella cae en
  // esa semana.
  const cuerpos = [...tabla.querySelectorAll('tbody')]
  const cuerpo = cuerpos.find((tbody) => {
    const recta = tbody.getBoundingClientRect()
    return y >= recta.top && y <= recta.bottom
  })
  if (!cuerpo) return null
  return { columnas, semana: Number(cuerpo.dataset.semana) }
}

/** Fecha concreta al que cae el puntero: el dia sobre la semana soltada. */
function diaDestino(pendiente, event) {
  const destino = diaBajoPuntero(event.clientX, event.clientY)
  if (!destino) return null
  const semana =
    view.value === 'week'
      ? weekDays(week.value)
      : semanasDelMes.value[destino.semana] ?? null
  if (!semana) return null
  return semana[destino.columnas]?.date ?? null
}

/** Dia de la semana en pantalla que queda bajo el puntero, para sombrearlo. */
const hoverDay = ref(null)

function fantasmaDe(pendiente, event) {
  return { x: event.clientX, y: event.clientY, tarea: pendiente.datos.tarea }
}

function alMover(pendiente, event) {
  hoverDay.value = diaDestino(pendiente, event)
}

/**
 * Soltar la barra: la tarea pasa a los nuevos dias y se guarda con el mismo
 * PATCH que el Gantt al mover una barra. Si el puntero no cae sobre una
 * columna de dia, `dentroDe` deja que el esqueleto tumbe el gesto.
 */
async function alSoltar(pendiente, event) {
  hoverDay.value = null
  const destino = diaDestino(pendiente, event)
  const tarea = pendiente.datos.tarea
  if (!destino || destino === tarea.start) return
  const nuevo = moveRange(tarea.start, tarea.end, diffDays(tarea.start, destino))
  try {
    await tasksApi.update(auth.token, tarea.id, dateChangePayload(nuevo.start, nuevo.end))
  } catch (err) {
    aviso.value = `No se ha podido mover la tarea: ${err.message}`
  }
  await load()
}

function alAnular() {
  hoverDay.value = null
}

const drag = useArrastre({
  fantasmaDe,
  alMover,
  alConfirmar: alSoltar,
  dentroDe: (pendiente, event) => diaBajoPuntero(event.clientX, event.clientY) !== null,
  alAnular,
})
const fantasma = drag.fantasma

/** Agarrar una barra: el destino de la soltura lo resuelve la vista. */
function onBarDragStart({ tarea, event }) {
  drag.empezarArrastre({ contexto: { tarea }, event })
}

/**
 * Semanas del mes, con sus siete dias.
 *
 * El mes se ve como una sola tabla con un grupo de filas por semana. El fin de
 * semana sale atenuado y sin barras: el motor de capacidad solo reparte horas
 * entre dias laborables.
 */
const semanasDelMes = computed(() => weeks.value)

/**
 * Desplaza la tabla del mes a la primera semana que tenga tareas.
 *
 * El mes abre por la primera semana del mes, asi que con trabajo en semanas
 * posteriores (o sin trabajo en la semana en curso) el calendario se abriria
 * en un sitio vacio. Sin ninguna tarea en el mes la tabla se queda arriba.
 */
function desplazarMesASemanaConTrabajo() {
  const contenedor = mesScroll.value
  if (!contenedor) return
  const indice = semanasDelMes.value.findIndex((dias) =>
    visibleTasks.value.some((task) => task.start <= dias[6].date && dias[0].date <= task.end),
  )
  if (indice < 0) return
  const cuerpo = contenedor.querySelectorAll('tbody')[indice]
  if (!cuerpo) return
  contenedor.scrollTop = cuerpo.offsetTop
}

async function load() {
  try {
    const token = await auth.ensureSession()
    const params = {}
    if (projectFilter.value) params.project_id = projectFilter.value
    if (departmentFilter.value) params.department_id = departmentFilter.value
    const [feed, days, ambito, directorio] = await Promise.all([
      overviewApi.gantt(token, params),
      calendarApi.list(token),
      // El ambito va aparte: si no se puede leer, la tarea se abre en solo
      // lectura, pero se abre.
      meApi.get(token).catch(() => null),
      peopleApi.list(token).catch(() => []),
      // Los estados de los proyectos alimentan el detalle de dia y los
      // carriles de la semana; si no se pueden leer, se pintan los por
      // defecto.
      statusStore.loadAll(token).catch(() => null),
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
    // Los miembros del proyecto filtran el desplegable del responsable del
    // detalle de dia y el alta: sin proyecto no hay que pedirlos.
    if (projectFilter.value) await store.ensureMembers(token, projectFilter.value).catch(() => [])
    error.value = null
    // El mes abre en la primera semana con trabajo, no en la primera semana
    // del mes: la semilla de la demo ancla el trabajo en semanas posteriores.
    if (view.value === 'month') {
      await nextTick()
      desplazarMesASemanaConTrabajo()
    }
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function step(delta) {
  if (view.value === 'day') {
    day.value = shiftDay(day.value, delta)
    await escribirEstado()
    return
  }
  if (view.value === 'week') {
    week.value = shiftWeek(week.value, delta)
    await escribirEstado()
    return
  }
  month.value = shiftMonth(month.value, delta)
  await nextTick()
  desplazarMesASemanaConTrabajo()
  await escribirEstado()
}

/**
 * Cambia entre las vistas de mes, semana y dia.
 *
 * Al cambiar de vista cada una se coloca donde le toca: si el mes que se estaba
 * viendo es el mes en curso, la semana es la de hoy; si no, la del primer dia
 * de ese mes. Al volver al mes, el mes es el de la semana en pantalla. Desde
 * el dia se sale a su semana y a su mes, que es donde estaba el usuario.
 */
async function setView(next) {
  if (next === view.value) return
  if (next === 'day') {
    day.value = localDateKey()
  } else if (next === 'week') {
    if (view.value === 'day') {
      week.value = semanaDe(day.value)
    } else {
      const [year, monthNumber] = month.value.split('-').map(Number)
      const now = new Date()
      const sameMonth = now.getFullYear() === year && now.getMonth() === monthNumber - 1
      const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
      const first = new Date(Date.UTC(year, monthNumber - 1, 1))
      week.value = isoWeekKey(sameMonth ? today : first)
    }
  } else if (view.value === 'day') {
    month.value = day.value.slice(0, 7)
  } else {
    month.value = weekWorkdays(week.value)[0].date.slice(0, 7)
  }
  view.value = next
  await escribirEstado()
}

/** Abre el detalle de un dia. */
async function openDay(date) {
  day.value = date
  view.value = 'day'
  await escribirEstado()
}

/**
 * Abre el detalle de una tarea.
 *
 * El clic que sigue a un arrastre no abre nada: la barra ya se movio.
 */
function openTask(taskId) {
  if (drag.movido()) return
  selectedTaskId.value = taskId
}

/**
 * Abre el alta de tarea del dia con la lista de miembros del proyecto.
 *
 * El proyecto es el que fija la vista: la ruta o el filtro de la URL. Sin el
 * no se abre, y sin permiso de escritura tampoco.
 */
async function openCreacion(date) {
  if (!dayCanEdit.value) return
  error.value = null
  const token = await auth.ensureSession()
  await store.ensureMembers(token, projectFilter.value)
  altaDelDia.value = { proyecto: projectFilter.value, fecha: date }
}

/** Guarda la tarea del alta del dia y recarga el calendario. */
async function guardarAlta(payload) {
  saving.value = true
  error.value = null
  try {
    await tasksApi.create(auth.token, altaDelDia.value.proyecto, payload)
    altaDelDia.value = null
    store.notifyTasksChanged()
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

/**
 * Guarda un cambio inline del dia: horas, responsable o estado.
 *
 * El PATCH es parcial: solo viajan los campos que cambian, y el `null`
 * explicito de `assigned_to` es la desasignacion, no la ausencia del campo.
 */
async function cambiarTarea({ tarea, cambios }) {
  aviso.value = null
  saving.value = true
  try {
    await tasksApi.update(auth.token, tarea.id, cambios)
    store.notifyTasksChanged()
    await load()
  } catch (err) {
    aviso.value = `No se ha podido guardar la tarea: ${err.message}`
  } finally {
    saving.value = false
  }
}

/** Cierra el panel de detalle y vuelve a pintar el calendario. */
function onTaskDeleted() {
  selectedTaskId.value = null
  load()
}

async function goToday() {
  month.value = currentMonthKey()
  week.value = currentWeekKey()
  day.value = localDateKey()
  if (view.value === 'month') {
    await nextTick()
    desplazarMesASemanaConTrabajo()
  }
  await escribirEstado()
}

/** Vuelve a pedir los datos y enseña el esqueleto mientras llegan. */
async function reintentar() {
  loading.value = true
  await load()
}

// La URL decide con que vista se abre el calendario, antes de pintar.
aplicarEstadoDeLaUrl()
onMounted(load)
useTaskReload(load)
onBeforeUnmount(() => drag.anular())

// La URL manda sobre la vista: al cambiarla (por enlace, por historial o por
// la propia vista) se aplica lo que dice.
watch(
  () => route.query,
  () => aplicarEstadoDeLaUrl(),
)

// El proyecto cambia con la ruta del proyecto o con el filtro de la URL.
watch(
  () => [projectFilter.value, departmentFilter.value],
  async (nuevo, anterior) => {
    // Cambiar de vista o de fecha no pide datos: solo los filtros lo hacen.
    if (anterior && nuevo[0] === anterior[0] && nuevo[1] === anterior[1]) return
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
          <SegmentedControl
            :model-value="view"
            :options="VISTAS"
            label="Vista del calendario"
            testid-prefix="calendar-view"
            @update:model-value="setView"
          />

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

    <AlertBanner
      v-if="aviso"
      variant="warning"
      class="mb-2"
      data-testid="calendar-warning"
      dismissible
      @dismiss="aviso = null"
    >
      {{ aviso }}
    </AlertBanner>

    <AsyncState
      :loading="loading"
      :error="error"
      error-test-id="calendar-error"
      loading-label="Cargando el calendario"
      @retry="reintentar"
    >
      <div class="mb-4 flex flex-wrap items-end gap-3">
        <FilterField
          label="Departamento"
          :options="opcionesDepartamento"
          :model-value="departmentFilter"
          testid="filter-department"
          @update:model-value="departmentFilter = $event"
        />

        <!-- En el espacio del proyecto el proyecto ya viene de la ruta. -->
        <FilterField
          v-if="!route.params.id"
          label="Proyecto"
          :options="opcionesProyecto"
          :model-value="projectFilter"
          testid="filter-project"
          @update:model-value="projectFilter = $event"
        />

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
        {{ avisoSinFechas }}
      </p>

      <div
        v-if="view === 'month'"
        class="rounded border border-slate-200 bg-white"
        data-testid="calendar-month-view"
      >
        <!--
          Contenedor vertical de la tabla: permite desplazar la rejilla hasta
          la primera semana con trabajo. El desbordamiento horizontal queda en
          el marco exterior, como antes.
        -->
        <div
          ref="mesScroll"
          class="max-h-[80vh] overflow-y-auto overflow-x-auto"
          data-testid="calendar-month-scroll"
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
              :editable-project-ids="editableProjects"
              :hover-day="hoverDay"
              :semana-indice="indice"
              @open-day="openDay"
              @open-task="openTask"
              @drag-start="onBarDragStart"
            />
          </template>
        </table>
        </div>
      </div>

      <!--
        La semana en pantalla no tiene tareas: se dice y se ofrece saltar a la
        semana visible mas cercana con trabajo, si la hay.
      -->
      <AlertBanner
        v-if="view === 'week' && semanaSinTareas"
        variant="info"
        class="mb-3"
        data-testid="calendar-week-empty"
      >
        No hay tareas en esta semana
        <button
          v-if="semanaConTrabajo"
          type="button"
          class="rounded border border-slate-300 bg-white px-2 py-0.5 text-sm font-normal"
          data-testid="calendar-goto-busy-week"
          @click="irASemanaConTrabajo"
        >
          Ir a la semana con trabajo
        </button>
      </AlertBanner>

      <WeekGrid
        v-else-if="view === 'week'"
        :week-key="week"
        :people="personasVisibles"
        :tasks="visibleTasks"
        :non-working-days="nonWorkingDays"
        :editable-project-ids="editableProjects"
        :hover-day="hoverDay"
        @open-day="openDay"
        @open-task="openTask"
        @drag-start="onBarDragStart"
      />

      <DayDetail
        v-else
        :date="day"
        :people="personasVisibles"
        :tasks="visibleTasks"
        :non-working-days="nonWorkingDays"
        :members="store.members"
        :can-edit="dayCanEdit"
        @open-task="openTask"
        @cambiar="cambiarTarea"
        @crear="openCreacion"
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
    <TaskDetailDialog
      :open="selectedTaskId !== null"
      :task-id="selectedTaskId"
      :can-edit="canEditSelected"
      @close="selectedTaskId = null"
      @saved="load"
      @deleted="onTaskDeleted"
    />

    <!--
      Alta de tarea del dia: abre desde el detalle de dia con las fechas del
      dia precargadas. El proyecto es el que fija la vista, no se elige aqui.
    -->
    <ModalDialog
      :open="altaDelDia !== null"
      title="Nueva tarea"
      size="md"
      @close="altaDelDia = null"
    >
      <TaskForm
        v-if="altaDelDia"
        :task="{ start_date: altaDelDia.fecha, end_date: altaDelDia.fecha }"
        :members="store.members"
        form-id="calendar-new-task"
        @save="guardarAlta"
      />
      <template #footer="{ submit }">
        <button
          type="button"
          class="rounded border border-slate-300 px-3 py-2 text-sm"
          @click="altaDelDia = null"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="submit"
          :disabled="saving"
          class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {{ saving ? 'Guardando...' : 'Guardar' }}
        </button>
      </template>
    </ModalDialog>

    <!--
      Copia de la barra que se arrastra: sigue al cursor mientras dura el
      gesto y deja ver a que dia va a caer. No intercepta el raton, para que
      la columna de destino se siga calculando por debajo.
    -->
    <div
      v-if="fantasma"
      data-testid="calendar-drag-ghost"
      class="pointer-events-none fixed z-50 max-w-64 select-none rounded border border-siemens-500 bg-white p-2 shadow-lg"
      :style="{
        left: `${fantasma.x}px`,
        top: `${fantasma.y}px`,
      }"
    >
      <p class="truncate text-sm font-medium text-slate-900">{{ fantasma.tarea.title }}</p>
      <p class="mt-1 text-xs text-slate-500">
        {{ fantasma.tarea.start }} → {{ fantasma.tarea.end }}
      </p>
    </div>
  </div>
</template>
