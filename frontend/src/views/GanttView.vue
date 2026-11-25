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
 *
 * Cada grupo lleva su barra de resumen (de la primera a la ultima fecha de
 * sus tareas) y su cabecera es un boton que lo colapsa. Los grupos colapsados
 * no dibujan sus barras, pero su resumen sigue a la vista: es la extension
 * del grupo en el tiempo. El estado vive en la URL (`?collapsed=`).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  calendarApi,
  dependenciesApi,
  meApi,
  overviewApi,
  peopleApi,
  projectsApi,
  tasksApi,
} from '../api/client'
import { useProyectoFiltro } from '../composables/useProyectoFiltro'
import { useTaskReload } from '../composables/useTaskReload'
import { useVisibilidad } from '../composables/useVisibilidad'
import AlertBanner from '../components/common/AlertBanner.vue'
import AppIcon from '../components/AppIcon.vue'
import AsyncState from '../components/common/AsyncState.vue'
import ContextMenu from '../components/common/ContextMenu.vue'
import FilterField from '../components/common/FilterField.vue'
import ModalDialog from '../components/ModalDialog.vue'
import PageHeader from '../components/common/PageHeader.vue'
import SegmentedControl from '../components/common/SegmentedControl.vue'
import TaskDetailDialog from '../components/TaskDetailDialog.vue'
import TaskForm from '../components/TaskForm.vue'
import VisibilityPanel from '../components/common/VisibilityPanel.vue'
import GanttChart from '../components/gantt/GanttChart.vue'
import GanttColumnsPanel from '../components/gantt/GanttColumnsPanel.vue'
import GanttRangePanel from '../components/gantt/GanttRangePanel.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { useToastStore } from '../stores/toast'
import { GANTT_VIEW_MODES, dateChangePayload } from '../utils/gantt'
import {
  COLUMNAS_GANTT,
  columnasDeUrl,
  comparadorDeOrden,
  ordenDeUrl,
  textoDeColumna,
} from '../utils/ganttColumns'
import { addDays, diffDays, escalaAjustada, parseIsoDate, scaleById, toIsoDate } from '../utils/ganttScale'
import { buildLayout, moveRange, resizeRange } from '../utils/ganttLayout'
import { KANBAN_COLUMNS, columnLabel } from '../utils/kanban'
import { localDateKey, monthKey, monthName, shortMonthName } from '../utils/month'
import { isoWeekKey, weekDays, weekMonday, weekWorkdays } from '../utils/weeks'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const store = useProjectsStore()
const toast = useToastStore()

const feed = ref(null)
const personas = ref([])
const diasNoLaborables = ref([])
const scope = ref(null)
const error = ref(null)
/**
 * Codigo HTTP del ultimo error de carga.
 *
 * Lo necesita el aviso: un 4xx (falta el permiso, el proyecto no existe)
 * no se reintenta, porque volver a pedirlo daria el mismo fallo.
 */
const errorStatus = ref(null)
/** Error de guardado: la carga salio bien, pero el PATCH no. */
const errorGuardado = ref(null)
/** Guardado que fallo y se puede reintentar: el ultimo arrastre. */
const guardadoPendiente = ref(null)
const loading = ref(true)
const saving = ref(false)
const escalaId = ref('Week')
/**
 * Factor de detalle del diagrama.
 *
 * Vive en la vista, como la escala: no va a la URL. Con 1 el lienzo llena el
 * panel (el estado de partida); mas factor da mas pixeles por dia y el panel
 * se desplaza en horizontal; menos factor deja el rango mas corto que el
 * panel y se ve hueco a la derecha.
 */
const zoom = ref(1)
/**
 * Diagrama en modo ampliado: ocupa la ventana entera, por encima del
 * armazon. La vista se sale del armazon con `fixed inset-0` (no hay
 * `Teleport` ni ancestro con `transform`), de modo que los dialogos que se
 * abren desde aqui siguen viendo la ventana y quedan por encima.
 */
const ampliado = ref(false)
/** El diagrama: la vista le pide que centre la columna de hoy. */
const chart = ref(null)
/**
 * Ancho disponible del panel de diagrama, en pixeles.
 *
 * Lo informa el chart (`ancho-panel`). Con 0 (aun sin medir) la escala
 * natural se usa tal cual.
 */
const anchoPanel = ref(0)
const barraEnfocada = ref(null)
const selectedTaskId = ref(null)
const altaAbierta = ref(false)
const savingAlta = ref(false)
const seedTarea = ref(null)
const altaProyecto = ref(null)
const altaMiembros = ref([])
/** Cascada pendiente de decidir: la barra arrastrada y las que arrastra. */
const cascada = ref(null)
/** Fallo de la consulta de cascada: se avisa sin bloquear el guardado. */
const cascadaFallo = ref(null)
/** Exportacion iCal en curso: el boton se queda desactivado hasta que llega. */
const exportandoIcs = ref(false)
/** Fallo de la exportacion iCal: se avisa sin tocar el estado del diagrama. */
const falloIcs = ref(null)
/**
 * Menu contextual abierto.
 *
 * Guarda el arbol de items, donde se dibuja (coordenadas del viewport) y el
 * elemento que lo abrio, al que vuelve el foco cuando se cierra.
 */
const menuContexto = ref(null)

/** Miembros por proyecto ya pedidos: una sola peticion por proyecto. */
const miembrosCache = new Map()

const GRUPOS = [
  { id: 'proyecto', label: 'Proyecto' },
  { id: 'departamento', label: 'Departamento' },
  { id: 'persona', label: 'Persona' },
  { id: 'sin', label: 'Sin agrupar' },
]

/** Semanas del rango "Hoy": hoy y cuatro a cada lado. */
const SEMANAS_HOY = 4

/** Factor de detalle minimo y maximo: el zoom tiene tope en los dos sentidos. */
const ZOOM_MIN = 0.25
const ZOOM_MAX = 8
/** Paso de los botones: el factor se multiplica o se divide por este. */
const PASO_ZOOM = 1.25

const departmentFilter = computed(() => route.query.department ?? '')
const projectFilter = useProyectoFiltro()
const groupBy = computed(() => route.query.group ?? 'proyecto')
const rangoDesde = computed(() => route.query.from ?? '')
const rangoHasta = computed(() => route.query.to ?? '')

/** Formato de fecha del rango en la URL: 'AAAA-MM-DD'. */
const FECHA_EN_URL = /^\d{4}-\d{2}-\d{2}$/

/**
 * Fecha de la URL que existe de verdad.
 *
 * El formato no basta: '2026-02-31' lo pasa y no existe. Se compara la fecha
 * normalizada con la cadena: si no son iguales, el dia no existe.
 */
function fechaValida(valor) {
  if (typeof valor !== 'string' || !FECHA_EN_URL.test(valor)) return false
  return toIsoDate(parseIsoDate(valor)) === valor
}

/**
 * Grupos colapsados: los que no muestran sus tareas.
 *
 * Viven en la URL (`?collapsed=`, con las claves separadas por comas) para que
 * recargar la pagina deje el diagrama igual. La clave es el identificador
 * del grupo (`persona-12`), no su nombre: dos personas homonimas son dos
 * grupos.
 */
const colapsados = computed(() => {
  const bruto = route.query.collapsed ?? ''
  const lista = Array.isArray(bruto) ? bruto : [bruto]
  return new Set(lista.flatMap((valor) => String(valor).split(',')).filter(Boolean))
})

/**
 * Columnas elegidas del panel de nombres.
 *
 * Viven en la URL (`?cols=`, con las claves separadas por comas) para que
 * recargar la pagina deje el panel como estaba. La columna de la tarea no se
 * elige: siempre esta.
 */
const columnasElegidas = computed(() => columnasDeUrl(route.query.cols))

/** Definiciones de las columnas elegidas: las necesitan el panel y el grafico. */
const columnasPanel = computed(() =>
  COLUMNAS_GANTT.filter((columna) => columnasElegidas.value.includes(columna.key)),
)

/**
 * Ordenacion de las tareas dentro de cada grupo.
 *
 * Vive en la URL (`?sort=columna:sentido`): la columna por la que se ordena
 * y el sentido. Sin ordenacion, las tareas de un grupo van por fecha de
 * inicio, como siempre.
 */
