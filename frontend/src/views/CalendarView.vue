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
import { useRoute } from 'vue-router'

import { calendarApi, meApi, overviewApi, peopleApi, tasksApi } from '../api/client'
import { useCalendarioDrag } from '../composables/useCalendarioDrag'
import { useCalendarioEstado } from '../composables/useCalendarioEstado'
import { useProyectoFiltro } from '../composables/useProyectoFiltro'
import { useTaskReload } from '../composables/useTaskReload'
import { useVisibilidad } from '../composables/useVisibilidad'
import AppIcon from '../components/AppIcon.vue'
import AlertBanner from '../components/common/AlertBanner.vue'
import AsyncState from '../components/common/AsyncState.vue'
import ContextMenu from '../components/common/ContextMenu.vue'
import FilterField from '../components/common/FilterField.vue'
import SegmentedControl from '../components/common/SegmentedControl.vue'
import VisibilityPanel from '../components/common/VisibilityPanel.vue'
import CalendarGrid from '../components/calendar/CalendarGrid.vue'
import DayDetail from '../components/DayDetail.vue'
import PageHeader from '../components/common/PageHeader.vue'
import ModalDialog from '../components/ModalDialog.vue'
import TaskDetailDialog from '../components/TaskDetailDialog.vue'
import TaskForm from '../components/TaskForm.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { useTaskStatusesStore } from '../stores/taskStatuses'
import { useToastStore } from '../stores/toast'
import { desplazarLaborable, moverRangoLaborable } from '../utils/calendarGeometry'
import { dateChangePayload } from '../utils/ganttScale'
import { longDateLabel, monthGrid, monthLabel } from '../utils/month'
import { sortByDepartment } from '../utils/people'
import { weekDays, weekRangeLabel, weekWithTasksNear } from '../utils/weeks'

const auth = useAuthStore()
const route = useRoute()
const store = useProjectsStore()
const statusStore = useTaskStatusesStore()
const toast = useToastStore()

/**
 * Vista y fecha en pantalla, con su ida y vuelta con la URL.
 *
 * El composable es el unico sitio que sabe de la URL del estado: la URL manda
 * al abrir y al navegar, y cada cambio de vista o fecha se escribe de vuelta.
 * El scroll del mes, que es del DOM, queda en la vista.
 */
const {
  view,
  month,
  week,
  day,
  query,
  VISTAS,
  updateQuery,
  aplicarEstadoDeLaUrl,
  escribirEstado,
  step,
  setView,
  openDay,
  goToday,
} = useCalendarioEstado()

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
/** Menu contextual abierto: {items, x, y, abridor, label}. */
const menuContexto = ref(null)
const saving = ref(false)
/** Aviso que no tapa el calendario: un rechazo del servidor al guardar. */
const aviso = ref(null)
/** Contenedor vertical de la tabla del mes, para desplazarlo a la semana con trabajo. */
const mesScroll = ref(null)
/**
 * Calendario en modo ampliado: ocupa la ventana entera, por encima del
 * armazon. La vista se sale del armazon con `fixed inset-0` (no hay
 * `Teleport` ni ancestro con `transform`), de modo que los dialogos que se
 * abren desde aqui siguen viendo la ventana y quedan por encima.
 */
const ampliado = ref(false)

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
 * Ref a la rejilla del calendario en pantalla: mes o semana. La geometria
 * del arrastre se mide contra esta tabla al empezar el gesto (`medir`), no
 * contra el DOM por selector.
 */
const gridRef = ref(null)

/**
 * Guardar las fechas de una tarea con el mismo PATCH que el Gantt al mover
 * una barra: `dateChangePayload` y recarga. El exito confirma con un toast,
 * como el Gantt; el fallo se queda en el banner en linea, sin cerrar la
 * sesion: un fallo, un aviso. Sin cambio de fechas no hay PATCH. Lo usan el
 * arrastre, el teclado y el menu contextual; es la unica puerta al guardado
 * de fechas.
 */
