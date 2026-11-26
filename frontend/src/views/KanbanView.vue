<script setup>
/**
 * Tablero Kanban del proyecto.
 *
 * Las tareas llegan agrupadas por estado desde el backend, con su contador
 * y sus horas ya sumados: el frontend no suma horas. Mover una tarjeta se
 * guarda con el endpoint de orden (`PUT .../tasks/order`), que mueve la
 * tarjeta a la columna donde se suelta y deja esa columna en el orden
 * pedido; el cambio de estado por el desplegable usa el mismo endpoint con
 * la tarjeta al final.
 *
 * La tarjeta se mueve de dos maneras: arrastrarla con el raton hasta otra
 * columna o elegir el estado en su desplegable. El titulo, las horas y el
 * responsable se editan en la propia tarjeta; el dialogo del detalle sigue
 * siendo la puerta de la descripcion, el checklist y los comentarios.
 *
 * Si la persona no tiene permiso de escritura en el proyecto, el tablero se
 * ve en solo lectura: el desplegable no cambia de estado y la tarjeta no se
 * puede arrastrar. El criterio es el mismo que usa el armazon: los proyectos
 * editables de quien entra.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { meApi, projectsApi, tasksApi } from '../api/client'
import { useArrastre } from '../composables/useArrastre'
import { useTaskReload } from '../composables/useTaskReload'
import AlertBanner from '../components/common/AlertBanner.vue'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import TaskDetailDialog from '../components/TaskDetailDialog.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { useTaskStatusesStore } from '../stores/taskStatuses'
import { useToastStore } from '../stores/toast'
import {
  DEFAULT_TASK_STATUSES,
  columnAt,
  columnLabel,
  estadosCon,
  formatHours,
  statusPill,
} from '../utils/kanban'
import { localDateKey } from '../utils/month'

const props = defineProps({ id: { type: [String, Number], required: true } })

const tasks = ref([])
const error = ref(null)
/**
 * Codigo HTTP del ultimo error de carga.
 *
 * Lo necesita el aviso: un 4xx (falta el permiso, el proyecto no existe)
 * no se reintenta, porque volver a pedirlo daria el mismo fallo.
 */
const errorStatus = ref(null)
/** Aviso que no tapa el tablero: un rechazo del servidor al mover una tarea. */
const aviso = ref(null)
const loading = ref(true)
const saving = ref(false)
const draggingId = ref(null)
const hoverColumn = ref(null)
const columnElements = ref([])
/** Punto donde se agarro la tarjeta: la copia sale desde ahi. */
const dragOffset = ref({ x: 0, y: 0 })
/** Ambito de quien entra: rol y proyectos en los que puede escribir. */
const scope = ref(null)
/** Miembros del proyecto: los responsables de las tarjetas. */
const members = ref([])
/** Tarea abierta en el panel de detalle. */
const selectedTaskId = ref(null)
/**
 * Edicion inline en curso: una sola a la vez, por tarjeta y campo. El campo
 * que se esta editando no abre el detalle con el clic que lo termina, como
 * el que sigue a un arrastre no debe abrir nada.
 */
const editando = ref(null)
/**
 * Alta inline al pie de cada columna, con el minimo de tarea: titulo, horas
 * y responsable. Las fechas precargan a hoy. El formulario se crea cuando
 * llega la lista de estados: los estados son del backend, no una constante.
 */
const nuevas = ref({})
/**
 * Columna con el formulario de alta abierto, si la hay.
 *
 * Solo una columna muestra el formulario a la vez: al abrir otra se cierra la
 * anterior. El pie de cada columna muestra por defecto un boton fantasma de
 * alta, que es lo unico visible hasta que se abre el formulario.
 */
const altaAbierta = ref(null)
/** Elemento del input de titulo del formulario abierto, para darle el foco. */
const titleInput = ref(null)

const auth = useAuthStore()
const store = useProjectsStore()
const toast = useToastStore()
const statusStore = useTaskStatusesStore()

/** Claves de los estados que usan las tareas que se estan ensenando. */
const clavesUsadas = computed(() => [...new Set(tasks.value.map((task) => task.status))])

