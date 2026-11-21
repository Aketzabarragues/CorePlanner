<script setup>
/**
 * Diagrama de Gantt, motor propio.
 *
 * Las barras llegan del backend en el feed global y se ordenan y agrupan en
 * la vista: por proyecto, por departamento o por persona. El layout lo
 * calcula `buildLayout`; el SVG lo pinta `GanttChart`. No hay libreria: la
 * franja de grupo, la leyenda y el sombreado son lo que la vista ya pinta.
 *
 * El diagrama es de toda la organizacion y se puede acotar con los filtros
 * de departamento y proyecto: el de departamento vive en la URL
 * (`?department=`) y el de proyecto, en la ruta del proyecto o en el filtro
 * de la URL (`?project=`). El rango visible (`?from=`/`?to=`) se mueve con
 * las flechas, se centra con "Hoy" y se abre a todas las barras con
 * "Completo".
 *
 * Al mover o redimensionar una barra se guardan las fechas nuevas con un
 * PATCH de la tarea, de modo que el diagrama y la matriz de ocupacion
 * cuentan lo mismo. Sin permiso de escritura en el proyecto, la barra se ve
 * en solo lectura: sin asas y sin arrastre.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { calendarApi, meApi, overviewApi, peopleApi, tasksApi } from '../api/client'
import { useProyectoFiltro } from '../composables/useProyectoFiltro'
import { useTaskReload } from '../composables/useTaskReload'
import { useVisibilidad } from '../composables/useVisibilidad'
import AlertBanner from '../components/common/AlertBanner.vue'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import VisibilityPanel from '../components/common/VisibilityPanel.vue'
import TaskDetailDialog from '../components/TaskDetailDialog.vue'
import GanttChart from '../components/gantt/GanttChart.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { GANTT_VIEW_MODES, dateChangePayload } from '../utils/gantt'
import { addDays, diffDays, parseIsoDate, scaleById, toIsoDate } from '../utils/ganttScale'
import { buildLayout, moveRange, resizeRange } from '../utils/ganttLayout'
import { localDateKey, shortMonthName } from '../utils/month'
import { isoWeekKey, weekDays, weekMonday } from '../utils/weeks'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const store = useProjectsStore()

const feed = ref(null)
const personas = ref([])
const diasNoLaborables = ref([])
const scope = ref(null)
const error = ref(null)
const notice = ref(null)
const loading = ref(true)
const saving = ref(false)
const escalaId = ref('Week')
const barraEnfocada = ref(null)
const selectedTaskId = ref(null)

const GRUPOS = [
  { id: 'proyecto', label: 'Proyecto' },
  { id: 'departamento', label: 'Departamento' },
  { id: 'persona', label: 'Persona' },
  { id: 'sin', label: 'Sin agrupar' },
]

/** Semanas del rango "Hoy": hoy y cuatro a cada lado. */
const SEMANAS_HOY = 4

const departmentFilter = computed(() => route.query.department ?? '')
const projectFilter = useProyectoFiltro()
const groupBy = computed(() => route.query.group ?? 'proyecto')
const rangoDesde = computed(() => route.query.from ?? '')
const rangoHasta = computed(() => route.query.to ?? '')

const escala = computed(() => scaleById(escalaId.value))

const proyectos = computed(() => (Array.isArray(store.projects) ? store.projects : []))
const departamentos = computed(() =>
  Array.isArray(store.departments) ? store.departments : [],
)

/**
 * Personas que se pueden esconder del diagrama.
 *
 * Son las que tienen barra, sacadas del feed, con el departamento que tienen
 * en el directorio. La lista sale del feed y no del ref local de miembros:
 * ese ref se reescribe en cada repintado y el panel se repintaria solo.
 */
const personasVisibilidad = computed(() => {
  const miembros = feed.value?.members ?? []
  return miembros.map((member) => {
    const persona = personas.value.find((item) => String(item.id) === String(member.user_id))
    return {
      id: member.user_id,
      name: member.name,
      department_id: persona?.department_id ?? null,
      department_name: persona?.department_name ?? null,
    }
  })
})