async function guardarFechas(taskId, start, end) {
  const tarea = tasks.value.find((task) => task.id === taskId)
  if (!tarea || (start === tarea.start && end === tarea.end)) return
  try {
    await tasksApi.update(auth.token, taskId, dateChangePayload(start, end))
    toast.success(`Fechas actualizadas: del ${start} al ${end}.`, { key: 'calendario-fechas' })
  } catch (err) {
    aviso.value = `No se ha podido mover la tarea: ${err.message}`
  }
  await load()
}

/** Soltar la barra: la tarea pasa a los nuevos dias, con el mismo guardado. */
async function alConfirmar({ taskId, start, end }) {
  await guardarFechas(taskId, start, end)
}

/**
 * Mover la tarea `delta` dias laborables (positivo adelante, negativo atras),
 * conservando la duracion en dias laborables. Un solo calculo para el teclado
 * y el menu contextual: la flecha y "Mover un dia antes/despues" son lo mismo.
 */
function moverDiasLaborables(tarea, delta) {
  return moverRangoLaborable(tarea.start, tarea.end, desplazarLaborable(tarea.start, delta))
}

/**
 * Mover el fin de la tarea `delta` dias laborables: "Acortar/Alargar un dia".
 *
 * El fin nunca puede quedar antes del inicio: acortar hasta cruzar el inicio
 * deja la tarea de un solo dia en el inicio.
 */
function moverFinDiasLaborables(tarea, delta) {
  const fin = desplazarLaborable(tarea.end, delta)
  return { start: tarea.start, end: fin < tarea.start ? tarea.start : fin }
}

/**
 * Teclado de la barra enfocada: el grid sube la tecla y la vista decide, con
 * la misma semantica que el Gantt pero en dias laborables, que es la unidad
 * del eje del calendario.
 *
 * Izquierda/derecha mueven la tarea un dia laborable y guardan. Mayus mas
 * izquierda/derecha (o arriba/abajo) alargan o acortan el extremo final un
 * dia laborable. Intro abre el detalle de la tarea. Sin permiso de escritura
 * en el proyecto de la tarea no se cambia nada: el teclado no mueve ni
 * redimensiona, pero Intro si abre el detalle.
 */
async function alPulsarTecla(event, id) {
  const tarea = tasks.value.find((item) => item.id === id)
  if (!tarea) return
  if (event.key === 'Enter') {
    event.preventDefault()
    selectedTaskId.value = id
    return
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    if (!editableProjects.value.includes(Number(tarea.project_id))) return
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const rango = event.shiftKey
      ? moverFinDiasLaborables(tarea, delta)
      : moverDiasLaborables(tarea, delta)
    await guardarFechas(id, rango.start, rango.end)
    return
  }
  if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && event.shiftKey) {
    event.preventDefault()
    if (!editableProjects.value.includes(Number(tarea.project_id))) return
    const rango = moverFinDiasLaborables(tarea, event.key === 'ArrowDown' ? 1 : -1)
    await guardarFechas(id, rango.start, rango.end)
  }
}

/* ------------------------------------------------------------------ */
/* Menu contextual: la rejilla sube el contexto, la vista lo decide.  */
/* ------------------------------------------------------------------ */

/**
 * La rejilla avisa de que se ha pedido un menu contextual.
 *
 * El grid sabe de donde viene (una barra o un hueco); la vista arma el arbol
 * de items segun ese contexto y ejecuta la accion elegida. Sin items no hay
 * menu: un menu vacio no dice nada.
 */
function abrirMenuContexto(contexto) {
  const items = itemsDeContexto(contexto)
  if (!items.length) return
  menuContexto.value = {
    items,
    x: contexto.x,
    y: contexto.y,
    abridor: contexto.abridor ?? null,
    label: contexto.tipo === 'barra' ? 'Menú de la tarea' : 'Menú del día',
  }
}