/**
 * Estados a pintar, en el orden que el backend fija.
 *
 * Con la lista vacia (no cargada o peticion fallada) se cae en los cuatro
 * por defecto, que son los del alta del proyecto. A esa lista siempre se
 * anaden los estados que usan las tareas y no estan en ella: si la peticion
 * de estados falla, la tarea no desaparece del tablero por eso.
 */
const estados = computed(() => {
  const lista = statusStore.statesOf(props.id)
  return estadosCon(lista.length ? lista : DEFAULT_TASK_STATUSES, clavesUsadas.value)
})

/** Si el tablero entero esta vacio: aviso de primera carga, sin columnas. */
const tieneTarjetas = computed(() => tasks.value.length > 0)

/**
 * Color del proyecto para la franja de la tarjeta.
 *
 * Lo da la tienda de proyectos (color de cada proyecto); sin color ni sin
 * proyecto cargado, la franja queda transparente.
 */
const estiloProyecto = computed(() => {
  const proyecto = store.projects.find((item) => String(item.id) === String(props.id))
  return proyecto?.color ? { backgroundColor: proyecto.color } : { backgroundColor: 'transparent' }
})

/** Cada columna con formulario nuevo se asegura su formulario al llegar. */
watch(
  estados,
  (lista) => {
    for (const estado of lista) {
      if (!nuevas.value[estado.key]) {
        nuevas.value[estado.key] = { title: '', hours: '', assigned_to: '' }
      }
    }
  },
  { immediate: true },
)

/**
 * Si la persona puede escribir en el proyecto abierto.
 *
 * Es el mismo criterio que usa el armazon: el proyecto tiene que estar entre
 * los editables de quien entra. Sin ambito no hay permiso.
 */
const canEdit = computed(() => {
  const editable = scope.value?.editable_project_ids
  if (!editable) return false
  return editable.includes(Number(props.id))
})

/**
 * Lo que se lee encima del tablero: cambia con el permiso.
 *
 * Hasta que llega el ambito no se afirma nada: el texto generico es el de
 * siempre y solo se avisa de la solo lectura cuando ya se sabe.
 */
const subtitle = computed(() =>
  scope.value && !canEdit.value
    ? 'Solo lectura: no puedes mover las tarjetas de este proyecto.'
    : 'Arrastra una tarjeta a otra columna o cambia su estado en el desplegable.',
)

/** La tarjeta que se esta arrastrando: la copia que sigue al cursor. */
const draggedTask = computed(() => tasks.value.find((task) => task.id === draggingId.value) ?? null)

/**
 * El tablero, con las tareas de cada columna en su orden y los totales del
 * feed: el contador y las horas los calcula el backend.
 */
const columnas = ref([])

const board = computed(() => {
  // El orden lo da el feed del proyecto (columnas del backend) y, si no
  // llega, el orden de la lista de estados.
  const orden = columnas.value.length
    ? columnas.value.map((column) => column.status)
    : estados.value.map((estado) => estado.key)
  return orden.map((status) => {
    const estado = estados.value.find((item) => item.key === status)
    const datos = columnas.value.find((c) => c.status === status) ?? {}
    return {
      status,
      label: estado?.label ?? status,
      tasks: tasks.value.filter((task) => task.status === status),
      task_count: datos.task_count ?? 0,
      estimated_hours: datos.estimated_hours ?? 0,
    }
  })
})

function columnIndexOf(status) {
  return estados.value.findIndex((c) => c.key === status)
}

function columnAtPoint(x, y) {
  const rects = columnElements.value.map((element) =>
    element ? element.getBoundingClientRect() : null,
  )
  return columnAt(x, y, rects, estados.value)
}

/**
 * Indice de insercion dentro de la columna, por la y del puntero.
 *
 * Es el hueco de las tarjetas de la columna cuyo punto medio queda por
 * debajo del puntero: la primera que cumpla. El rectangulo lo da el DOM en
 * el momento de la soltura, con las tarjetas de la columna destino en su
 * orden.
 */