/**
 * Mostrar y ocultar personas y departamentos del diagrama.
 *
 * Vive en la vista: no va a la URL, no se pide al servidor y no se guarda. Es
 * una vista de lo que ya esta cargado, no un filtro de los datos.
 */
const {
  personasOcultas,
  departamentosOcultos,
  idsOcultos,
  ocultosCount,
  ocultoPara,
  alternarPersona,
  alternarDepartamento,
  mostrarTodos,
} = useVisibilidad(personasVisibilidad)

function nombreDepartamento(id) {
  const departamento = departamentos.value.find(
    (item) => String(item.id) === String(id),
  )
  return departamento?.name ?? 'desconocido'
}

function nombreProyecto(id) {
  const proyecto = proyectos.value.find((item) => String(item.id) === String(id))
  return proyecto?.name ?? 'desconocido'
}

/** Departamento que gestiona el proyecto de una barra. */
function departamentoDe(task) {
  const proyecto = proyectos.value.find(
    (item) => String(item.id) === String(task.project_id),
  )
  const id = proyecto?.department_id
  if (id === null || id === undefined) return 'Sin departamento'
  return nombreDepartamento(id)
}

/**
 * Clave de agrupacion de una barra, segun el grupo elegido.
 *
 * La clave es siempre un identificador, no el nombre visible: dos personas
 * con el mismo nombre no se fusionan. La etiqueta la da `etiquetaGrupo`.
 */
function claveDe(task) {
  if (groupBy.value === 'departamento') return departamentoClaveDe(task)
  if (groupBy.value === 'persona') return personaClaveDe(task)
  if (groupBy.value === 'sin') return ''
  return proyectoClaveDe(task)
}

/** Clave de persona: el identificador, o la reserva sin asignar. */
function personaClaveDe(task) {
  const id = task.assigned_to
  return id === null || id === undefined ? '__sin_asignar' : `persona-${id}`
}

/** Clave de proyecto: el identificador, o la reserva sin proyecto. */
function proyectoClaveDe(task) {
  const id = task.project_id
  return id === null || id === undefined ? '__sin_proyecto' : `proyecto-${id}`
}

/** Clave de departamento: por el proyecto de la barra. */
function departamentoClaveDe(task) {
  const proyecto = proyectos.value.find(
    (item) => String(item.id) === String(task.project_id),
  )
  const id = proyecto?.department_id
  return id === null || id === undefined ? '__sin_departamento' : `departamento-${id}`
}

/**
 * Etiquetas visibles de los grupos, en el orden en que `barras` los recorre.
 *
 * `buildLayout` pone `label` igual a `grupo` (la clave), asi que la vista
 * sobrescribe la etiqueta despues de construir el layout.
 */
function etiquetaGrupo(clave) {
  if (clave === '') return ''
  if (clave === '__sin_asignar') return 'Sin asignar'
  if (clave === '__sin_proyecto') return 'Sin proyecto'
  if (clave === '__sin_departamento') return 'Sin departamento'
  if (clave.startsWith('persona-')) {
    const id = clave.slice('persona-'.length)
    const miembro = (feed.value?.members ?? []).find(
      (item) => String(item.user_id) === id,
    )
    if (miembro) return miembro.name
    const persona = personas.value.find((item) => String(item.id) === id)
    return persona?.name ?? 'desconocido'
  }
  if (clave.startsWith('proyecto-')) {
    const id = clave.slice('proyecto-'.length)
    return nombreProyecto(id)
  }
  if (clave.startsWith('departamento-')) {
    const id = clave.slice('departamento-'.length)
    return nombreDepartamento(id)
  }
  return clave
}

/**
 * Barras ordenadas por grupo y, dentro del grupo, por fecha de inicio.
 *
 * Las barras de las personas escondidas no salen. Las tareas sin asignar se
 * quedan: no son de nadie que se pueda esconder.
 */