const orden = computed(() => ordenDeUrl(route.query.sort))

/** Comparador de la ordenacion vigente; null si no hay ordenacion. */
const comparador = computed(() => comparadorDeOrden(orden.value))

/**
 * Ruta critica destacada: si el diagrama marca la cadena.
 *
 * Vive en la URL (`?critical=1`): el parametro solo se escribe cuando el
 * interruptor esta encendido. Con el interruptor apagado el diagrama es
 * exactamente el de antes, aunque el feed traiga la marca.
 */
const rutaCriticaActiva = computed(() => route.query.critical === '1')

/**
 * Identificadores de las tareas de la ruta critica.
 *
 * Sale del feed (`in_critical_path`). Con el interruptor apagado el conjunto
 * va vacio: asi el diagrama no dibuja ninguna marca y el lector de pantalla
 * no anuncia nada que no se vea.
 */
const tareasCriticas = computed(() => {
  if (!rutaCriticaActiva.value) return new Set()
  return new Set(
    (feed.value?.tasks ?? [])
      .filter((task) => task.in_critical_path === true)
      .map((task) => task.id),
  )
})

const escala = computed(() => scaleById(escalaId.value))

const proyectos = computed(() => (Array.isArray(store.projects) ? store.projects : []))
const departamentos = computed(() =>
  Array.isArray(store.departments) ? store.departments : [],
)

/** Opciones del selector de escala, con la forma que pide el control comun. */
const opcionesEscala = computed(() =>
  GANTT_VIEW_MODES.map((modo) => ({ value: modo.id, label: modo.label })),
)