function indiceDeInsercion(status, y, tareaId) {
  const section = columnElements.value[columnIndexOf(status)]
  if (!section) return 0
  // La tarjeta arrastrada sigue en el DOM y no cuenta: el hueco se mide sobre
  // las demas, la misma lista con la que se monta el orden final.
  const elementos = [...section.querySelectorAll('article[data-testid="kanban-card"]')].filter(
    (element) => Number(element.dataset.taskId) !== tareaId,
  )
  for (let i = 0; i < elementos.length; i += 1) {
    const caja = elementos[i].getBoundingClientRect()
    if (y < (caja.top + caja.bottom) / 2) return i
  }
  return elementos.length
}

function fantasmaDe(pendiente, event) {
  return {
    x: event.clientX - dragOffset.value.x,
    y: event.clientY - dragOffset.value.y,
    tarea: pendiente.datos.tarea,
  }
}

function alMover(pendiente, event) {
  draggingId.value = pendiente.datos.tarea.id
  hoverColumn.value = columnAtPoint(event.clientX, event.clientY)?.key ?? null
}

/** Al soltar: la tarjeta cae en la columna destino, en el hueco del puntero. */
function alSoltar(pendiente, event) {
  const target = columnAtPoint(event.clientX, event.clientY)
  if (target) ordenarTarea(pendiente.datos.tarea, target.key, event.clientY)
}

function alAnular() {
  draggingId.value = null
  hoverColumn.value = null
}

const drag = useArrastre({
  fantasmaDe,
  alMover,
  alConfirmar: alSoltar,
  alAnular,
})
// El fantasma se declara en primer nivel para que la plantilla lo desarrole:
// una referencia anidada en un objeto plano no se desarrolla sola y el v-if
// quedaria siempre en true.
const fantasma = drag.fantasma

function empezarArrastre(task, event) {
  if (!canEdit.value) return
  if (event.target.closest('select, button, input, a')) return
  // Sin esto el navegador sigue con su seleccion de texto mientras se arrastra
  // y el resaltado azul compite con el gesto.
  event.preventDefault()
  // La copia sale desde el punto donde se ha agarrado la tarjeta, para que no
  // salte de golpe al empezar el arrastre.
  const caja = event.currentTarget.getBoundingClientRect()
  dragOffset.value = { x: event.clientX - caja.left, y: event.clientY - caja.top }
  drag.empezarArrastre({ contexto: { tarea: task }, event })
}

/**
 * Guarda la tarjeta en la columna destino y en el orden donde se suelta.
 *
 * `y` es la posicion vertical de la soltura: con ella se calcula el indice
 * de insercion. Si la tarjeta no cambia de columna, se reordena igual: la
 * operacion es la misma, con la lista de la columna destino.
 */
async function ordenarTarea(task, status, y) {
  if (!canEdit.value) {
    // Red de seguridad: el arrastre no empieza sin permiso, asi que aqui
    // solo llega si el permiso cambia con la tarjeta en pantalla.
    aviso.value = 'No tienes permiso de escritura en este proyecto.'
    return
  }
  const columna = board.value.find((c) => c.status === status)
  const otras = (columna?.tasks ?? []).filter((t) => t.id !== task.id)
  const indice = indiceDeInsercion(status, y, task.id)
  const idsFinales = [...otras.slice(0, indice).map((t) => t.id), task.id, ...otras.slice(indice).map((t) => t.id)]
  saving.value = true
  aviso.value = null
  try {
    await tasksApi.reorder(auth.token, props.id, {
      task_id: task.id,
      status,
      task_ids: idsFinales,
    })
    toast.success(`"${task.title}" pasa a ${columnLabel(status, estados.value)}.`)
  } catch (err) {
    // El aviso va aparte del error de la vista: el tablero no se reemplaza
    // por un fallo al mover una tarjeta, y la recarga que viene despues no
    // se lleva el mensaje por delante.
    aviso.value = `No se ha podido mover la tarea: ${err.message}`
  } finally {
    saving.value = false
    await load()
  }
}