const barras = computed(() => {
  const tareas = (feed.value?.tasks ?? []).filter((task) => {
    const persona = task.assigned_to
    if (persona === null || persona === undefined) return true
    return !ocultoPara(persona)
  })
  // El orden visible sigue siendo alfabetico por etiqueta de grupo; la
  // clave de agrupacion es el identificador, que la etiqueta no es. La
  // clave desempata dentro de la misma etiqueta para que el grupo salga
  // contiguo: `buildLayout` crea la franja en el primer cambio de clave.
  const clavePorTarea = new Map(tareas.map((task) => [task.id, claveDe(task)]))
  const ordenadas = [...tareas].sort((a, b) => {
    const etiquetaA = etiquetaGrupo(clavePorTarea.get(a.id))
    const etiquetaB = etiquetaGrupo(clavePorTarea.get(b.id))
    if (etiquetaA !== etiquetaB) return etiquetaA.localeCompare(etiquetaB, 'es')
    const claveA = clavePorTarea.get(a.id)
    const claveB = clavePorTarea.get(b.id)
    if (claveA !== claveB) return claveA.localeCompare(claveB)
    const inicioA = a.start ?? ''
    const inicioB = b.start ?? ''
    if (inicioA !== inicioB) return inicioA.localeCompare(inicioB)
    return a.id - b.id
  })
  return ordenadas.map((task) => ({ task, grupo: claveDe(task) }))
})

/** Miembros de la leyenda que no estan escondidos. */
const miembrosVisibles = computed(() => {
  const miembros = feed.value?.members ?? []
  return miembros.filter((member) => !ocultoPara(member.user_id))
})

/** Rango completo: sin desde ni hasta en la URL. */
const rangoCompleto = computed(() => !rangoDesde.value && !rangoHasta.value)

/** Fecha de hoy, en ISO local: la que se le pasa al layout como "hoy". */
const hoyIso = computed(() => localDateKey())

/**
 * Rango visible del diagrama, en fechas UTC.
 *
 * Con desde/hasta en la URL salen esos; sin ellos, el rango completo abarca
 * todas las barras visibles. Sin barras, el rango "Hoy": hoy y cuatro
 * semanas a cada lado, para que el eje no salga vacio.
 */
/**
 * Rango ampliado a los limites de la escala: semana, de lunes a domingo;
 * mes, desde el dia 1 hasta el ultimo dia. En la escala de dia no cambia.
 * Sin esto, en escala Semana la primera celda del eje sale con x negativo.
 */
function ampliarRango({ desde, hasta }) {
  const header = escala.value.header
  if (header === 'week') {
    return {
      desde: weekMonday(isoWeekKey(desde)),
      hasta: addDays(weekMonday(isoWeekKey(hasta)), 6),
    }
  }
  if (header === 'month') {
    return {
      desde: new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1)),
      hasta: new Date(Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth() + 1, 0)),
    }
  }
  return { desde, hasta }
}

const rangoEfectivo = computed(() => {
  const tareas = barras.value.map((item) => item.task)
  if (!rangoCompleto.value) {
    const desde = rangoDesde.value || toIsoDate(addDays(parseIsoDate(hoyIso.value), -28))
    const hasta = rangoHasta.value || toIsoDate(addDays(parseIsoDate(hoyIso.value), 28))
    return ampliarRango({ desde: parseIsoDate(desde), hasta: parseIsoDate(hasta) })
  }
  if (!tareas.length) {
    return ampliarRango({
      desde: parseIsoDate(addDays(parseIsoDate(hoyIso.value), -28)),
      hasta: parseIsoDate(addDays(parseIsoDate(hoyIso.value), 28)),
    })
  }
  let desde = parseIsoDate(tareas[0].start)
  let hasta = parseIsoDate(tareas[0].end)
  for (const task of tareas) {
    const inicio = parseIsoDate(task.start)
    const fin = parseIsoDate(task.end)
    if (inicio < desde) desde = inicio
    if (fin > hasta) hasta = fin
  }
  return ampliarRango({
    desde: addDays(desde, -1),
    hasta: addDays(hasta, 1),
  })
})

