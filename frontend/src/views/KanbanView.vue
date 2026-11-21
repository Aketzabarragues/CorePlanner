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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { meApi, projectsApi, tasksApi } from '../api/client'
import { useArrastre } from '../composables/useArrastre'
import { useTaskReload } from '../composables/useTaskReload'
import AlertBanner from '../components/common/AlertBanner.vue'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import TaskDetailDialog from '../components/TaskDetailDialog.vue'
import { useAuthStore } from '../stores/auth'
import { KANBAN_COLUMNS, columnAt, columnLabel, formatHours } from '../utils/kanban'
import { localDateKey } from '../utils/month'

const props = defineProps({ id: { type: [String, Number], required: true } })

const tasks = ref([])
const error = ref(null)
const notice = ref(null)
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
 * y responsable. Las fechas precargan a hoy.
 */
const nuevas = ref({})
for (const column of KANBAN_COLUMNS) {
  nuevas.value[column.status] = { title: '', hours: '', assigned_to: '' }
}

const auth = useAuthStore()

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

const board = computed(() =>
  KANBAN_COLUMNS.map((column) => {
    const datos = columnas.value.find((c) => c.status === column.status) ?? {}
    return {
      status: column.status,
      tasks: tasks.value.filter((task) => task.status === column.status),
      task_count: datos.task_count ?? 0,
      estimated_hours: datos.estimated_hours ?? 0,
    }
  }),
)

function columnIndexOf(status) {
  return KANBAN_COLUMNS.findIndex((c) => c.status === status)
}

function columnAtPoint(x, y) {
  const rects = columnElements.value.map((element) =>
    element ? element.getBoundingClientRect() : null,
  )
  return columnAt(x, y, rects)
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
  hoverColumn.value = columnAtPoint(event.clientX, event.clientY)?.status ?? null
}