/** El desplegable de estado: la tarjeta va al final de la columna destino. */
async function moveFromSelect(task, event) {
  const status = event.target.value
  if (status === task.status) return
  const columna = board.value.find((c) => c.status === status)
  const idsFinales = [
    ...(columna?.tasks ?? []).filter((t) => t.id !== task.id).map((t) => t.id),
    task.id,
  ]
  saving.value = true
  aviso.value = null
  try {
    await tasksApi.reorder(auth.token, props.id, {
      task_id: task.id,
      status,
      task_ids: idsFinales,
    })
    toast.success(`"${task.title}" pasa a ${columnLabel(status, estados.value)}.`)
  } catch (err) {
    aviso.value = `No se ha podido mover la tarea: ${err.message}`
  } finally {
    saving.value = false
    await load()
  }
}

/**
 * Un clic en la tarjeta abre su detalle.
 *
 * Los controles de la tarjeta (desplegables e inputs inline) se quedan
 * donde estan para la edicion rapida, asi que el clic que llega desde dentro
 * de ellos no cuenta. Un arrastre tampoco cuenta: soltar la tarjeta en su
 * propia columna no debe abrir nada.
 */
function onCardClick(task, event) {
  if (event.target.closest('select, button, input, a')) return
  if (editando.value && editando.value.id === task.id) return
  // El clic que sigue al arrastre no abre nada: la tarjeta acaba de moverse.
  // La bandera se resetea sola en el siguiente mousedown.
  if (drag.movido()) return
  selectedTaskId.value = task.id
}

/** Cierra el panel de detalle y vuelve a pintar el tablero. */
function onTaskDeleted() {
  selectedTaskId.value = null
  load()
}

/** Empieza la edicion inline de un campo de la tarjeta. */
function abrirEdicion(task, campo) {
  if (!canEdit.value) return
  const valor = campo === 'title' ? task.title : formatHours(task.estimated_hours).replace(' h', '')
  editando.value = { id: task.id, campo, valor: String(valor ?? '') }
}

/** Guarda la edicion inline con un PATCH parcial de la tarea. */
async function guardarEdicion(task) {
  const { id, campo, valor } = editando.value ?? {}
  if (!campo || valor == null) return
  editando.value = null
  if (campo === 'title') {
    const titulo = String(valor).trim()
    if (!titulo || titulo === task.title) return
    await guardarCambio(task, { title: titulo })
    return
  }
  if (campo === 'estimated_hours') {
    const horas = Number.parseFloat(valor)
    if (!Number.isFinite(horas) || horas < 0) return
    await guardarCambio(task, { estimated_hours: horas.toFixed(2) })
  }
}

/** Cambia el responsable desde el desplegable de la tarjeta. */
async function asignar(task, event) {
  const valor = event.target.value
  // El null explicito es la desasignacion: el PATCH es parcial, asi que omitir
  // el campo no desasignaria, y aqui el campo siempre va presente.
  await guardarCambio(task, { assigned_to: valor === '' ? null : Number(valor) })
}

async function guardarCambio(task, cambios) {
  saving.value = true
  aviso.value = null
  try {
    await tasksApi.update(auth.token, task.id, cambios)
  } catch (err) {
    aviso.value = `No se ha podido guardar la tarea: ${err.message}`
  } finally {
    saving.value = false
    await load()
  }
}

/**
 * Abre el formulario de alta de una columna y cierra el de las demas.
 *
 * El input de titulo recibe el foco al abrir: el formulario se monta en el
 * mismo tick, asi que el foco se pide tras el siguiente render.
 */
function abrirAlta(status) {
  altaAbierta.value = status
  nextTick(() => {
    // El ref se repite por columna: Vue lo rellena como lista.
    const el = Array.isArray(titleInput.value) ? titleInput.value[0] : titleInput.value
    el?.focus?.()
  })
}

/** Cierra el formulario de alta abierto, si lo hay. */
function cerrarAlta() {
  altaAbierta.value = null
}

/** Alta inline: crea la tarea en la columna donde esta el formulario. */
async function crearTarea(status) {
  const alta = nuevas.value[status]
  if (!alta || !alta.title.trim()) return
  saving.value = true
  aviso.value = null
  // Fecha local, no UTC: a las 08:00 con UTC+2 la fecha UTC seria ayer.
  const hoy = localDateKey()
  const horas = Number.parseFloat(alta.hours)
  try {
    await tasksApi.create(auth.token, props.id, {
      title: alta.title.trim(),
      assigned_to: alta.assigned_to === '' ? null : Number(alta.assigned_to),
      estimated_hours: Number.isFinite(horas) && horas >= 0 ? horas.toFixed(2) : '0.00',
      start_date: hoy,
      end_date: hoy,
    })
    toast.success(`Tarea "${alta.title.trim()}" creada.`)
    alta.title = ''
    alta.hours = ''
    alta.assigned_to = ''
    cerrarAlta()
  } catch (err) {
    aviso.value = `No se ha podido crear la tarea: ${err.message}`
  } finally {
    saving.value = false
    await load()
  }
}