/** Modelo del diagrama, ya con la barra pegada a cada fila. */
const layout = computed(() => {
  const modelo = buildLayout({
    items: barras.value,
    groupMode: groupBy.value,
    scale: escala.value,
    start: rangoEfectivo.value.desde,
    end: rangoEfectivo.value.hasta,
    nonWorkingDays: diasNoLaborables.value.map((dia) => toIsoDate(dia.date)),
    today: parseIsoDate(hoyIso.value),
  })
  // `buildLayout` no lleva el avance ni el proyecto de cada barra: la barra
  // los necesita para el relleno oscuro y la columna de nombres.
  const avancePorTarea = new Map(
    (feed.value?.tasks ?? []).map((task) => [task.id, task.progress ?? 0]),
  )
  const proyectoPorTarea = new Map(
    (feed.value?.tasks ?? []).map((task) => [
      task.id,
      task.project_name ?? 'Sin proyecto',
    ]),
  )
  modelo.bars = modelo.bars.map((barra) => ({
    ...barra,
    progress: avancePorTarea.get(barra.taskId) ?? 0,
    projectName: proyectoPorTarea.get(barra.taskId) ?? '',
  }))
  // La columna de nombres lee el titulo, la persona y el proyecto de la fila,
  // no de la barra: se pegan aqui, en la unica pieza que tiene las dos.
  const barraPorFila = new Map(modelo.bars.map((barra) => [barra.rowIndex, barra]))
  // La fila de grupo lleva la clave de agrupacion: la etiqueta visible la
  // pone la vista, porque la clave no es el nombre que se lee.
  modelo.rows = modelo.rows.map((fila) => {
    if (fila.type === 'group') return { ...fila, label: etiquetaGrupo(fila.label) }
    const barra = barraPorFila.get(fila.rowIndex)
    return {
      ...fila,
      barra,
      title: barra.title,
      assignedName: barra.assignedName,
      projectName: barra.projectName,
    }
  })
  return modelo
})

/**
 * Celdas del eje, con las insignias de hoy y de festivo.
 *
 * En la escala de dia la insignia no cabe: el festivo ya lo marca la banda
 * ambar de la rejilla. En Semana y Mes el dia de festivo vive dentro de una
 * celda mas amplia, y la insignia va en la celda que lo contiene, con la
 * misma etiqueta que la matriz (el primero, y cuantos mas hay).
 */
const columnas = computed(() => {
  const hoy = toIsoDate(parseIsoDate(hoyIso.value))
  const festivosPorDia = new Map(
    diasNoLaborables.value.map((dia) => [toIsoDate(dia.date), dia]),
  )
  const festivosDe = (dias) =>
    dias.map((dia) => festivosPorDia.get(toIsoDate(dia))).filter(Boolean)
  const etiqueta = (festivos) => {
    const primero = festivos[0]
    const extra = festivos.length > 1 ? ` +${festivos.length - 1}` : ''
    const media = primero.half_day ? '1/2 ' : ''
    return `${media}${primero.name}${extra}`
  }
  return layout.value.axis.cells.map((celda) => {
    let festivo = null
    const festivosDeCelda = (dias) => {
      const festivos = festivosDe(dias)
      // `ancho` es la etiqueta a ~6 px por letra: el rect del eje la lleva
      // con 12 px de margen.
      if (festivos.length) festivo = { etiqueta: etiqueta(festivos), ancho: etiqueta(festivos).length * 6 }
    }
    if (celda.kind === 'week') {
      festivosDeCelda(weekDays(celda.key).map((dia) => parseIsoDate(dia.date)))
    } else if (celda.kind === 'month') {
      const [anio, mes] = celda.key.split('-').map(Number)
      const ultimo = new Date(Date.UTC(anio, mes, 0))
      const dias = []
      for (let d = 1; d <= ultimo.getUTCDate(); d += 1) {
        dias.push(new Date(Date.UTC(anio, mes - 1, d)))
      }
      festivosDeCelda(dias)
    }
    return {
      ...celda,
      hoy: celda.kind === 'day' ? celda.key === hoy : false,
      festivo,
    }
  })
})