/** Arbol de items del menu, segun el contexto. */
function itemsDeContexto(contexto) {
  if (contexto.tipo === 'barra') return itemsDeBarra(contexto.tarea)
  return itemsDeHueco(contexto.fecha)
}

/**
 * Items del menu de una barra: abrir el detalle y, solo con permiso de
 * escritura en el proyecto de la tarea, mover o redimensionar un dia
 * laborable, con el mismo calculo que el teclado. Los cuatro ultimos guardan
 * con el mismo PATCH que el teclado.
 */
function itemsDeBarra(tarea) {
  const items = [{ label: 'Abrir detalle', accion: 'detalle', dato: tarea.id }]
  if (!editableProjects.value.includes(Number(tarea.project_id))) return items
  items.push(
    { label: 'Mover un día antes', accion: 'mover', dato: { id: tarea.id, delta: -1 } },
    { label: 'Mover un día después', accion: 'mover', dato: { id: tarea.id, delta: 1 } },
    { label: 'Acortar un día', accion: 'redimensionar', dato: { id: tarea.id, delta: -1 } },
    { label: 'Alargar un día', accion: 'redimensionar', dato: { id: tarea.id, delta: 1 } },
  )
  return items
}

/**
 * Items del menu de un hueco: siempre `Ver el día`, y el alta solo si se
 * puede crear: proyecto en contexto y permiso de escritura, como el Gantt,
 * que no ofrece el item de alta cuando no se puede hacer.
 */
function itemsDeHueco(fecha) {
  const items = [{ label: 'Ver el día', accion: 'ver-dia', dato: fecha }]
  if (dayCanEdit.value) {
    items.push({ label: 'Crear tarea en este día', accion: 'crear', dato: fecha })
  }
  return items
}

/**
 * Accion elegida en el menu contextual.
 *
 * Cada accion es una operacion que ya existe: el detalle es el dialogo de la
 * vista, mover y redimensionar guardan con el mismo PATCH que el teclado, el
 * dia abre la vista de dia y la creacion es el alta de la vista.
 */
async function ejecutarAccion(item) {
  const accion = item?.accion
  const dato = item?.dato
  if (accion === 'detalle') {
    selectedTaskId.value = dato
    return
  }
  if (accion === 'mover' || accion === 'redimensionar') {
    const tarea = tasks.value.find((t) => t.id === dato.id)
    if (!tarea) return
    const rango =
      accion === 'mover'
        ? moverDiasLaborables(tarea, dato.delta)
        : moverFinDiasLaborables(tarea, dato.delta)
    await guardarFechas(dato.id, rango.start, rango.end)
    return
  }
  if (accion === 'ver-dia') {
    await openDay(dato)
    return
  }
  if (accion === 'crear') {
    await openCreacion(dato)
  }
}

/**
 * Arrastre de la barra: mover el cuerpo o redimensionar un extremo.
 *
 * La geometria la mide la rejilla en pantalla al empezar el gesto y se fija
 * durante el gesto: el mes desplazado no cambia la escala a mitad. El
 * destino sale de la geometria (no del DOM) y el PATCH es el mismo que el
 * Gantt al mover una barra.
 */
const drag = useCalendarioDrag({
  geometriaDe: () => gridRef.value?.medir() ?? null,
  alConfirmar,
})
const fantasma = drag.fantasma
const previsualizacion = drag.previsualizacion

/**
 * El gesto de arrastre en curso: fantasma o previsualizacion no nulos. Es el
 * que apaga el globo del grid, que estorba al arrastre, como en el Gantt.
 */
const arrastrando = computed(() => fantasma.value !== null || previsualizacion.value !== null)

/**
 * El boton de la barra de herramientas hace de entrada y de salida, y es el
 * mismo elemento en los dos casos: el foco no se pierde al entrar ni al
 * salir, porque el control que lo tiene sigue siendo el mismo.
 */
function alternarAmpliado() {
  ampliado.value = !ampliado.value
}