async function load() {
  try {
    const token = await auth.ensureSession()
    const [data, ambito, equipo] = await Promise.all([
      projectsApi.kanban(token, props.id),
      // El ambito va aparte: si no se puede leer, el tablero se ve en solo
      // lectura, pero se ve. Los estados igual: sin lista, los por defecto.
      meApi.get(token).catch(() => null),
      projectsApi.members(token, props.id).catch(() => []),
      statusStore.loadProject(token, props.id).catch(() => []),
      // La franja de la tarjeta lleva el color del proyecto: se asegura la
      // lista, y si no llega, la franja queda transparente.
      store.ensureProjects(token).catch(() => []),
    ])
    columnas.value = data.columns ?? []
    tasks.value = columnas.value.flatMap((column) => column.tasks ?? [])
    scope.value = ambito
    members.value = equipo ?? []
    error.value = null
    errorStatus.value = null
  } catch (err) {
    error.value = err.message
    errorStatus.value = err.status ?? null
  } finally {
    loading.value = false
  }
}

/** Vuelve a pedir el tablero y enseña el esqueleto mientras llega. */
async function reintentar() {
  loading.value = true
  await load()
}

onMounted(load)
watch(() => props.id, load)
useTaskReload(load)
onBeforeUnmount(() => drag.anular())
</script>