/**
 * Si la persona que entra puede escribir en la barra.
 *
 * El ambito viene de `me`: la lista de proyectos editables. En la vista
 * global cada barra se mira el proyecto propio; sin ambito no hay permiso.
 */
function editableDe(taskId) {
  const editables = scope.value?.editable_project_ids
  if (!editables) return false
  const tarea = (feed.value?.tasks ?? []).find((item) => item.id === taskId)
  if (!tarea) return false
  return editables.includes(tarea.project_id)
}

/**
 * Etiqueta aria de cada barra: titulo, persona, fechas, estado y avance.
 * Sin permiso, termina en "Solo lectura.".
 */
function etiquetaDe(taskId) {
  const barra = layout.value.bars.find((item) => item.taskId === taskId)
  if (!barra) return ''
  const partes = [barra.title]
  if (barra.assignedName) partes.push(barra.assignedName)
  const desde = parseIsoDate(barra.startIso)
  const hasta = parseIsoDate(barra.endIso)
  partes.push(
    `Del ${desde.getUTCDate()} de ${shortMonthName(desde.getUTCMonth() + 1)} al ${hasta.getUTCDate()} de ${shortMonthName(hasta.getUTCMonth() + 1)} de ${hasta.getUTCFullYear()}.`,
  )
  if (barra.progress > 0) partes.push(`${barra.progress} % de avance.`)
  const editable = editableDe(taskId)
  return partes.join(' ') + (editable ? '' : ' Solo lectura.')
}

/** Lo que se lee en la descripcion del SVG. */
const descripcion = computed(() => {
  const tareas = layout.value.bars.length
  const desde = toIsoDate(rangoEfectivo.value.desde)
  const hasta = toIsoDate(rangoEfectivo.value.hasta)
  return `${tareas} tareas, del ${desde} al ${hasta}.`
})

/** Aviso de solo lectura, para la descripcion del SVG. */
const avisoSoloLectura = computed(() => {
  const editables = scope.value?.editable_project_ids
  if (editables && (feed.value?.tasks ?? []).some((task) => editables.includes(task.project_id))) {
    return ''
  }
  return 'Diagrama en solo lectura: no hay permisos de escritura en estos proyectos.'
})

/** Lo que se lee encima del diagrama: con filtros, solo sale lo filtrado. */
const subtitle = computed(() => {
  const filtros = []
  if (departmentFilter.value) {
    filtros.push(`departamento ${nombreDepartamento(departmentFilter.value)}`)
  }
  if (projectFilter.value) {
    filtros.push(`proyecto ${nombreProyecto(projectFilter.value)}`)
  }
  let texto
  if (filtros.length) {
    texto = `Las barras filtradas por ${filtros.join(', ')}.`
  } else {
    texto = 'Las barras de todos los proyectos visibles, agrupadas por proyecto.'
  }
  return avisoSoloLectura.value ? `${texto} ${avisoSoloLectura.value}` : texto
})

/** Tareas sin fechas: en plural correcto, con una sola no se lee "1 tareas". */
const avisoSinFechas = computed(() => {
  const n = feed.value?.undated_task_ids.length ?? 0
  return n === 1
    ? '1 tarea sin fechas no aparece en el diagrama.'
    : `${n} tareas sin fechas no aparecen en el diagrama.`
})

function etiquetaRango(desde, hasta) {
  const d = parseIsoDate(desde)
  const h = parseIsoDate(hasta)
  const mesD = shortMonthName(d.getUTCMonth() + 1)
  const mesH = shortMonthName(h.getUTCMonth() + 1)
  if (mesD === mesH) {
    return `${d.getUTCDate()} - ${h.getUTCDate()} ${mesH} ${h.getUTCFullYear()}`
  }
  return `${d.getUTCDate()} ${mesD} - ${h.getUTCDate()} ${mesH} ${h.getUTCFullYear()}`
}

const rangoLabel = computed(() =>
  etiquetaRango(rangoEfectivo.value.desde, rangoEfectivo.value.hasta),
)

