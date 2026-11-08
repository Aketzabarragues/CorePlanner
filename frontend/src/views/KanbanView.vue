<script setup>
/**
 * Tablero Kanban del proyecto.
 *
 * Las tareas llegan agrupadas por estado desde el backend. Al mover una
 * tarjeta a otra columna se guarda el estado con un PATCH de la tarea, de
 * modo que el tablero y el resto de vistas cuentan lo mismo.
 *
 * La tarjeta se mueve de dos maneras: arrastrarla con el raton hasta otra
 * columna o elegir el estado en su desplegable.
 *
 * Si la persona no tiene permiso de escritura en el proyecto, el tablero se
 * ve en solo lectura: el desplegable no cambia de estado y la tarjeta no se
 * puede arrastrar. El criterio es el mismo que usa el armazon: los proyectos
 * editables de quien entra.
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'

import { meApi, projectsApi, tasksApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import AlertBanner from '../components/common/AlertBanner.vue'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { KANBAN_COLUMNS, columnAt, columnLabel, formatHours } from '../utils/kanban'

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
/** Ambito de quien entra: rol y proyectos en los que puede escribir. */
const scope = ref(null)

const auth = useAuthStore()

let dragging = null

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

/** Lo que se lee encima del tablero: cambia con el permiso. */
const subtitle = computed(() =>
  canEdit.value
    ? 'Arrastra una tarjeta a otra columna o cambia su estado en el desplegable.'
    : 'Solo lectura: no puedes mover las tarjetas de este proyecto.',
)

const board = computed(() =>
  KANBAN_COLUMNS.map((column) => ({
    status: column.status,
    tasks: tasks.value.filter((task) => task.status === column.status),
  })),
)

function columnAtPoint(x, y) {
  const rects = columnElements.value.map((element) =>
    element ? element.getBoundingClientRect() : null,
  )
  return columnAt(x, y, rects)
}

function startDrag(task, event) {
  if (!canEdit.value) return
  if (event.target.closest('select, button, input, a')) return
  // Sin esto el navegador sigue con su seleccion de texto mientras se arrastra
  // y el resaltado azul compite con el gesto.
  event.preventDefault()
  dragging = { task }
  draggingId.value = task.id
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onDragMove(event) {
  if (!dragging) return
  hoverColumn.value = columnAtPoint(event.clientX, event.clientY)?.status ?? null
}

function onDragEnd(event) {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
  const pending = dragging
  dragging = null
  draggingId.value = null
  hoverColumn.value = null
  if (!pending) return

  const target = columnAtPoint(event.clientX, event.clientY)
  if (target && target.status !== pending.task.status) {
    moveTask(pending.task, target.status)
  }
}

/** Cambia el estado de una tarea y guarda el cambio. */
async function moveTask(task, status) {
  // Red de seguridad: el desplegable esta deshabilitado y el arrastre no
  // empieza sin permiso, asi que aqui solo llega si el permiso cambia con la
  // tarjeta en pantalla.
  if (!canEdit.value) {
    aviso.value = 'No tienes permiso de escritura en este proyecto.'
    return
  }
  saving.value = true
  aviso.value = null
  // La tarjeta se mueve al instante y el tablero se recarga con lo que
  // conteste el servidor, que es lo que manda.
  const local = tasks.value.find((t) => t.id === task.id)
  if (local) local.status = status
  try {
    await tasksApi.update(auth.token, task.id, { status })
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

async function moveFromSelect(task, event) {
  await moveTask(task, event.target.value)
}

async function load() {
  try {
    const token = await auth.ensureSession()
    const data = await projectsApi.kanban(token, props.id)
    tasks.value = (data.columns ?? []).flatMap((column) => column.tasks ?? [])
    // El ambito va aparte: si no se puede leer, el tablero se ve en solo
    // lectura, pero se ve.
    scope.value = await meApi.get(token).catch(() => null)
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
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
})
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
          v-for="(column, index) in board"
          :key="column.status"
          :ref="(element) => (columnElements[index] = element)"
          class="flex min-h-32 flex-col rounded border bg-slate-100 p-2"
          :class="hoverColumn === column.status ? 'border-siemens-500 bg-slate-200' : 'border-slate-200'"
        >
          <h2 class="mb-2 flex items-center justify-between text-xs font-semibold text-slate-700">
            {{ columnLabel(column.status) }}
            <span class="rounded bg-white px-1.5 py-0.5 text-slate-500">
              {{ column.tasks.length }}
            </span>
          </h2>

          <article
            v-for="task in column.tasks"
            :key="task.id"
            class="mb-2 select-none rounded border border-slate-200 bg-white p-3 shadow-sm last:mb-0"
            :class="[
              canEdit ? 'cursor-grab' : 'cursor-default',
              draggingId === task.id ? 'opacity-60' : '',
            ]"
            @mousedown="startDrag(task, $event)"
          >
            <p class="text-sm font-medium text-slate-900">{{ task.title }}</p>
            <div class="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span class="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                {{ task.assigned_name ?? 'Sin asignar' }}
              </span>
              <span class="rounded bg-siemens-900 px-1.5 py-0.5 text-white">
                {{ formatHours(task.estimated_hours) }}
              </span>
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
        </section>
      </div>
    </AsyncState>
  </div>
</template>