/**
 * Escape sale del modo ampliado.
 *
 * Con el detalle de una tarea, el alta del dia o el menu contextual abiertos
 * el Escape es del dialogo o del menu, y con un gesto de arrastre en juego
 * es del gesto: en ninguno de los dos casos se sale del modo ampliado, para
 * que no se esconda el calendario a la vez.
 */
function alTeclaGlobal(event) {
  if (event.key !== 'Escape') return
  if (
    selectedTaskId.value !== null ||
    altaDelDia.value !== null ||
    menuContexto.value !== null ||
    arrastrando.value
  ) {
    return
  }
  ampliado.value = false
}

/**
 * Agarrar una barra: arranca el gesto con la zona agarrada (cuerpo o asa) y
 * los dias de la semana de la barra. El destino de la soltura lo resuelve el
 * composable contra la geometria medida.
 */
function onBarDragStart({ tarea, zona, event, dias }) {
  drag.empezarArrastre({ barra: { tarea }, zona, event, dias })
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

/** Vuelve a pedir los datos y enseña el esqueleto mientras llegan. */
async function reintentar() {
  loading.value = true
  await load()
}

// La URL decide con que vista se abre el calendario, antes de pintar.
aplicarEstadoDeLaUrl()
onMounted(load)
useTaskReload(load)
// El Escape solo se escucha en modo ampliado: fuera de el no hay nada que
// cerrar y la tecla es de los dialogos y del arrastre de barras.
watch(ampliado, (activo) => {
  if (activo) document.addEventListener('keydown', alTeclaGlobal)
  else document.removeEventListener('keydown', alTeclaGlobal)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', alTeclaGlobal)
  drag.anular()
})

// La URL manda sobre la vista: al cambiarla (por enlace, por historial o por
// la propia vista) se aplica lo que dice.
watch(
  () => route.query,
  () => aplicarEstadoDeLaUrl(),
)

// Al cambiar de mes, la tabla del mes se desplaza a la primera semana con
// trabajo. Es del DOM y no va en el composable: reacciona al mes que este
// cambia, con nextTick para que la rejilla nueva ya este pintada.
watch(
  () => month.value,
  async () => {
    if (view.value !== 'month') return
    await nextTick()
    desplazarMesASemanaConTrabajo()
  },
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
  <!--
    La vista ocupa el alto disponible (`h-full`) y es una columna flex: el
    calendario se queda con el espacio que sobra y encoge con el que falta.
    Los avisos en linea no empujan el calendario fuera de la vista.

    En modo ampliado la vista sale del armazon (`fixed inset-0`) y ocupa la
    ventana entera. No hay `Teleport` ni ancestro con `transform`, asi que
    los dialogos que se abren desde aqui siguen viendo la ventana.
  -->
  <div
    class="flex h-full min-h-0 flex-col"
    :class="ampliado ? 'fixed inset-0 z-40 overflow-auto bg-lienzo p-3 sm:p-6' : ''"
  >
    <PageHeader class="shrink-0" title="Calendario" :subtitle="subtitle" ayuda="Las tareas de los proyectos visibles, día a día. Elige un proyecto concreto en el filtro para poder crear tareas sobre un día laborable.">
      <template #filters>
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
      </template>
      <template #actions>
          <SegmentedControl
            :model-value="view"
            :options="VISTAS"
            label="Vista del calendario"
            testid-prefix="calendar-view"
            @update:model-value="setView"
          />

          <!-- Navegador de periodo: anterior / etiqueta central / siguiente. -->
          <div
            class="inline-flex items-center gap-0.5 rounded-control border border-borde bg-tarjeta p-0.5 shadow-control"
          >
            <button
              type="button"
              class="flex h-10 w-10 items-center justify-center rounded-control text-texto-tenue transition-colors hover:bg-tarjeta-suave hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              aria-label="Periodo anterior"
              data-testid="calendar-prev"
              @click="step(-1)"
            >
              <span class="inline-flex h-3.5 w-3.5">
                <AppIcon name="chevronLeft" />
              </span>
            </button>

            <span class="min-w-[112px] px-2 text-center font-mono text-cp-sm font-semibold text-texto-marca">
              <span v-if="view === 'month'" data-testid="calendar-month">{{ monthLabel(month) }}</span>
              <span v-else-if="view === 'week'" data-testid="calendar-week">
                {{ weekRangeLabel(week) }}
                <span class="font-normal text-texto-tenue">{{ week }}</span>
              </span>
              <span v-else data-testid="calendar-day">{{ longDateLabel(day) }}</span>
            </span>

            <button
              type="button"
              class="flex h-10 w-10 items-center justify-center rounded-control text-texto-tenue transition-colors hover:bg-tarjeta-suave hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              aria-label="Periodo siguiente"
              data-testid="calendar-next"
              @click="step(1)"
            >
              <span class="inline-flex h-3.5 w-3.5">
                <AppIcon name="chevronRight" />
              </span>
            </button>
          </div>
          <button
            type="button"
            class="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            data-testid="calendar-today"
            @click="goToday"
          >
            Hoy
          </button>

          <!--
            Modo ampliado: el calendario a pantalla completa, por encima del
            armazon. El boton es el mismo al entrar y al salir, de modo que
            el foco no se pierde en ninguno de los dos momentos.
          -->
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-control border border-borde bg-tarjeta text-texto-suave transition-colors hover:bg-tarjeta-suave hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            :aria-label="ampliado ? 'Salir de la vista ampliada' : 'Ampliar a pantalla completa'"
            :aria-pressed="ampliado"
            :title="ampliado ? 'Salir de la vista ampliada (Escape)' : 'Ampliar a pantalla completa'"
            data-testid="calendar-fullscreen"
            @click="alternarAmpliado"
          >
            <span class="inline-flex h-4 w-4">
              <AppIcon :name="ampliado ? 'compress' : 'expand'" />
            </span>
          </button>

      </template>
    </PageHeader>

    <AlertBanner
      v-if="aviso"
      variant="warning"
      class="mb-2 shrink-0"
      data-testid="calendar-warning"
      dismissible
      @dismiss="aviso = null"
    >
      {{ aviso }}
    </AlertBanner>

    <AsyncState
      class="flex min-h-0 flex-1 flex-col"
      :loading="loading"
      :error="error"
      error-test-id="calendar-error"
      loading-label="Cargando el calendario"
      @retry="reintentar"
    >
      <AlertBanner
        v-if="hayFiltros && !visibleTasks.length"
        variant="info"
        class="mb-3 shrink-0"
        data-testid="calendar-no-match"
      >
        Ninguna tarea coincide con los filtros.
      </AlertBanner>

      <p v-if="undatedTaskIds.length" class="mb-3 shrink-0 text-cp-xs text-aviso-texto">
        {{ avisoSinFechas }}
      </p>

      <!--
        Las tres vistas comparten el mismo marco: la vista que esta en pantalla
        se queda con el espacio que sobra y se desplaza dentro de el. El mes
        y la semana son la misma rejilla de filas, con un grupo de semanas o
        una; el dia es el detalle de un solo dia.
      -->
      <div class="flex min-h-[200px] flex-1 flex-col">
        <div
          v-if="view === 'month'"
          class="flex min-h-0 flex-1 flex-col rounded-tarjeta border border-borde bg-tarjeta"
          data-testid="calendar-month-view"
        >
          <!--
            Contenedor vertical de la tabla: permite desplazar la rejilla hasta
            la primera semana con trabajo. El desbordamiento horizontal queda
            en este mismo marco.
          -->
          <div
            ref="mesScroll"
            class="min-h-0 flex-1 overflow-auto"
            data-testid="calendar-month-scroll"
          >
            <CalendarGrid
              ref="gridRef"
              :weeks="semanasDelMes"
              testid="calendar-month-table"
              :people="personasVisibles"
              :tasks="visibleTasks"
              :departments="store.departments"
              :non-working-days="nonWorkingDays"
              :editable-project-ids="editableProjects"
              :destino="previsualizacion"
              :arrastrando="arrastrando"
              @open-day="openDay"
              @open-task="openTask"
              @drag-start="onBarDragStart"
              @tecla="alPulsarTecla"
              @contexto="abrirMenuContexto"
              @crear="openCreacion"
            />
          </div>
        </div>

        <!--
          La semana en pantalla no tiene tareas: se dice y se ofrece saltar a
          la semana visible mas cercana con trabajo, si la hay.
        -->
        <template v-else-if="view === 'week'">
          <AlertBanner
            v-if="semanaSinTareas"
            variant="info"
            class="mb-3 shrink-0"
            data-testid="calendar-week-empty"
          >
            No hay tareas en esta semana
            <button
              v-if="semanaConTrabajo"
              type="button"
              class="rounded-control border border-borde-fuerte bg-tarjeta px-2 py-0.5 text-cp-sm font-medium text-texto transition-colors hover:bg-tarjeta-suave"
              data-testid="calendar-goto-busy-week"
              @click="irASemanaConTrabajo"
            >
              Ir a la semana con trabajo
            </button>
          </AlertBanner>

          <div
            v-else
            class="min-h-0 flex-1 overflow-auto rounded-tarjeta border border-borde bg-tarjeta"
            data-testid="week-grid"
          >
            <CalendarGrid
              ref="gridRef"
              :weeks="[weekDays(week)]"
              :people="personasVisibles"
              :tasks="visibleTasks"
              :departments="store.departments"
              :non-working-days="nonWorkingDays"
              :editable-project-ids="editableProjects"
              :destino="previsualizacion"
              :arrastrando="arrastrando"
              @open-day="openDay"
              @open-task="openTask"
              @drag-start="onBarDragStart"
              @tecla="alPulsarTecla"
              @contexto="abrirMenuContexto"
              @crear="openCreacion"
            />
          </div>
        </template>

        <div v-else class="min-h-0 flex-1 overflow-auto">
          <DayDetail
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
        </div>
      </div>

      <p v-if="view !== 'day'" class="mt-3 shrink-0 text-cp-xs text-texto-tenue">
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
          class="rounded border border-borde-fuerte px-3 py-2 text-sm"
          @click="altaDelDia = null"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="submit"
          :disabled="saving"
          class="rounded bg-primario-fuerte px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {{ saving ? 'Guardando...' : 'Guardar' }}
        </button>
      </template>
    </ModalDialog>

    <!--
      Fantasma del arrastre: la pilora del Gantt. No intercepta el raton,
      para que la banda de destino se siga calculando por debajo.
    -->
    <div
      v-if="fantasma"
      class="pointer-events-none fixed z-50 flex h-6 select-none items-center gap-1.5 rounded-control border border-borde bg-tarjeta pl-1.5 pr-2 shadow-flotante"
      :style="{
        left: `${fantasma.x}px`,
        top: `${fantasma.y}px`,
      }"
      data-testid="calendar-drag-ghost"
    >
      <span class="h-4 w-1 shrink-0 rounded-sm" :style="{ backgroundColor: fantasma.color }" />
      <span class="text-cp-xs font-medium text-texto">{{ fantasma.etiqueta }}</span>
      <span class="rounded-pastilla bg-primario-fuerte px-1.5 py-0.5 text-cp-micro font-semibold text-sobre-primario">
        {{ fantasma.rango }}
      </span>
    </div>

    <!--
      Menu contextual de la barra o del hueco. La rejilla sube el contexto y
      la vista arma los items y ejecuta la accion elegida.
    -->
    <ContextMenu
      v-if="menuContexto"
      :items="menuContexto.items"
      :x="menuContexto.x"
      :y="menuContexto.y"
      :abridor="menuContexto.abridor"
      :label="menuContexto.label"
      @select="ejecutarAccion"
      @close="menuContexto = null"
    />
  </div>
</template>