/** Escribe un filtro en la URL, que es donde vive el estado de la vista. */
function cambiarFiltro(patch) {
  const query = { ...route.query }
  for (const [key, value] of Object.entries(patch)) {
    if (value === '' || value === null || value === undefined) delete query[key]
    else query[key] = String(value)
  }
  router.replace({ path: route.path, query })
}

/**
 * Mueve el rango una unidad del eje: un dia en escala Dia, una semana en
 * escala Semana, un mes en escala Mes. Con el rango completo no hay flechas.
 */
function moveRango(delta) {
  if (rangoCompleto.value) return
  const desde = parseIsoDate(rangoEfectivo.value.desde)
  const hasta = parseIsoDate(rangoEfectivo.value.hasta)
  if (escala.value.header === 'day') {
    cambiarFiltro({ from: toIsoDate(addDays(desde, delta)), to: toIsoDate(addDays(hasta, delta)) })
    return
  }
  if (escala.value.header === 'month') {
    const anio = desde.getUTCFullYear()
    const mes = desde.getUTCMonth() + delta
    const nuevo = new Date(Date.UTC(anio, mes, 1))
    const dias = diffDays(desde, nuevo)
    cambiarFiltro({
      from: toIsoDate(addDays(desde, dias)),
      to: toIsoDate(addDays(hasta, dias)),
    })
    return
  }
  cambiarFiltro({
    from: toIsoDate(addDays(desde, delta * 7)),
    to: toIsoDate(addDays(hasta, delta * 7)),
  })
}

function goHoy() {
  const hoy = parseIsoDate(hoyIso.value)
  cambiarFiltro({
    from: toIsoDate(addDays(hoy, -SEMANAS_HOY * 7)),
    to: toIsoDate(addDays(hoy, SEMANAS_HOY * 7)),
  })
}

function goCompleto() {
  cambiarFiltro({ from: null, to: null })
}

/**
 * Guarda las fechas nuevas cuando se mueve o redimensiona una barra.
 *
 * Optimista, como el Kanban: primero el PATCH y, aunque el servidor lo
 * rechace, se vuelve a pedir el diagrama, para que lo que se vea sea lo que
 * hay en la base.
 */