<template>
  <div>
    <PageHeader title="Tablero Kanban" :subtitle="subtitle">
      <template #actions>
        <p v-if="saving" class="text-cp-xs text-texto-tenue">Guardando...</p>
      </template>
    </PageHeader>

    <AlertBanner
      v-if="aviso"
      variant="warning"
      class="mb-2"
      data-testid="kanban-warning"
      dismissible
      @dismiss="aviso = null"
    >
      {{ aviso }}
    </AlertBanner>

    <AsyncState
      :loading="loading"
      :error="error"
      :error-status="errorStatus"
      loading-label="Cargando el tablero"
      @retry="reintentar"
    >
      <!-- El numero de columnas lo da la lista de estados, no una constante. -->
      <div v-if="!tieneTarjetas" class="mb-4 rounded-tarjeta border border-dashed border-borde-fuerte bg-tarjeta p-6 text-center">
        <p class="text-cp-sm font-semibold text-texto-marca">Este proyecto todavía no tiene tareas</p>
        <p class="mt-1 text-cp-xs text-texto-tenue">
          Las tareas que crees aparecerán en la primera columna del tablero.
        </p>
      </div>
      <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
        <section
          v-for="(columna, index) in board"
          :key="columna.status"
          :ref="(element) => (columnElements[index] = element)"
          class="flex min-h-32 flex-col rounded-control border bg-tarjeta-suave p-2 transition-colors"
          :class="hoverColumn === columna.status ? 'border-primario bg-tarjeta' : 'border-borde'"
        >
          <h2 class="mb-2 flex items-center justify-between gap-2 text-cp-sm font-semibold text-texto">
            <span class="truncate">{{ columna.label }}</span>
            <span class="shrink-0 rounded-pastilla bg-tarjeta px-2 py-0.5 font-mono text-cp-micro tabular-nums text-texto-suave">
              {{ columna.task_count }}
              {{ columna.task_count === 1 ? 'tarea' : 'tareas' }} ·
              {{ formatHours(columna.estimated_hours) }}
            </span>
          </h2>

          <article
            v-for="task in columna.tasks"
            :key="task.id"
            class="group relative mb-2 select-none overflow-hidden rounded-control border border-borde bg-tarjeta p-3 shadow-control transition-shadow last:mb-0 hover:shadow-tarjeta"
            :class="[
              canEdit ? 'cursor-grab' : 'cursor-default',
              draggingId === task.id ? 'opacity-60' : '',
            ]"
            data-testid="kanban-card"
            :data-task-id="task.id"
            @mousedown="empezarArrastre(task, $event)"
            @click="onCardClick(task, $event)"
          >
            <!-- Franja de color del proyecto: el color lo decide el backend -->
            <span
              class="absolute inset-y-0 left-0 w-1"
              :style="estiloProyecto"
              aria-hidden="true"
            ></span>

            <p
              v-if="!(editando && editando.id === task.id && editando.campo === 'title')"
              class="pl-2 text-cp-sm font-semibold text-texto"
              @dblclick="abrirEdicion(task, 'title')"
            >
              {{ task.title }}
            </p>
            <input
              v-else
              :value="editando.valor"
              type="text"
              class="w-full rounded-control border border-borde-fuerte bg-tarjeta px-2 py-1 text-cp-sm text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              @input="editando.valor = $event.target.value"
              @keyup.enter="guardarEdicion(task)"
              @keyup.esc="editando = null"
              @blur="guardarEdicion(task)"
              @dblclick.stop
            />
            <div class="mt-2 flex flex-wrap items-center gap-1.5 pl-2">
              <select
                :value="task.assigned_to ?? ''"
                :disabled="!canEdit"
                class="min-h-10 max-w-[9rem] rounded-control border border-borde-fuerte bg-tarjeta-suave px-1.5 py-0.5 text-cp-xs text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:cursor-not-allowed disabled:border-borde disabled:bg-tarjeta-suave disabled:text-texto-tenue"
                :title="canEdit ? 'Cambiar el responsable de la tarea' : 'Solo lectura'"
                @change="asignar(task, $event)"
              >
                <option value="">Sin asignar</option>
                <option v-for="member in members" :key="member.user_id" :value="member.user_id">
                  {{ member.name }}
                </option>
              </select>
              <span
                v-if="!(editando && editando.id === task.id && editando.campo === 'estimated_hours')"
                class="rounded-control bg-primario-fuerte px-1.5 py-0.5 font-mono text-cp-xs font-semibold tabular-nums text-sobre-primario"
                @dblclick="abrirEdicion(task, 'estimated_hours')"
              >
                {{ formatHours(task.estimated_hours) }}
              </span>
              <input
                v-else
                :value="editando.valor"
                type="number"
                min="0"
                step="0.25"
                class="w-16 rounded-control border border-borde-fuerte bg-tarjeta px-1.5 py-0.5 font-mono text-cp-xs text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                @input="editando.valor = $event.target.value"
                @keyup.enter="guardarEdicion(task)"
                @keyup.esc="editando = null"
                @blur="guardarEdicion(task)"
                @dblclick.stop
              />
              <span v-if="task.start_date" class="font-mono text-cp-xs text-texto-tenue">
                {{ task.start_date }} &rarr; {{ task.end_date }}
              </span>
            </div>
            <select
              :value="task.status"
              :disabled="!canEdit"
              class="mt-2 ml-2 w-full min-h-10 rounded-pastilla px-2 py-0.5 text-cp-xs font-semibold transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:cursor-not-allowed disabled:opacity-70"
              :style="statusPill(task.status, estados)"
              :title="canEdit ? 'Cambiar el estado de la tarea' : 'Solo lectura'"
              @change="moveFromSelect(task, $event)"
            >
              <option v-for="option in estados" :key="option.key" :value="option.key">
                {{ option.label }}
              </option>
            </select>
          </article>

          <!--
            Alta inline al pie de la columna. El pie solo muestra un boton
            fantasma; al pulsarlo se monta el formulario de esa columna y el
            de las demas se cierra. Escape lo cierra sin crear nada.
          -->
          <!--
            Hueco de destino: la tarjeta cae al pie de las tarjetas de la columna
            de destino. La posicion exacta dentro de la columna la calcula el
            arrastre al soltar.
          -->
          <div
            v-if="draggingId !== null && hoverColumn === columna.status"
            class="mb-2 flex min-h-14 items-center justify-center rounded-control border border-dashed border-primario bg-primario-suave text-cp-xs font-medium text-primario-fuerte"
            aria-hidden="true"
          >
            Soltar aquí
          </div>
          <div
            v-if="!columna.tasks.length"
            class="flex min-h-14 flex-1 items-center justify-center rounded-control border border-dashed border-borde px-3 py-4 text-center text-cp-xs text-texto-tenue"
          >
            Sin tareas
          </div>
          <button
            v-if="canEdit && altaAbierta !== columna.status"
            type="button"
            class="mt-2 inline-flex min-h-10 w-full items-center gap-1.5 rounded-control px-2 py-1.5 text-left text-cp-xs font-medium text-texto-tenue transition-colors hover:bg-tarjeta hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            data-testid="kanban-add-task"
            @click="abrirAlta(columna.status)"
          >
            + Anadir tarea
          </button>
          <form
            v-if="canEdit && altaAbierta === columna.status"
            class="mt-2 space-y-1.5 border-t border-borde pt-2"
            data-testid="kanban-new-task"
            @submit.prevent="crearTarea(columna.status)"
            @keydown.esc="cerrarAlta()"
          >
            <input
              v-model="nuevas[columna.status].title"
              ref="titleInput"
              type="text"
              placeholder="Nueva tarea"
              class="w-full rounded-control border border-borde-fuerte bg-tarjeta px-2 py-1.5 text-cp-sm text-texto placeholder:text-texto-tenue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            />
            <div class="flex items-center gap-1.5">
              <input
                v-model="nuevas[columna.status].hours"
                type="number"
                min="0"
                step="0.25"
                placeholder="Horas"
                class="w-16 rounded-control border border-borde-fuerte bg-tarjeta px-1.5 py-1.5 font-mono text-cp-xs text-texto placeholder:text-texto-tenue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              />
              <select
                v-model="nuevas[columna.status].assigned_to"
                class="min-h-10 min-w-0 flex-1 rounded-control border border-borde-fuerte bg-tarjeta px-1.5 py-1.5 text-cp-xs text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              >
                <option value="">Sin asignar</option>
                <option v-for="member in members" :key="member.user_id" :value="member.user_id">
                  {{ member.name }}
                </option>
              </select>
              <button
                type="submit"
                class="inline-flex min-h-10 items-center rounded-control bg-primario-fuerte px-2.5 py-1.5 text-cp-xs font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              >
                Crear
              </button>
            </div>
          </form>
        </section>
      </div>
    </AsyncState>

    <!--
      Detalle de la tarea: sus campos, su descripcion, su lista de comprobacion,
      sus comentarios y su historico.
    -->
    <TaskDetailDialog
      :open="selectedTaskId !== null"
      :task-id="selectedTaskId"
      :can-edit="canEdit"
      @close="selectedTaskId = null"
      @saved="load"
      @deleted="onTaskDeleted"
    />

    <!--
      Copia de la tarjeta que se arrastra: sigue al cursor mientras dura el
      gesto y deja ver a que columna va a caer. No intercepta el raton, para que
      la columna de destino se siga calculando por debajo.
    -->
    <div
      v-if="fantasma"
      data-testid="kanban-drag-ghost"
      class="pointer-events-none fixed z-50 w-64 select-none rounded-control border border-primario bg-tarjeta p-3 shadow-flotante"
      :style="{
        left: `${fantasma.x}px`,
        top: `${fantasma.y}px`,
      }"
    >
      <p class="text-cp-sm font-semibold text-texto">{{ fantasma.tarea.title }}</p>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <span class="rounded-control bg-tarjeta-suave px-1.5 py-0.5 text-cp-xs text-texto-suave">
          {{ fantasma.tarea.assigned_name ?? 'Sin asignar' }}
        </span>
        <span class="rounded-control bg-primario-fuerte px-1.5 py-0.5 font-mono text-cp-xs font-semibold tabular-nums text-sobre-primario">
          {{ formatHours(fantasma.tarea.estimated_hours) }}
        </span>
      </div>
      <p v-if="fantasma.tarea.start_date" class="mt-1 font-mono text-cp-xs text-texto-tenue">
        {{ fantasma.tarea.start_date }} &rarr; {{ fantasma.tarea.end_date }}
      </p>
    </div>
  </div>
</template>