/** Al soltar: la tarjeta cae en la columna destino, en el hueco del puntero. */
function alSoltar(pendiente, event) {
  const target = columnAtPoint(event.clientX, event.clientY)
  if (target) ordenarTarea(pendiente.datos.tarea, target.status, event.clientY)
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
    notice.value = `"${task.title}" pasa a ${columnLabel(status)}.`
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
    notice.value = `"${task.title}" pasa a ${columnLabel(status)}.`
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
    notice.value = `Tarea "${alta.title.trim()}" creada.`
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
    const data = await projectsApi.kanban(token, props.id)
    columnas.value = data.columns ?? []
    tasks.value = columnas.value.flatMap((column) => column.tasks ?? [])
    // El ambito va aparte: si no se puede leer, el tablero se ve en solo
    // lectura, pero se ve.
    scope.value = await meApi.get(token).catch(() => null)
    members.value = (await projectsApi.members(token, props.id).catch(() => [])) ?? []
    error.value = null
  } catch (err) {
    error.value = err.message
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
        <p v-if="saving" class="text-sm text-slate-500">Guardando...</p>
      </template>
    </PageHeader>

    <AlertBanner v-if="notice" variant="success" class="mb-2">
      {{ notice }}
    </AlertBanner>

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
      loading-label="Cargando el tablero"
      @retry="reintentar"
    >
      <div class="grid grid-cols-4 gap-3">
        <section
          v-for="(columna, index) in board"
          :key="columna.status"
          :ref="(element) => (columnElements[index] = element)"
          class="flex min-h-32 flex-col rounded border bg-slate-100 p-2"
          :class="hoverColumn === columna.status ? 'border-siemens-500 bg-slate-200' : 'border-slate-200'"
        >
          <h2 class="mb-2 flex items-center justify-between text-xs font-semibold text-slate-700">
            {{ columnLabel(columna.status) }}
            <span class="rounded bg-white px-1.5 py-0.5 text-slate-500">
              {{ columna.task_count }} tareas · {{ formatHours(columna.estimated_hours) }}
            </span>
          </h2>

          <article
            v-for="task in columna.tasks"
            :key="task.id"
            class="mb-2 select-none rounded border border-slate-200 bg-white p-3 shadow-sm last:mb-0"
            :class="[
              canEdit ? 'cursor-grab' : 'cursor-default',
              draggingId === task.id ? 'opacity-60' : '',
            ]"
            data-testid="kanban-card"
            :data-task-id="task.id"
            @mousedown="empezarArrastre(task, $event)"
            @click="onCardClick(task, $event)"
          >
            <p
              v-if="!(editando && editando.id === task.id && editando.campo === 'title')"
              class="text-sm font-medium text-slate-900"
              @dblclick="abrirEdicion(task, 'title')"
            >
              {{ task.title }}
            </p>
            <input
              v-else
              :value="editando.valor"
              type="text"
              class="w-full rounded border border-slate-300 px-1 py-0.5 text-sm"
              @input="editando.valor = $event.target.value"
              @keyup.enter="guardarEdicion(task)"
              @keyup.esc="editando = null"
              @blur="guardarEdicion(task)"
              @dblclick.stop
            />
            <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <select
                :value="task.assigned_to ?? ''"
                :disabled="!canEdit"
                class="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-slate-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
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
                class="rounded bg-siemens-900 px-1.5 py-0.5 text-white"
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
                class="w-16 rounded border border-slate-300 px-1 py-0.5 text-white"
                @input="editando.valor = $event.target.value"
                @keyup.enter="guardarEdicion(task)"
                @keyup.esc="editando = null"
                @blur="guardarEdicion(task)"
                @dblclick.stop
              />
            </div>
            <p v-if="task.start_date" class="mt-1 text-xs text-slate-500">
              {{ task.start_date }} &rarr; {{ task.end_date }}
            </p>
            <select
              :value="task.status"
              :disabled="!canEdit"
              class="mt-2 w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              :title="canEdit ? 'Cambiar el estado de la tarea' : 'Solo lectura'"
              @change="moveFromSelect(task, $event)"
            >
              <option v-for="option in KANBAN_COLUMNS" :key="option.status" :value="option.status">
                {{ option.label }}
              </option>
            </select>
          </article>

          <!--
            Alta inline al pie de la columna: el minimo de tarea. Las fechas
            precargan a hoy y se cambian despues en el dialogo del detalle.
          -->
          <form
            v-if="canEdit"
            class="mt-2 border-t border-slate-200 pt-2"
            data-testid="kanban-new-task"
            @submit.prevent="crearTarea(columna.status)"
          >
            <input
              v-model="nuevas[columna.status].title"
              type="text"
              placeholder="Nueva tarea"
              class="w-full rounded border border-slate-300 px-2 py-1 text-xs"
            />
            <div class="mt-1 flex items-center gap-1">
              <input
                v-model="nuevas[columna.status].hours"
                type="number"
                min="0"
                step="0.25"
                placeholder="Horas"
                class="w-16 rounded border border-slate-300 px-1.5 py-1 text-xs"
              />
              <select
                v-model="nuevas[columna.status].assigned_to"
                class="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-1 text-xs"
              >
                <option value="">Sin asignar</option>
                <option v-for="member in members" :key="member.user_id" :value="member.user_id">
                  {{ member.name }}
                </option>
              </select>
              <button type="submit" class="rounded bg-siemens-700 px-2 py-1 text-xs text-white">
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
      class="pointer-events-none fixed z-50 w-64 select-none rounded border border-siemens-500 bg-white p-3 shadow-lg"
      :style="{
        left: `${fantasma.x}px`,
        top: `${fantasma.y}px`,
      }"
    >
      <p class="text-sm font-medium text-slate-900">{{ fantasma.tarea.title }}</p>
      <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span class="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
          {{ fantasma.tarea.assigned_name ?? 'Sin asignar' }}
        </span>
        <span class="rounded bg-siemens-900 px-1.5 py-0.5 text-white">
          {{ formatHours(fantasma.tarea.estimated_hours) }}
        </span>
      </div>
      <p v-if="fantasma.tarea.start_date" class="mt-1 text-xs text-slate-500">
        {{ fantasma.tarea.start_date }} &rarr; {{ fantasma.tarea.end_date }}
      </p>
    </div>
  </div>
</template>