/** Opciones de los filtros: la de "todos" delante y las visibles detras. */
const opcionesDepartamento = computed(() => [
  { value: '', label: 'Todos los departamentos' },
  ...departamentos.value.map((item) => ({ value: String(item.id), label: item.name })),
])
const opcionesProyecto = computed(() => [
  { value: '', label: 'Todos los proyectos' },
  ...proyectos.value.map((item) => ({ value: String(item.id), label: item.name })),
])
const opcionesGrupo = computed(() =>
  GRUPOS.map((grupo) => ({ value: grupo.id, label: grupo.label })),
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
 * Color del grupo de departamento.
 *
 * El motor solo sabe el color de la persona y el del proyecto: el del
 * departamento esta en el directorio, que es de la vista.
 */
function colorDeDepartamento(clave) {
  if (!clave || !clave.startsWith('departamento-')) return null
  const id = clave.slice('departamento-'.length)
  const departamento = departamentos.value.find((item) => String(item.id) === id)
  return departamento?.color ?? null
}

/**
 * Resumen del grupo para el lector de pantalla.
 *
 * Cuantas tareas tiene el grupo y entre que fechas van: "4 tareas · del 21 al
 * 25 de dic". Si los extremos caen en meses distintos, se nombran los dos.
 */
function resumenDeGrupo(fila) {
  if (!fila.cuantas) return ''
  const tareas = fila.cuantas === 1 ? '1 tarea' : `${fila.cuantas} tareas`
  return `${tareas} · ${rangoDeGrupo(fila)}`
}

/** Rango de fechas del grupo, en texto: "del 21 al 25 de dic". */
function rangoDeGrupo(fila) {
  const desde = parseIsoDate(fila.inicio)
  const hasta = parseIsoDate(fila.fin)
  const mesDesde = shortMonthName(desde.getUTCMonth() + 1)
  const mesHasta = shortMonthName(hasta.getUTCMonth() + 1)
  if (mesDesde === mesHasta) {
    return `del ${desde.getUTCDate()} al ${hasta.getUTCDate()} de ${mesHasta}`
  }
  return `del ${desde.getUTCDate()} de ${mesDesde} al ${hasta.getUTCDate()} de ${mesHasta}`
}

/**
 * Barras ordenadas por grupo y, dentro del grupo, por fecha de inicio.
 *
 * Las barras de las personas escondidas no salen. Las tareas sin asignar se
 * quedan: no son de nadie que se pueda esconder.
 *
 * La ordenacion elegida (`?sort=`) actua dentro del grupo: el orden de los
 * grupos no se mueve, y el motor conserva el orden de los items que le
 * llegan.
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
  const ordenar = comparador.value
  const ordenadas = [...tareas].sort((a, b) => {
    const etiquetaA = etiquetaGrupo(clavePorTarea.get(a.id))
    const etiquetaB = etiquetaGrupo(clavePorTarea.get(b.id))
    if (etiquetaA !== etiquetaB) return etiquetaA.localeCompare(etiquetaB, 'es')
    const claveA = clavePorTarea.get(a.id)
    const claveB = clavePorTarea.get(b.id)
    if (claveA !== claveB) return claveA.localeCompare(claveB)
    // Dentro del grupo manda la ordenacion elegida; la fecha de inicio
    // desempata para que el orden sea estable.
    if (ordenar) {
      const diferencia = ordenar(a, b)
      if (diferencia !== 0) return diferencia
    }
    const inicioA = a.start ?? ''
    const inicioB = b.start ?? ''
    if (inicioA !== inicioB) return inicioA.localeCompare(inicioB)
    return a.id - b.id
  })
  return ordenadas.map((task) => ({ task, grupo: claveDe(task) }))
})

/**
 * Claves de los grupos del agrupamiento vigente.
 *
 * Son las claves, no los nombres: dos personas homonimas son dos grupos y se
 * colapsan por separado.
 */
const clavesDeGrupos = computed(() => {
  if (groupBy.value === 'sin') return []
  const claves = new Set()
  for (const item of barras.value) claves.add(item.grupo)
  return [...claves]
})

/** Miembros de la leyenda que no estan escondidos. */
const miembrosVisibles = computed(() => {
  const miembros = feed.value?.members ?? []
  return miembros.filter((member) => !ocultoPara(member.user_id))
})

/** Si alguna barra visible es de un proyecto provisional: la leyenda lo marca. */
const hayProvisional = computed(() =>
  (layout.value?.bars ?? []).some((barra) => barra.provisional === true),
)

/** Fecha de hoy, en ISO local: la que se le pasa al layout como "hoy". */
const hoyIso = computed(() => localDateKey())

/**
 * Rango pedido en la URL, ya validado.
 *
 * `valido` false significa que lo que llega no vale: una fecha que no
 * parsea, un dia que no existe o un rango al reves. En ese caso el diagrama
 * cae al rango del plan y la vista avisa: un enlace mal escrito nunca deja
 * el diagrama vacio.
 *
 * Con rango valido, `desde` y `hasta` son las fechas efectivas: si falta un
 * lado, se rellena con hoy mas/menos cuatro semanas, como siempre.
 */
const rangoPedido = computed(() => {
  const brutoDesde = rangoDesde.value
  const brutoHasta = rangoHasta.value
  if (!brutoDesde && !brutoHasta) {
    return { valido: true, desde: null, hasta: null, problema: '' }
  }
  if (
    (brutoDesde && !fechaValida(brutoDesde)) ||
    (brutoHasta && !fechaValida(brutoHasta))
  ) {
    return {
      valido: false,
      desde: null,
      hasta: null,
      problema: 'Las fechas del enlace no tienen un formato válido (AAAA-MM-DD).',
    }
  }
  const hoy = parseIsoDate(hoyIso.value)
  const desde = brutoDesde ? parseIsoDate(brutoDesde) : addDays(hoy, -28)
  const hasta = brutoHasta ? parseIsoDate(brutoHasta) : addDays(hoy, 28)
  if (desde > hasta) {
    return {
      valido: false,
      desde: null,
      hasta: null,
      problema: 'El rango del enlace está invertido: la fecha inicial es posterior a la final.',
    }
  }
  return { valido: true, desde, hasta, problema: '' }
})

/** Aviso del rango que no vale: el diagrama muestra el plan completo. */
const avisoRango = computed(() => {
  const problema = rangoPedido.value.problema
  if (!problema) return ''
  return `${problema} Se muestra el plan completo.`
})

/**
 * Rango elegido, en ISO, para el panel de rango.
 *
 * Vacio cuando no hay rango valido en la URL: entonces lo que se ve es el
 * plan completo, y el panel lo dice.
 */
const rangoElegido = computed(() => {
  const pedido = rangoPedido.value
  if (!pedido.valido || pedido.desde === null) return { desde: '', hasta: '' }
  return { desde: toIsoDate(pedido.desde), hasta: toIsoDate(pedido.hasta) }
})

/** Rango completo: no hay un rango valido elegido en la URL. */
const rangoCompleto = computed(() => rangoPedido.value.desde === null)

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
  const pedido = rangoPedido.value
  if (pedido.desde !== null) {
    return ampliarRango({ desde: pedido.desde, hasta: pedido.hasta })
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

/**
 * Si hoy esta dentro del rango que ha elegido la persona.
 *
 * El rango completo (sin `from` y `to` en la URL) no cuenta: ese lo sacaron
 * las barras, no la persona, y "Hoy" debe devolverle un rango alrededor de
 * hoy. Con un rango elegido que ya contiene a hoy, el boton solo centra y no
 * toca el rango.
 */
const hoyEnRangoElegido = computed(() => {
  const pedido = rangoPedido.value
  if (pedido.desde === null) return false
  const hoy = parseIsoDate(hoyIso.value)
  return hoy >= pedido.desde && hoy <= pedido.hasta
})

/**
 * Texto de cada columna elegida para una tarea.
 *
 * Lo calcula la vista, que tiene el feed: el panel de nombres solo pinta.
 * Los datos son los del feed, sin sumas ni cuentas.
 */
function celdasDe(tarea) {
  if (!tarea) return {}
  const celdas = {}
  for (const columna of columnasElegidas.value) {
    celdas[columna] = textoDeColumna(columna, tarea)
  }
  return celdas
}

/** Modelo del diagrama, ya con la barra pegada a cada fila. */
const layout = computed(() => {
  const { desde, hasta } = rangoEfectivo.value
  // La escala se estira al ancho del panel: los pixeles por dia suben hasta
  // llenar el ancho disponible, sin bajar del natural. Los dias del rango son
  // los mismos que usa `buildTimeAxis`. El factor de detalle multiplica esa
  // escala base: con 1 el resultado es el de siempre.
  const escalaEfectiva = escalaAjustada(
    escala.value,
    diffDays(desde, hasta) + 1,
    anchoPanel.value,
    zoom.value,
  )
  const modelo = buildLayout({
    items: barras.value,
    groupMode: groupBy.value,
    scale: escalaEfectiva,
    start: desde,
    end: hasta,
    nonWorkingDays: diasNoLaborables.value.map((dia) => toIsoDate(dia.date)),
    today: parseIsoDate(hoyIso.value),
    collapsed: colapsados.value,
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
  const tareasPorId = new Map((feed.value?.tasks ?? []).map((task) => [task.id, task]))
  modelo.bars = modelo.bars.map((barra) => ({
    ...barra,
    progress: avancePorTarea.get(barra.taskId) ?? 0,
    projectName: proyectoPorTarea.get(barra.taskId) ?? '',
    violates: (tareasPorId.get(barra.taskId)?.violations ?? []).length > 0,
  }))
  // Los vinculos del feed van al layout: la geometria de las flechas sale de
  // aca, de las barras visibles.
  modelo.dependencies = (feed.value?.dependencies ?? []).filter((vinculo) => {
    const tarea = tareasPorId.get(vinculo.task_id)
    const requisito = tareasPorId.get(vinculo.depends_on_id)
    return (
      tarea?.start != null && tarea?.end != null &&
      requisito?.start != null && requisito?.end != null
    )
  })
  // La columna de nombres lee el titulo, la persona y el proyecto de la fila,
  // no de la barra: se pegan aqui, en la unica pieza que tiene las dos.
  const barraPorFila = new Map(modelo.bars.map((barra) => [barra.rowIndex, barra]))
  // La fila de grupo lleva la clave de agrupacion: la etiqueta visible la
  // pone la vista, porque la clave no es el nombre que se lee. Tambien lleva
  // el resumen que se anuncia y el estado de colapso, que vive en la URL.
  modelo.rows = modelo.rows.map((fila) => {
    if (fila.type === 'group') {
      return {
        ...fila,
        label: etiquetaGrupo(fila.clave ?? fila.label),
        resumen: resumenDeGrupo(fila),
        colapsado: colapsados.value.has(fila.clave),
        color: fila.color ?? colorDeDepartamento(fila.clave),
      }
    }
    const barra = barraPorFila.get(fila.rowIndex)
    return {
      ...fila,
      barra,
      title: barra.title,
      assignedName: barra.assignedName,
      projectName: barra.projectName,
      celdas: celdasDe(tareasPorId.get(barra.taskId)),
    }
  })
  return modelo
})

/**
 * Dependencias de cada tarea, para el globo del diagrama.
 *
 * De cada vinculo del feed salen dos entradas: la tarea dependiente, que
 * exige al requisito, y el requisito, del que la dependiente cuelga. El
 * `relates` es simetrico: las dos tareas quedan como relacionadas.
 *
 * La vista es quien tiene el feed, asi que es quien arma el mapa; el chart
 * solo lo pinta.
 */
const dependencias = computed(() => {
  const tituloPorId = new Map(
    (feed.value?.tasks ?? []).map((task) => [task.id, task.title ?? task.name ?? '']),
  )
  const mapa = {}
  const anota = (id, entrada) => {
    if (id === null || id === undefined) return
    if (!mapa[id]) mapa[id] = []
    mapa[id].push(entrada)
  }
  for (const vinculo of feed.value?.dependencies ?? []) {
    const requisito = tituloPorId.get(vinculo.depends_on_id)
    const dependiente = tituloPorId.get(vinculo.task_id)
    if (requisito !== undefined) {
      anota(vinculo.task_id, {
        titulo: requisito,
        tipo: vinculo.type,
        sentido: vinculo.type === 'precedes' ? 'requisito' : 'relacionada',
      })
    }
    if (dependiente !== undefined) {
      anota(vinculo.depends_on_id, {
        titulo: dependiente,
        tipo: vinculo.type,
        sentido: vinculo.type === 'precedes' ? 'dependiente' : 'relacionada',
      })
    }
  }
  return mapa
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
  // Claves de hoy en cada escala: el dia exacto, su semana ISO y su mes. La
  // insignia "Hoy" va en la celda que lo contiene, no solo en la del dia.
  // `monthKey` lee los campos locales, asi que se le da una fecha local con
  // los numeros del dia: el mes es el de hoy en cualquier zona horaria.
  const [anioHoy, mesHoy, diaHoy] = hoy.split('-').map(Number)
  const claveHoy = {
    day: hoy,
    week: isoWeekKey(parseIsoDate(hoy)),
    month: monthKey(new Date(anioHoy, mesHoy - 1, diaHoy)),
  }
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
      if (!festivos.length) return
      // `ancho` es la etiqueta a ~6 px por letra: el rect del eje la lleva
      // con 12 px de margen. Si no cabe en la celda, la etiqueta se recorta
      // y el ancho es el del hueco, no el del texto recortado.
      const maxAncho = celda.width - 12
      let texto = etiqueta(festivos)
      let ancho = texto.length * 6
      if (ancho > maxAncho) {
        const maxChars = Math.max(1, Math.floor(maxAncho / 6) - 1)
        texto = `${texto.slice(0, maxChars)}…`
        ancho = maxAncho
      }
      festivo = { etiqueta: texto, ancho }
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
      hoy: celda.key === claveHoy[celda.kind],
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
  // La ruta critica se anuncia solo con el interruptor encendido: si el
  // diagrama no la marca, tampoco hay que contarla.
  if (tareasCriticas.value.has(taskId)) partes.push('En la ruta crítica.')
  const editable = editableDe(taskId)
  const etiqueta = partes.join(' ') + (editable ? '' : ' Solo lectura.')
  // La violacion se explica: esta barra empieza antes de que termine el
  // requisito. Sin violacion la etiqueta no se toca.
  const tarea = (feed.value?.tasks ?? []).find((item) => item.id === taskId)
  const requisitos = (tarea?.violations ?? []).map((id) => {
    const requisito = (feed.value?.tasks ?? []).find((item) => item.id === id)
    return requisito?.title ?? 'una dependencia'
  })
  if (!requisitos.length) return etiqueta
  return (
    etiqueta +
    ' Empieza antes de que termine ' +
    requisitos.join(', ') +
    '.'
  )
}

/** Lo que se lee en la descripcion del SVG. */
const descripcion = computed(() => {
  const tareas = layout.value.bars.length
  const desde = toIsoDate(rangoEfectivo.value.desde)
  const hasta = toIsoDate(rangoEfectivo.value.hasta)
  // Los grupos colapsados no aportan barras: se cuentan aparte, para que la
  // cuenta no parezca un recorte de tareas.
  const ocultos = colapsados.value.size
  const extra = ocultos
    ? ` ${ocultos} ${ocultos === 1 ? 'grupo colapsado' : 'grupos colapsados'}.`
    : ''
  return `${tareas} tareas, del ${desde} al ${hasta}.${extra}`
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
  const avisos = [avisoSoloLectura.value, avisoAlta.value].filter(Boolean)
  return avisos.length ? texto + ' ' + avisos.join(' ') : texto
})

/**
 * Aviso de alta de tarea cuando no hay proyecto en contexto.
 *
 * Con filtro de proyecto o agrupacion por proyecto el doble clic si tiene
 * destino: el aviso solo se gana cuando no lo tiene.
 */
const avisoAlta = computed(() => {
  if (projectFilter.value || groupBy.value === 'proyecto') return ''
  return 'Para crear una tarea, elige un proyecto.'
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

/**
 * Rango vigente, en texto largo: "Del 23 de noviembre al 3 de enero".
 *
 * El año sale solo cuando los dos extremos no son del mismo: si no, el
 * diagrama ya lo dice en la cabecera.
 */
function textoRango(desde, hasta) {
  const d = parseIsoDate(desde)
  const h = parseIsoDate(hasta)
  const mismoAnio = d.getUTCFullYear() === h.getUTCFullYear()
  const inicio = mismoAnio
    ? `${d.getUTCDate()} de ${monthName(d.getUTCMonth() + 1)}`
    : `${d.getUTCDate()} de ${monthName(d.getUTCMonth() + 1)} de ${d.getUTCFullYear()}`
  const fin = mismoAnio
    ? `${h.getUTCDate()} de ${monthName(h.getUTCMonth() + 1)}`
    : `${h.getUTCDate()} de ${monthName(h.getUTCMonth() + 1)} de ${h.getUTCFullYear()}`
  return `Del ${inicio} al ${fin}`
}

/** Rango vigente en texto largo, para el panel de rango. */
const rangoTexto = computed(() =>
  textoRango(rangoEfectivo.value.desde, rangoEfectivo.value.hasta),
)

/**
 * Escribe un filtro en la URL, que es donde vive el estado de la vista.
 *
 * Devuelve la navegacion: quien la espera sabe que la URL ya esta escrita y
 * que el diagrama se puede volver a pintar con el rango nuevo.
 */
function cambiarFiltro(patch) {
  const query = { ...route.query }
  for (const [key, value] of Object.entries(patch)) {
    if (value === '' || value === null || value === undefined) delete query[key]
    else query[key] = String(value)
  }
  return router.replace({ path: route.path, query })
}

/**
 * Elige o quita una columna del panel de nombres.
 *
 * La eleccion vive en la URL (`?cols=`, con las claves separadas por comas):
 * recargar deja el panel como estaba. Sin columnas elegidas, el parametro no
 * se escribe: el panel lleva solo la columna de la tarea.
 */
function alternarColumna(clave) {
  const elegidas = new Set(columnasElegidas.value)
  if (elegidas.has(clave)) elegidas.delete(clave)
  else elegidas.add(clave)
  const claves = COLUMNAS_GANTT.filter((columna) => elegidas.has(columna.key)).map(
    (columna) => columna.key,
  )
  cambiarFiltro({ cols: claves.join(',') })
}

/**
 * Enciende o apaga el destacado de la ruta critica.
 *
 * El estado vive en la URL (`?critical=1`): encendido queda el parametro,
 * apagado se quita. El enlace reproduce el diagrama con la cadena marcada o
 * sin ella.
 */
function alternarRutaCritica() {
  cambiarFiltro({ critical: rutaCriticaActiva.value ? '' : '1' })
}

/**
 * Ordena por una columna: primero ascendente, luego descendente, y la
 * tercera pulsacion deja las tareas como estaban.
 *
 * La ordenacion vive en la URL (`?sort=columna:sentido`). Ordena dentro del
 * grupo: el orden de los grupos no se mueve.
 */
function alternarOrden(columna) {
  const actual = orden.value
  if (!actual || actual.columna !== columna) {
    cambiarFiltro({ sort: `${columna}:asc` })
    return
  }
  if (actual.sentido === 'asc') {
    cambiarFiltro({ sort: `${columna}:desc` })
    return
  }
  cambiarFiltro({ sort: '' })
}

/**
 * Colapsa o despliega un grupo.
 *
 * El estado vive en la URL: `?collapsed=` lleva las claves de los grupos
 * colapsados, separadas por comas. Al cambiar el modo de agrupar, las claves
 * que no apliquen al grupo nuevo se pueden quedar en la URL: cada clave lleva
 * el tipo delante (`persona-12`), asi que no colapsan nada del otro modo.
 */
function alternarColapso(clave) {
  const nuevo = new Set(colapsados.value)
  if (nuevo.has(clave)) nuevo.delete(clave)
  else nuevo.add(clave)
  cambiarFiltro({ collapsed: [...nuevo].join(',') })
}

/** Colapsa todos los grupos del agrupamiento vigente. */
function colapsarTodo() {
  cambiarFiltro({ collapsed: clavesDeGrupos.value.join(',') })
}

/** Despliega todos los grupos: la lista de claves se vacia. */
function expandirTodo() {
  cambiarFiltro({ collapsed: '' })
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

/**
 * "Hoy": el rango a hoy y la columna de hoy centrada en el diagrama.
 *
 * Si el rango que ha elegido la persona ya contiene a hoy, no se toca: el
 * boton solo centra. Si no, el rango se lleva a hoy y cuatro semanas a cada
 * lado, como siempre.
 *
 * El centrado va DESPUES de que el diagrama este pintado con el rango
 * nuevo: el navegador recorta el desplazamiento al rango de scroll vigente, y
 * ese rango solo crece cuando el DOM ya tiene el ancho nuevo del lienzo.
 * Antes de eso, el centrado se perderia.
 */
async function goHoy() {
  const hoy = parseIsoDate(hoyIso.value)
  if (!hoyEnRangoElegido.value) {
    await cambiarFiltro({
      from: toIsoDate(addDays(hoy, -SEMANAS_HOY * 7)),
      to: toIsoDate(addDays(hoy, SEMANAS_HOY * 7)),
    })
    await nextTick()
  }
  chart.value?.centrarHoy()
}

function goCompleto() {
  cambiarFiltro({ from: null, to: null })
}

/**
 * Escribe el rango que propone el panel de rango.
 *
 * Las fechas van en ISO (`from` y `to`). Un extremo vacio se quita de la
 * URL: con los dos vacios el rango vuelve a ser el del plan, que es lo que
 * hacen el atajo "Todo el plan" del panel y el boton "Completo" de la barra.
 */
function aplicarRango({ desde, hasta }) {
  cambiarFiltro({ from: desde, to: hasta })
}

/** Factor dentro de los limites: el detalle nunca se sale del tope. */
function limitaZoom(valor) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, valor))
}

/**
 * Zoom continuo: el chart avisa del gesto y aqui se decide el factor.
 *
 * El delta va en pixeles (negativo acerca, positivo aleja) y se convierte en
 * un multiplicador del factor vigente: una muesca de rueda (100 px) cambia
 * el detalle un 19 %. El delta se acota para que una rueda disparada no
 * salte el detalle de golpe.
 */
function alZoomear(delta) {
  const paso = Math.max(-120, Math.min(120, Number(delta) || 0))
  const nuevo = limitaZoom(zoom.value * 2 ** (-paso / 400))
  if (nuevo === zoom.value) return
  zoom.value = nuevo
}

/** Mas detalle: un paso mas de pixeles por dia. */
function zoomMas() {
  zoom.value = limitaZoom(zoom.value * PASO_ZOOM)
}

/** Menos detalle: un paso menos de pixeles por dia. */
function zoomMenos() {
  zoom.value = limitaZoom(zoom.value / PASO_ZOOM)
}

/** Ajustar: vuelve al estado de partida, con el lienzo lleno del panel. */
function zoomAjustar() {
  zoom.value = 1
}

/**
 * Modo ampliado: el diagrama pasa a ocupar la ventana entera.
 *
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
 * Con un dialogo abierto el Escape es del dialogo, y con un gesto de arrastre
 * en juego es del gesto: en ninguno de los dos casos se sale del modo
 * ampliado, para que no se esconda el diagrama a la vez.
 */
function alTeclaGlobal(event) {
  if (event.key !== 'Escape') return
  if (selectedTaskId.value !== null || altaAbierta.value || cascada.value !== null) return
  if (chart.value?.arrastrando) return
  ampliado.value = false
}

/**
 * Descarga el calendario iCal del proyecto de contexto.
 *
 * El texto se pide por el cliente con token (no con un enlace, que no lleva
 * cabecera) y se convierte en un blob que el navegador guarda. El fallo no
 * toca el estado del diagrama: se avisa con su propio banner.
 */
async function exportarIcs() {
  exportandoIcs.value = true
  falloIcs.value = null
  try {
    const token = await auth.ensureSession()
    const idProyecto = Number(projectFilter.value)
    const texto = await projectsApi.calendar(token, idProyecto)
    const blob = new Blob([texto], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const ancla = document.createElement('a')
    ancla.href = url
    ancla.download = `coreplanner-${idProyecto}.ics`
    document.body.appendChild(ancla)
    ancla.click()
    ancla.remove()
    URL.revokeObjectURL(url)
    toast.success(`Calendario exportado: coreplanner-${idProyecto}.ics.`)
  } catch (err) {
    falloIcs.value = `No se pudo exportar el calendario: ${err.message}`
  } finally {
    exportandoIcs.value = false
  }
}

/**
 * Guarda las fechas nuevas cuando se mueve o redimensiona una barra.
 *
 * Optimista, como el Kanban: primero el PATCH y, aunque el servidor lo
 * rechace, se vuelve a pedir el diagrama, para que lo que se vea sea lo que
 * hay en la base.
 *
 * Antes de guardar se consulta la cascada: si mover esta tarea arrastra otras,
 * se abre el dialogo y nada se guarda hasta que se decida (aceptar o solo
 * esta). La cascada es una propuesta, nunca se aplica sola. Si la consulta
 * falla, se guarda la tarea arrastrada igualmente y el error se avisa.
 */
async function moverTarea({ taskId, start, end }) {
  const tareas = feed.value?.tasks ?? []
  const tarea = tareas.find((item) => item.id === taskId)
  const delta = tarea ? diffDays(parseIsoDate(tarea.start), parseIsoDate(start)) : 0
  cascadaFallo.value = null
  let propuestas = []
  if (delta !== 0) {
    try {
      const token = await auth.ensureSession()
      const respuesta = await dependenciesApi.cascade(token, taskId, delta)
      propuestas = (respuesta?.moves ?? []).filter((mov) => mov.task_id !== taskId)
    } catch {
      // Sin la propuesta se guarda la tarea arrastrada de todos modos; el
      // fallo se avisa sin bloquear.
      cascadaFallo.value =
        'No se pudo consultar la cascada: se guarda solo la tarea arrastrada.'
    }
  }
  if (propuestas.length) {
    cascada.value = { taskId, start, end, propuestas }
    return
  }
  await guardarFechas(taskId, start, end)
}

/** Guarda el PATCH de una barra y recarga el diagrama. */
async function guardarFechas(taskId, start, end) {
  saving.value = true
  try {
    await tasksApi.update(auth.token, taskId, dateChangePayload(start, end))
    toast.success(`Fechas actualizadas: ${start} a ${end}.`, { key: 'gantt-fechas' })
    errorGuardado.value = null
    guardadoPendiente.value = null
  } catch (err) {
    errorGuardado.value = err.message
    guardadoPendiente.value = { taskId, start, end }
    toast.error('No se ha podido guardar las fechas.')
  } finally {
    saving.value = false
  }
  await load()
}

/** Reintenta el ultimo guardado que fallo. */
async function reintentarGuardado() {
  const pendiente = guardadoPendiente.value
  if (!pendiente) return
  await guardarFechas(pendiente.taskId, pendiente.start, pendiente.end)
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
      await nextTick()
      // El foco real debe saltar a la barra nueva: sin esto el teclado se
      // queda en la barra anterior y las flechas siguen moviendo la misma.
      document
        .querySelector(`[data-testid="gantt-bar"][data-task-id="${barraEnfocada.value}"]`)
        ?.focus()
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

/**
 * Alta de tarea desde un doble clic en el hueco del diagrama.
 *
 * El proyecto destino es el del filtro (ruta o `?project=`) y, si no hay,
 * el del grupo de la fila cuando se agrupa por proyecto. Sin un solo
 * proyecto en contexto no hay alta, igual que sin permiso de escritura.
 */
function proyectoDestinoDe(fila) {
  const filtro = projectFilter.value
  if (filtro) return Number(filtro)
  if (groupBy.value !== 'proyecto') return null
  // La fila de barra lleva la tarea: su proyecto es el del grupo de la fila,
  // que es donde se agrupa.
  const tarea = (feed.value?.tasks ?? []).find((item) => item.id === fila.barra?.taskId)
  return tarea?.project_id ?? null
}

/**
 * Doble clic en el hueco: prepara y abre el alta de tarea.
 *
 * Sin proyecto destino o sin permiso de escritura el gesto no hace nada. Los
 * miembros se piden una vez por proyecto y se cachean en la vista. El seed
 * lleva la persona de la fila (fila de persona, o la tarea de la fila) y las
 * fechas del dia del doble clic; si cae en fin de semana, la semana
 * laborable de esa semana ISO, para que el alta nunca falle por rango.
 */
async function alCrear({ dateIso, fila }) {
  const proyecto = proyectoDestinoDe(fila)
  if (proyecto === null) return
  const editables = scope.value?.editable_project_ids ?? []
  if (!editables.includes(proyecto)) return
  if (!miembrosCache.has(proyecto)) {
    try {
      const token = await auth.ensureSession()
      const miembros = await projectsApi.members(token, proyecto)
      miembrosCache.set(proyecto, Array.isArray(miembros) ? miembros : [])
    } catch {
      miembrosCache.set(proyecto, [])
    }
  }
  altaMiembros.value = miembrosCache.get(proyecto) ?? []
  altaProyecto.value = proyecto
  // La persona de la fila es la de su tarea: en el grupo "Sin asignar" es
  // null y el formulario deja la reserva sin asignar.
  const tarea = (feed.value?.tasks ?? []).find((item) => item.id === fila.barra?.taskId)
  const persona = tarea?.assigned_to ?? null
  const dia = parseIsoDate(dateIso)
  const laborable = dia.getUTCDay() >= 1 && dia.getUTCDay() <= 5
  const dias = laborable ? null : weekWorkdays(isoWeekKey(dia))
  seedTarea.value = {
    title: '',
    assigned_to: persona,
    start_date: laborable ? dateIso : dias[0].date,
    end_date: laborable ? dateIso : dias[dias.length - 1].date,
    estimated_hours: '',
  }
  altaAbierta.value = true
}

function cerrarAlta() {
  altaAbierta.value = false
}

/**
 * Guarda la tarea nueva y recarga el diagrama.
 *
 * El exito sale como toast, el fallo va al banner de error de guardado. El
 * alta no se reintenta: repetirla crearia la tarea dos veces.
 */
async function guardarAlta(payload) {
  savingAlta.value = true
  guardadoPendiente.value = null
  try {
    const token = await auth.ensureSession()
    await tasksApi.create(token, altaProyecto.value, payload)
    altaAbierta.value = false
    toast.success(`Tarea creada: ${payload.title}.`)
    errorGuardado.value = null
  } catch (err) {
    errorGuardado.value = err.message
    toast.error('No se ha podido crear la tarea.')
  } finally {
    savingAlta.value = false
  }
  await load()
}

/** Titulo de una tarea por su identificador, para la lista de la cascada. */
function tituloTarea(id) {
  return (feed.value?.tasks ?? []).find((item) => item.id === id)?.title ?? `Tarea ${id}`
}

/* ------------------------------------------------------------------ */
/* Menu contextual del diagrama                                         */
/* ------------------------------------------------------------------ */

/**
 * El diagrama avisa de que se ha pedido un menu contextual.
 *
 * El chart sabe el contexto (la barra, la cabecera de grupo o el hueco); la
 * vista arma el arbol de items segun ese contexto y ejecuta la accion
 * elegida. Sin items no hay menu: un menu vacio no dice nada.
 */
function abrirMenuContexto(contexto) {
  const items = itemsDeContexto(contexto)
  if (!items.length) return
  menuContexto.value = {
    items,
    x: contexto.x,
    y: contexto.y,
    abridor: contexto.abridor ?? null,
    label: etiquetaDeContexto(contexto),
  }
}

/** Nombre accesible del menu, segun el contexto. */
function etiquetaDeContexto(contexto) {
  if (contexto.tipo === 'barra') return 'Menú de la tarea'
  if (contexto.tipo === 'grupo') return 'Menú del grupo'
  return 'Menú del diagrama'
}

/** Arbol de items del menu, segun el contexto. */
function itemsDeContexto(contexto) {
  if (contexto.tipo === 'barra') return itemsDeBarra(contexto.taskId)
  if (contexto.tipo === 'grupo') return itemsDeGrupo(contexto.clave)
  return itemsDeHueco(contexto)
}

/**
 * Items del menu de una barra.
 *
 * Sin permiso de escritura solo salen las dos acciones de lectura: abrir el
 * detalle e ir al tablero. El submenu de reasignacion sale con los miembros
 * que se tengan del proyecto: sin miembros cacheados no hay a quien
 * reasignar, y el item no sale.
 */
function itemsDeBarra(taskId) {
  const tarea = (feed.value?.tasks ?? []).find((item) => item.id === taskId)
  if (!tarea) return []
  const items = [{ label: 'Abrir detalle', accion: 'detalle', dato: tarea.id }]
  if (tarea.project_id !== null && tarea.project_id !== undefined) {
    items.push({
      label: 'Ir al tablero del proyecto',
      accion: 'tablero',
      dato: tarea.project_id,
    })
  }
  if (!editableDe(tarea.id)) return items
  const miembros = miembrosDeProyecto(tarea.project_id)
  if (miembros.length) {
    items.push({
      label: 'Reasignar a...',
      accion: 'reasignar',
      submenu: miembros.map((miembro) => ({
        label: miembro.name,
        accion: 'reasignar',
        dato: { taskId: tarea.id, persona: miembro.user_id, nombre: miembro.name },
      })),
    })
  }
  items.push({
    label: 'Cambiar estado',
    accion: 'estado',
    submenu: KANBAN_COLUMNS.map((columna) => ({
      label: columna.status === tarea.status ? `${columna.label} (actual)` : columna.label,
      accion: 'estado',
      dato: { taskId: tarea.id, estado: columna.status },
      disabled: columna.status === tarea.status,
    })),
  })
  items.push({
    label: 'Copiar las fechas',
    accion: 'copiar',
    dato: { inicio: tarea.start, fin: tarea.end },
  })
  return items
}

/**
 * Items del menu de un grupo: colapsar o expandir el grupo, y todos los del
 * agrupamiento vigente. El estado vive en la URL, como el de los botones.
 */
function itemsDeGrupo(clave) {
  return [
    {
      label: colapsados.value.has(clave) ? 'Expandir' : 'Colapsar',
      accion: 'colapsar',
      dato: clave,
    },
    { label: 'Colapsar todo', accion: 'colapsar-todo' },
    { label: 'Expandir todo', accion: 'expandir-todo' },
  ]
}

/**
 * Items del menu del hueco: crear la tarea en ese punto, como el doble clic.
 *
 * Sin proyecto en contexto o sin permiso de escritura el alta no se puede
 * hacer, y entonces el menu no se abre.
 */
function itemsDeHueco(contexto) {
  const proyecto = contexto.fila ? proyectoDestinoDe(contexto.fila) : null
  if (proyecto === null) return []
  if (!(scope.value?.editable_project_ids ?? []).includes(proyecto)) return []
  return [
    {
      label: 'Crear tarea aquí',
      accion: 'crear',
      dato: { dateIso: contexto.dateIso, fila: contexto.fila },
    },
  ]
}

/**
 * Miembros cacheados de un proyecto: los que se pidieron al abrir un alta.
 *
 * Sin cache no hay lista: el menu de reasignacion sale con los miembros que
 * se tengan y, si no hay ninguno, el item no aparece.
 */
function miembrosDeProyecto(projectId) {
  if (projectId === null || projectId === undefined) return []
  return miembrosCache.get(projectId) ?? []
}

/**
 * Accion elegida en el menu contextual.
 *
 * Cada accion es una operacion que ya existe: el detalle es el dialogo de la
 * vista, el tablero es la vista del proyecto, la reasignacion y el estado son
 * PATCH parciales de la tarea (los mismos que usa el tablero), la creacion
 * es el alta de la vista y el colapso es el estado que vive en la URL.
 */
async function ejecutarAccion(item) {
  const accion = item?.accion
  const dato = item?.dato
  if (accion === 'detalle') {
    abrirDetalle(dato)
    return
  }
  if (accion === 'tablero') {
    await router.push({ name: 'kanban', params: { id: dato } })
    return
  }
  if (accion === 'reasignar') {
    await guardarCambioDeTarea(
      dato.taskId,
      { assigned_to: dato.persona },
      `Responsable cambiado: ${dato.nombre}.`,
    )
    return
  }
  if (accion === 'estado') {
    await guardarCambioDeTarea(
      dato.taskId,
      { status: dato.estado },
      `La tarea pasa a ${columnLabel(dato.estado)}.`,
    )
    return
  }
  if (accion === 'copiar') {
    await copiarFechas(dato)
    return
  }
  if (accion === 'colapsar') {
    alternarColapso(dato)
    return
  }
  if (accion === 'colapsar-todo') {
    colapsarTodo()
    return
  }
  if (accion === 'expandir-todo') {
    expandirTodo()
    return
  }
  if (accion === 'crear') {
    await alCrear(dato)
  }
}

/**
 * Guarda un cambio de la tarea pedido desde el menu contextual.
 *
 * Es el PATCH parcial que usa el tablero (responsable y estado) y deja la
 * misma bitacora. El exito sale como toast y el error en el banner de la
 * vista, no en un toast suelto.
 */
async function guardarCambioDeTarea(taskId, cambios, mensaje) {
  try {
    await tasksApi.update(auth.token, taskId, cambios)
    toast.success(mensaje)
    errorGuardado.value = null
  } catch (err) {
    errorGuardado.value = err.message
    // El menu no se reintenta: el banner se queda con el error y sin accion.
    guardadoPendiente.value = null
  }
  await load()
}

/**
 * Copia las fechas de la tarea al portapapeles.
 *
 * El aviso es un toast: es la confirmacion de una accion terminada, no un
 * error de guardado.
 */
async function copiarFechas({ inicio, fin }) {
  if (!navigator.clipboard?.writeText) {
    toast.error('No se han podido copiar las fechas.')
    return
  }
  try {
    await navigator.clipboard.writeText(`${inicio} a ${fin}`)
    toast.success(`Fechas copiadas: ${inicio} a ${fin}.`)
  } catch {
    toast.error('No se han podido copiar las fechas.')
  }
}

/**
 * Acepta la cascada: se guarda la tarea arrastrada y, una a una, las
 * propuestas con sus fechas nuevas. Si un PATCH falla, se avisa y se para:
 * el resto de la propuesta no se aplica a media.
 */
async function aceptarCascada() {
  const pendiente = cascada.value
  if (!pendiente) return
  cascada.value = null
  let fallo = null
  saving.value = true
  // La cascada no se reintenta con el boton del banner: el reintento es del
  // arrastre, y aqui ya no vale.
  guardadoPendiente.value = null
  try {
    await tasksApi.update(
      auth.token,
      pendiente.taskId,
      dateChangePayload(pendiente.start, pendiente.end),
    )
    for (const mov of pendiente.propuestas) {
      try {
        await tasksApi.update(
          auth.token,
          mov.task_id,
          dateChangePayload(mov.start_date, mov.end_date),
        )
      } catch (err) {
        fallo = err
        break
      }
    }
    if (fallo) {
      errorGuardado.value = fallo.message
      toast.error('No se ha podido aplicar la cascada.')
    } else {
      toast.success(`Fechas actualizadas: ${pendiente.start} a ${pendiente.end}.`, {
        key: 'gantt-fechas',
      })
      errorGuardado.value = null
    }
  } catch (err) {
    errorGuardado.value = err.message
    toast.error('No se ha podido guardar las fechas.')
  } finally {
    saving.value = false
  }
  await load()
}

/** "Solo esta": se guarda la tarea arrastrada y nada mas. */
async function guardarSoloEsta() {
  const pendiente = cascada.value
  if (!pendiente) return
  cascada.value = null
  await guardarFechas(pendiente.taskId, pendiente.start, pendiente.end)
}

function cerrarCascada() {
  cascada.value = null
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
    errorStatus.value = null
  } catch (err) {
    error.value = err.message
    errorStatus.value = err.status ?? null
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
// Al colapsar un grupo sus barras desaparecen: la enfocada no puede seguir
// apunta a una barra que ya no esta.
watch(
  () => route.query.collapsed,
  () => {
    const id = barraEnfocada.value
    if (id === null) return
    if (layout.value.bars.some((barra) => barra.taskId === id)) return
    barraEnfocada.value = null
  },
)
// El Escape solo se escucha en modo ampliado: fuera de el no hay nada que
// cerrar y la tecla es de los dialogos y del arrastre de barras.
watch(ampliado, (activo) => {
  if (activo) document.addEventListener('keydown', alTeclaGlobal)
  else document.removeEventListener('keydown', alTeclaGlobal)
})
onBeforeUnmount(() => document.removeEventListener('keydown', alTeclaGlobal))
useTaskReload(load)
</script>

<template>
  <!--
    La vista ocupa el alto disponible (`h-full`) y es una columna flex: el
    diagrama se queda con el espacio que sobra y encoge con el que falta. El
    exito de un guardado sale como toast flotante, fuera de la columna; los
    avisos en linea son los de error y no empujan el diagrama.

    En modo ampliado la vista sale del armazon (`fixed inset-0`) y ocupa la
    ventana entera. No hay `Teleport` ni ancestro con `transform`, asi que
    los dialogos que se abren desde aqui siguen viendo la ventana.
  -->
  <div
    class="flex h-full min-h-0 flex-col"
    :class="ampliado ? 'fixed inset-0 z-40 overflow-auto bg-slate-50 p-3 sm:p-6' : ''"
  >
    <PageHeader class="shrink-0" title="Gantt" :subtitle="subtitle">
      <template #actions>
        <button
          v-if="projectFilter"
          type="button"
          class="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          :disabled="exportandoIcs"
          data-testid="gantt-export-ics"
          @click="exportarIcs"
        >
          {{ exportandoIcs ? 'Exportando...' : 'Exportar .ics' }}
        </button>
        <SegmentedControl
          v-model="escalaId"
          :options="opcionesEscala"
          label="Escala temporal"
          testid-prefix="gantt-scale"
        />
        <!--
          Detalle del diagrama: cuanto mas pixeles por dia, mas cerca se ve
          el rango. "Ajustar" devuelve el lienzo al ancho del panel.
        -->
        <div
          class="flex items-center gap-1"
          role="group"
          aria-label="Detalle del diagrama"
          title="Ctrl+rueda sobre el diagrama para acercar o alejar"
        >
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            aria-label="Menos detalle"
            :disabled="zoom <= ZOOM_MIN"
            data-testid="gantt-zoom-out"
            @click="zoomMenos"
          >
            −
          </button>
          <button
            type="button"
            class="h-8 rounded border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            aria-label="Ajustar al ancho"
            :disabled="zoom === 1"
            data-testid="gantt-zoom-fit"
            @click="zoomAjustar"
          >
            Ajustar
          </button>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            aria-label="Más detalle"
            :disabled="zoom >= ZOOM_MAX"
            data-testid="gantt-zoom-in"
            @click="zoomMas"
          >
            +
          </button>
        </div>
        <!--
          Modo ampliado: el diagrama a pantalla completa, por encima del
          armazon. El boton es el mismo al entrar y al salir, de modo que el
          foco no se pierde en ninguno de los dos momentos.
        -->
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          :aria-label="ampliado ? 'Salir de la vista ampliada' : 'Ampliar a pantalla completa'"
          :aria-pressed="ampliado"
          :title="ampliado ? 'Salir de la vista ampliada (Escape)' : 'Ampliar a pantalla completa'"
          data-testid="gantt-fullscreen"
          @click="alternarAmpliado"
        >
          <span class="inline-flex h-4 w-4">
            <AppIcon :name="ampliado ? 'compress' : 'expand'" />
          </span>
        </button>
      </template>
    </PageHeader>

    <!-- Fallo de la exportacion iCal: se avisa sin bloquear el diagrama. -->
    <AlertBanner
      v-if="falloIcs"
      variant="warning"
      class="mb-2 shrink-0"
      data-testid="gantt-export-ics-fallo"
    >
      {{ falloIcs }}
    </AlertBanner>

    <!--
      Rango del enlace que no vale: se avisa en linea y el diagrama cae al
      rango del plan, para que un enlace mal escrito no lo deje vacio.
    -->
    <AlertBanner
      v-if="avisoRango"
      variant="warning"
      class="mb-2 shrink-0"
      data-testid="gantt-range-warning"
    >
      {{ avisoRango }}
    </AlertBanner>

    <div class="mb-3 flex shrink-0 flex-wrap items-end gap-3" data-testid="gantt-filters">
      <FilterField
        label="Departamento"
        :options="opcionesDepartamento"
        :model-value="departmentFilter"
        testid="gantt-filter-department"
        @update:model-value="cambiarFiltro({ department: $event })"
      />

      <!-- En el espacio del proyecto el proyecto ya viene de la ruta. -->
      <FilterField
        v-if="!route.params.id"
        label="Proyecto"
        :options="opcionesProyecto"
        :model-value="projectFilter"
        testid="gantt-filter-project"
        @update:model-value="cambiarFiltro({ project: $event })"
      />

      <FilterField
        label="Agrupar por"
        :options="opcionesGrupo"
        :model-value="groupBy"
        testid="gantt-group-by"
        @update:model-value="cambiarFiltro({ group: $event })"
      />

      <!--
        Colapso de grupos: la cabecera de cada grupo es un boton que lo
        colapsa. Estos dos actuan sobre todos los grupos del agrupamiento
        vigente y escriben el mismo estado que los botones de la cabecera.
      -->
      <div
        v-if="groupBy !== 'sin'"
        class="flex items-center gap-1"
        role="group"
        aria-label="Colapso de grupos"
      >
        <button
          type="button"
          class="h-8 rounded border border-slate-300 bg-white px-3 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          :disabled="!clavesDeGrupos.length"
          data-testid="gantt-collapse-all"
          @click="colapsarTodo"
        >
          Colapsar todo
        </button>
        <button
          type="button"
          class="h-8 rounded border border-slate-300 bg-white px-3 text-sm text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
          :disabled="!colapsados.size"
          data-testid="gantt-expand-all"
          @click="expandirTodo"
        >
          Expandir todo
        </button>
      </div>

      <VisibilityPanel
        :personas="personasVisibilidad"
        :ids-ocultos="idsOcultos"
        :departamentos-ocultos="departamentosOcultos"
        :ocultos-count="ocultosCount"
        @alternar-persona="alternarPersona"
        @alternar-departamento="alternarDepartamento"
        @mostrar-todos="mostrarTodos"
      />

      <!--
        Columnas del panel de nombres: las elegibles van a la derecha de la
        columna de tareas. La eleccion vive en la URL.
      -->
      <GanttColumnsPanel
        :columnas="COLUMNAS_GANTT"
        :seleccionadas="columnasElegidas"
        @alternar="alternarColumna"
      />

      <!--
        Ruta critica: enciende el destacado de la cadena (el marco de las
        barras y el trazo grueso de las flechas que la cierran). El estado
        vive en la URL (`?critical=1`), asi que el enlace reproduce el
        diagrama con la cadena marcada o sin ella.
      -->
      <button
        type="button"
        class="h-8 rounded border px-3 text-sm font-medium"
        :class="
          rutaCriticaActiva
            ? 'border-siemens-900 bg-siemens-900 text-white'
            : 'border-slate-300 bg-white text-slate-700'
        "
        :aria-pressed="rutaCriticaActiva"
        data-testid="gantt-critical-toggle"
        @click="alternarRutaCritica"
      >
        Ruta crítica
      </button>

      <div class="flex items-center gap-1">
        <!--
          Rango de fechas: el panel elige el tramo que se ve y lo escribe en
          la URL. Es el mismo patron que el de columnas.
        -->
        <GanttRangePanel
          :desde="rangoElegido.desde"
          :hasta="rangoElegido.hasta"
          :texto="rangoTexto"
          @aplicar="aplicarRango"
        />
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
      class="flex min-h-0 flex-1 flex-col"
      :loading="loading"
      :error="error"
      :error-status="errorStatus"
      loading-label="Cargando el diagrama"
      error-test-id="gantt-warning"
      @retry="reintentar"
    >
      <p v-if="saving" class="shrink-0 text-sm text-slate-500">Guardando fechas...</p>

      <!-- Fallo de guardado: la carga salio bien, el PATCH no. Con "Reintentar"
           repite el ultimo arrastre; el alta no se reintenta. -->
      <AlertBanner
        v-if="errorGuardado"
        variant="error"
        class="mb-3 shrink-0"
        data-testid="gantt-error-guardado"
        :action-label="guardadoPendiente ? 'Reintentar' : ''"
        @action="reintentarGuardado"
      >
        {{ errorGuardado }}
      </AlertBanner>

      <!-- Fallo de la cascada: avisa sin bloquear; la tarea arrastrada se
           guardo igualmente. -->
      <AlertBanner
        v-if="cascadaFallo"
        variant="warning"
        class="mb-3 shrink-0"
        data-testid="cascada-fallo"
      >
        {{ cascadaFallo }}
      </AlertBanner>

      <ul
        v-if="miembrosVisibles.length || hayProvisional"
        class="mb-3 flex shrink-0 flex-wrap gap-3 text-xs text-slate-600"
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
        <li v-if="hayProvisional" class="flex items-center gap-1.5" data-testid="gantt-legend-provisional">
          <span
            class="inline-block h-3 w-3 rounded-sm border border-dashed border-slate-500 bg-white"
          />
          Provisional
        </li>
      </ul>

      <AlertBanner
        v-if="feed && feed.undated_task_ids.length"
        variant="warning"
        class="mb-3 shrink-0"
        data-testid="gantt-undated"
      >
        {{ avisoSinFechas }}
      </AlertBanner>

      <!--
        El diagrama se queda con el espacio que sobra y encoge con el que
        falta: el aviso que aparece al soltar no lo empuja fuera de la vista.
        El alto minimo lo mantiene visible en una ventana muy baja: ahi la
        vista se desplaza dentro de `main` en vez de dejar el grafico en cero.
      -->
      <div class="flex min-h-[200px] flex-1 flex-col">
        <GanttChart
          ref="chart"
          :layout="layout"
          :columnas="columnas"
          :bandas-cabecera="layout.axis.bands"
          :filas-nombres="layout.rows"
          :columnas-nombres="columnasPanel"
          :orden-nombres="orden"
          :editable-de="editableDe"
          :barra-enfocada="barraEnfocada"
          :etiqueta-de="etiquetaDe"
          :dependencias="dependencias"
          :tareas-criticas="tareasCriticas"
          :descripcion="descripcion"
          :aviso="avisoSoloLectura"
          :menu-abierto="menuContexto !== null"
          @abrir="abrirDetalle"
          @seleccionar="barraEnfocada = $event"
          @tecla="alPulsarTecla"
          @mover="moverTarea"
          @crear="alCrear"
          @ancho-panel="anchoPanel = $event"
          @zoom="alZoomear"
          @colapsar="alternarColapso"
          @ordenar="alternarOrden"
          @contexto="abrirMenuContexto"
        />
      </div>
    </AsyncState>

    <!--
      Menu contextual del diagrama: lo abre el clic derecho o el teclado
      (`Mayus+F10` o la tecla `Menu` con la barra enfocada). El arbol de items
      lo arma la vista segun el contexto; el componente solo lo pinta y lo
      opera con el teclado.
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

    <TaskDetailDialog
      :open="selectedTaskId !== null"
      :task-id="selectedTaskId"
      :can-edit="selectedTaskId !== null && editableDe(selectedTaskId)"
      @close="selectedTaskId = null"
      @saved="load"
      @deleted="selectedTaskId = null; load()"
    />

    <!-- Alta por doble clic en el hueco: mismo patron que el desglose de celda. -->
    <ModalDialog
      :open="altaAbierta"
      title="Nueva tarea"
      size="md"
      @close="cerrarAlta"
    >
      <TaskForm
        :task="seedTarea"
        :members="altaMiembros"
        form-id="gantt-task-form"
        @save="guardarAlta"
      />
      <template #footer="{ submit }">
        <button
          type="button"
          class="rounded border border-slate-300 px-3 py-2 text-sm"
          @click="cerrarAlta"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="submit"
          :disabled="savingAlta"
          class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {{ savingAlta ? 'Guardando...' : 'Guardar' }}
        </button>
      </template>
    </ModalDialog>

    <!-- Cascada de dependencias al soltar una barra: nada se guarda hasta
         que se decide aqui. -->
    <ModalDialog
      :open="cascada !== null"
      title="Cascada de dependencias"
      :subtitle="
        cascada
          ? `Mover esta tarea arrastra ${cascada.propuestas.length} tarea${
              cascada.propuestas.length === 1 ? '' : 's'
            } mas.`
          : ''
      "
      size="md"
      @close="cerrarCascada"
    >
      <p class="text-sm text-slate-600">
        Propuesta: si se acepta, se guardan la tarea arrastrada y estas con
        sus fechas nuevas.
      </p>
      <ul class="mt-3 space-y-1 text-sm" data-testid="cascada-moves">
        <li
          v-for="mov in cascada?.propuestas ?? []"
          :key="mov.task_id"
          class="flex items-baseline justify-between gap-3"
          :data-testid="`cascada-move-${mov.task_id}`"
        >
          <span class="truncate">{{ tituloTarea(mov.task_id) }}</span>
          <span class="shrink-0 text-xs text-slate-500">{{ mov.start_date }} a {{ mov.end_date }}</span>
        </li>
      </ul>
      <template #footer>
        <button
          type="button"
          class="rounded border border-slate-300 px-3 py-2 text-sm"
          :disabled="saving"
          data-testid="cascada-solo-esta"
          @click="guardarSoloEsta"
        >
          Solo esta
        </button>
        <button
          type="button"
          class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          :disabled="saving"
          data-testid="cascada-aceptar"
          @click="aceptarCascada"
        >
          {{ saving ? 'Guardando...' : 'Aceptar' }}
        </button>
      </template>
    </ModalDialog>
  </div>
</template>