async function moverTarea({ taskId, start, end }) {
  saving.value = true
  const payload = dateChangePayload(start, end)
  try {
    await tasksApi.update(auth.token, taskId, payload)
    notice.value = `Fechas actualizadas: ${payload.start_date} a ${payload.end_date}.`
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
  await load()
}

/**
 * Teclado de la barra enfocada: el chart sube la tecla y la vista decide.
 *
 * Arriba/abajo mueven el foco entre barras. Izquierda/derecha aplican el
 * movimiento de una unidad del eje (un dia, una semana ISO o un mes segun
 * la escala) con PATCH; Mayus mas izquierda/derecha (o arriba/abajo)
 * redimensiona el extremo final en esa misma unidad. Intro abre el detalle
 * de la tarea enfocada. El rango nunca se toca a mano: `moveRange` y
 * `resizeRange` recortan al otro extremo.
 */
async function alPulsarTecla(event, id) {
  const barrasOrden = layout.value.bars
  const indice = barrasOrden.findIndex((barra) => barra.taskId === id)
  const barra = barrasOrden[indice]
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    if (event.shiftKey) {
      // Igual que Mayus con las horizontales: redimensiona el extremo final.
      await redimensionarTarea(barra, event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    const destino = event.key === 'ArrowUp' ? indice - 1 : indice + 1
    if (destino >= 0 && destino < barrasOrden.length) {
      barraEnfocada.value = barrasOrden[destino].taskId
    }
    return
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 1 : -1
    if (event.shiftKey) {
      await redimensionarTarea(barra, delta)
      return
    }
    const rango = moveRange(barra.startIso, barra.endIso, delta * unidadDelEje(barra))
    await moverTarea({ taskId: barra.taskId, start: rango.start, end: rango.end })
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    abrirDetalle(id)
  }
}

/**
 * Redimensiona el extremo final delta unidades del eje, con PATCH.
 *
 * `resizeRange` recorta al inicio si la barra quedaria vacia: nunca se
 * inventa un rango al reves.
 */
async function redimensionarTarea(barra, delta) {
  const rango = resizeRange(barra.startIso, barra.endIso, 'end', delta * unidadDelEje(barra))
  await moverTarea({ taskId: barra.taskId, start: rango.start, end: rango.end })
}

/** Unidad del eje en dias: un dia, una semana ISO o el mes natural. */
function unidadDelEje(barra) {
  const header = escala.value.header
  if (header === 'month') {
    const desde = parseIsoDate(barra.startIso)
    const siguiente = new Date(
      Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth() + 1, 1),
    )
    return diffDays(desde, siguiente)
  }
  return header === 'week' ? 7 : 1
}

function abrirDetalle(id) {
  barraEnfocada.value = id
  selectedTaskId.value = id
}

async function load() {
  try {
    const token = await auth.ensureSession()
    const params = {}
    if (departmentFilter.value) params.department_id = departmentFilter.value
    if (projectFilter.value) params.project_id = projectFilter.value

    const [respuesta, directorio] = await Promise.all([
      overviewApi.gantt(token, params),
      peopleApi.list(token).catch(() => []),
    ])
    personas.value = Array.isArray(directorio) ? directorio : []
    await store.ensureProjects(token).catch(() => null)
    scope.value = await meApi.get(token).catch(() => null)

    feed.value = respuesta
    // El rango de festivos depende del feed: se pide despues de montarlo.
    diasNoLaborables.value = await diasNoLaborablesDelRango(token)
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
  // El diagrama se pinta cuando su contenedor ya esta en la pagina: mientras
  // se carga, la pantalla muestra el esqueleto en su lugar.
  await nextTick()
}

/**
 * Dias no laborables de alcance global del rango visible.
 *
 * Solo los globales sombrean la rejilla (los de departamento o persona no
 * son de toda la organizacion). Si la llamada falla, no hay bandas de
 * festivo pero el diagrama se pinta igual.
 */
async function diasNoLaborablesDelRango(token) {
  try {
    const { desde, hasta } = rangoEfectivo.value
    const dias = await calendarApi.list(token, {
      from: toIsoDate(desde),
      to: toIsoDate(hasta),
    })
    return (Array.isArray(dias) ? dias : []).filter((dia) => dia.scope === 'global')
  } catch {
    return []
  }
}

/** Vuelve a pedir el diagrama y enseña el esqueleto mientras llega. */
async function reintentar() {
  loading.value = true
  await load()
}

onMounted(load)
watch(
  () => [departmentFilter.value, projectFilter.value].join('|'),
  (nuevo, viejo) => {
    if (nuevo !== viejo) load()
  },
)
// Al cambiar lo que se ve hay que recalcular el layout. El watcher mira solo
// el estado de visibilidad: si mirara las barras, el render se dispararia a
// si mismo sin parar.
watch([personasOcultas, departamentosOcultos], () => {
  barraEnfocada.value = null
})
useTaskReload(load)
</script>

<template>
  <div>
    <PageHeader title="Gantt" :subtitle="subtitle">
      <template #actions>
        <button
          v-for="mode in GANTT_VIEW_MODES"
          :key="mode.id"
          type="button"
          class="rounded border px-3 py-1.5 text-sm"
          :class="
            escalaId === mode.id
              ? 'border-siemens-900 bg-siemens-900 text-white'
              : 'border-slate-300 bg-white text-slate-700'
          "
          :data-testid="`gantt-scale-${mode.id}`"
          @click="escalaId = mode.id"
        >
          {{ mode.label }}
        </button>
      </template>
    </PageHeader>

    <AlertBanner v-if="notice" variant="success" class="mb-2">
      {{ notice }}
    </AlertBanner>

    <div class="mb-3 flex flex-wrap items-end gap-3" data-testid="gantt-filters">
      <label class="text-xs font-medium text-slate-600">
        <span class="mb-1 block">Departamento</span>
        <select
          data-testid="gantt-filter-department"
          class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          :value="departmentFilter"
          @change="cambiarFiltro({ department: $event.target.value })"
        >
          <option value="">Todos los departamentos</option>
          <option v-for="item in departamentos" :key="item.id" :value="String(item.id)">
            {{ item.name }}
          </option>
        </select>
      </label>

      <!-- En el espacio del proyecto el proyecto ya viene de la ruta. -->
      <label v-if="!route.params.id" class="text-xs font-medium text-slate-600">
        <span class="mb-1 block">Proyecto</span>
        <select
          data-testid="gantt-filter-project"
          class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          :value="projectFilter"
          @change="cambiarFiltro({ project: $event.target.value })"
        >
          <option value="">Todos los proyectos</option>
          <option v-for="item in proyectos" :key="item.id" :value="String(item.id)">
            {{ item.name }}
          </option>
        </select>
      </label>

      <label class="text-xs font-medium text-slate-600">
        <span class="mb-1 block">Agrupar por</span>
        <select
          data-testid="gantt-group-by"
          class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          :value="groupBy"
          @change="cambiarFiltro({ group: $event.target.value })"
        >
          <option v-for="grupo in GRUPOS" :key="grupo.id" :value="grupo.id">
            {{ grupo.label }}
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

      <div class="flex items-center gap-1">
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          aria-label="Periodo anterior"
          :disabled="rangoCompleto"
          data-testid="range-previous"
          @click="moveRango(-1)"
        >
          ←
        </button>
        <button
          type="button"
          class="h-8 rounded border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
          data-testid="range-today"
          @click="goHoy"
        >
          Hoy
        </button>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          aria-label="Periodo siguiente"
          :disabled="rangoCompleto"
          data-testid="range-next"
          @click="moveRango(1)"
        >
          →
        </button>
        <button
          type="button"
          class="h-8 rounded border border-slate-300 px-3 text-sm font-medium text-slate-700"
          :class="rangoCompleto ? 'border-siemens-900 bg-siemens-900 text-white' : 'bg-white'"
          data-testid="range-complete"
          @click="goCompleto"
        >
          Completo
        </button>
        <span class="ml-1 text-xs text-slate-500" data-testid="range-label">
          {{ rangoLabel }}
        </span>
      </div>
    </div>

    <AsyncState
      :loading="loading"
      :error="error"
      loading-label="Cargando el diagrama"
      error-test-id="gantt-warning"
      @retry="reintentar"
    >
      <p v-if="saving" class="text-sm text-slate-500">Guardando fechas...</p>

      <ul
        v-if="miembrosVisibles.length"
        class="mb-3 flex flex-wrap gap-3 text-xs text-slate-600"
        data-testid="gantt-legend"
      >
        <li
          v-for="member in miembrosVisibles"
          :key="member.user_id"
          class="flex items-center gap-1.5"
        >
          <span :class="['inline-block h-3 w-3 rounded-sm', member.css_class]" />
          {{ member.name }}
        </li>
      </ul>

      <AlertBanner
        v-if="feed && feed.undated_task_ids.length"
        variant="warning"
        class="mb-3"
        data-testid="gantt-undated"
      >
        {{ avisoSinFechas }}
      </AlertBanner>

      <GanttChart
        :layout="layout"
        :columnas="columnas"
        :filas-nombres="layout.rows"
        :editable-de="editableDe"
        :barra-enfocada="barraEnfocada"
        :etiqueta-de="etiquetaDe"
        :descripcion="descripcion"
        :aviso="avisoSoloLectura"
        @abrir="abrirDetalle"
        @seleccionar="barraEnfocada = $event"
        @tecla="alPulsarTecla"
        @mover="moverTarea"
      />
    </AsyncState>

    <TaskDetailDialog
      :open="selectedTaskId !== null"
      :task-id="selectedTaskId"
      :can-edit="selectedTaskId !== null && editableDe(selectedTaskId)"
      @close="selectedTaskId = null"
      @saved="load"
      @deleted="selectedTaskId = null; load()"
    />
  </div>
</template>
