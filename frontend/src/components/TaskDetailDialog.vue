<script setup>
/**
 * Dialogo de detalle de una tarea.
 *
 * Reune todo lo que se puede hacer con una tarea en un solo sitio: sus
 * campos, la descripcion, la lista de comprobacion, los comentarios y su
 * historico. El historico sale de la bitacora filtrada por la tarea, asi que
 * no hay que mantenerlo aparte: cada accion que se hace desde aqui queda
 * registrada y se ve al momento.
 *
 * Usa ModalDialog (size="lg") como contenedor: cabecera y pie fijos, cuerpo
 * con scroll. El boton "Guardar cambios" va en el slot footer; las acciones
 * secundarias (checklist, comentarios) permanecen dentro del cuerpo.
 */
import { computed, ref, watch } from 'vue'

import { activityApi, dependenciesApi, projectsApi, tasksApi } from '../api/client'
import AlertBanner from './common/AlertBanner.vue'
import AsyncState from './common/AsyncState.vue'
import ModalDialog from './ModalDialog.vue'
import { useAuthStore } from '../stores/auth'
import { useTaskStatusesStore } from '../stores/taskStatuses'
import { actionLabel, relativeTime } from '../utils/activity'
import { DEFAULT_TASK_STATUSES, columnLabel, formatHours, statusPill } from '../utils/kanban'

const props = defineProps({
  open:    { type: Boolean, default: false },
  taskId:  { type: Number,  default: null },
  canEdit: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'saved', 'deleted'])

/** Fecha de hoy en `YYYY-MM-DD`, con el huso local del navegador. */
function hoy() {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(
    ahora.getDate(),
  ).padStart(2, '0')}`
}

/** Redondea a centimas de hora, como cuenta el motor: sin decimales de ruido. */
function centimas(value) {
  return Math.round(Number(value ?? 0) * 100) / 100
}

const auth = useAuthStore()
const statusStore  = useTaskStatusesStore()

const task           = ref(null)
const members        = ref([])
const comments       = ref([])
const checklist      = ref([])
const timeEntries    = ref([])
const activity       = ref([])
const loading        = ref(false)
const saving         = ref(false)
const error          = ref(null)
/** Texto del comentario que se esta escribiendo. */
const newComment     = ref('')
/** Texto del punto de la lista que se esta escribiendo. */
const newItem        = ref('')
/** Fecha de la imputacion que se esta escribiendo; por defecto, hoy. */
const entryDate      = ref(hoy())
/** Horas de la imputacion que se esta escribiendo. */
const entryHours     = ref('')
/** Nota opcional de la imputacion. */
const entryNote      = ref('')
/** Pedir confirmacion antes de borrar la tarea. */
const confirmingDelete = ref(false)
/** Requisitos de la tarea: las que tienen que terminar antes de que empiece. */
const requisitos = ref([])
/** Dependientes de la tarea: las que dependen de que esta termine. */
const dependientes = ref([])
/** Tareas del proyecto para el selector del vinculo nuevo. */
const tareasProyecto = ref([])
/** Tarea elegida como requisito en el vinculo nuevo; vacio hasta que se elija. */
const newDependsOn = ref('')
/** Tipo del vinculo nuevo. */
const newDepType = ref('precedes')
/** Error de la seccion de dependencias; el del dialogo va por la suya. */
const depError = ref(null)

/** Copia de la tarea que se esta editando. */
const form = ref({
  title:           '',
  assigned_to:     null,
  status:          'backlog',
  start_date:      '',
  end_date:        '',
  estimated_hours: '',
  description:     '',
})

const title       = computed(() => task.value?.title ?? 'Tarea')
/**
 * Estados del proyecto de la tarea.
 *
 * El desplegable de estado y la etiqueta del formulario se pintan con los
 * estados que el backend siembra y permite editar por proyecto; sin carga,
 * los cuatro por defecto.
 */
const estados = computed(() => {
  const lista = statusStore.statesOf(task.value?.project_id)
  return lista.length ? lista : DEFAULT_TASK_STATUSES
})
const statusLabel = computed(() => columnLabel(form.value.status, estados.value))

/**
 * Campos que han cambiado de verdad.
 *
 * Solo se mandan los que difieren de lo que hay guardado, para no pisar con
 * un valor vacio lo que no se ha tocado.
 */
const changes = computed(() => {
  if (!task.value) return {}
  const antes = task.value
  const ahora = form.value
  const diff  = {}
  if (ahora.title       !== antes.title)              diff.title       = ahora.title
  if (ahora.assigned_to !== antes.assigned_to)        diff.assigned_to = ahora.assigned_to
  if (ahora.status      !== antes.status)             diff.status      = ahora.status
  if (ahora.start_date  !== (antes.start_date  ?? '')) diff.start_date  = ahora.start_date
  if (ahora.end_date    !== (antes.end_date    ?? '')) diff.end_date    = ahora.end_date
  if (ahora.description !== (antes.description ?? '')) diff.description = ahora.description
  const horas = Number.parseFloat(ahora.estimated_hours)
  if (Number.isFinite(horas) && horas !== Number(antes.estimated_hours)) {
    diff.estimated_hours = horas.toFixed(2)
  }
  return diff
})

const hasChanges = computed(() => Object.keys(changes.value).length > 0)

/** La suma de las horas imputadas de la tarea, en texto. */
const totalHoras = computed(() =>
  centimas(timeEntries.value.reduce((suma, entry) => suma + Number(entry.hours ?? 0), 0)),
)

/**
 * Si la imputacion es de quien esta delante.
 *
 * Solo las propias se pueden borrar: el backend responde 403 a las ajenas.
 */
function esPropria(entry) {
  return auth.user?.id !== null && Number(entry.user_id) === Number(auth.user?.id)
}

function fillForm(tarea) {
  task.value = tarea
  form.value = {
    title:           tarea.title           ?? '',
    assigned_to:     tarea.assigned_to     ?? null,
    status:          tarea.status          ?? 'backlog',
    start_date:      tarea.start_date      ?? '',
    end_date:        tarea.end_date        ?? '',
    estimated_hours: tarea.estimated_hours ?? '',
    description:     tarea.description     ?? '',
  }
}

/** Vuelve a pedir la bitacora de la tarea. */
async function loadActivity() {
  if (!props.taskId) return
  const token = await auth.ensureSession()
  const page  = await activityApi.list(token, {
    entity_type: 'task',
    entity_id:   props.taskId,
    limit:       20,
  })
  activity.value = page?.items ?? []
}

/** Pide los comentarios de la tarea. */
async function loadComments() {
  const token    = await auth.ensureSession()
  comments.value = (await tasksApi.comments.list(token, props.taskId)) ?? []
}

/** Pide la lista de comprobacion de la tarea. */
async function loadChecklist() {
  const token      = await auth.ensureSession()
  checklist.value  = (await tasksApi.checklist.list(token, props.taskId)) ?? []
}

/** Pide las imputaciones de horas de la tarea. */
async function loadTimeEntries() {
  const token = await auth.ensureSession()
  const lista = await tasksApi.listTimeEntries(token, props.taskId)
  // La respuesta de la API es un array; cualquier otra forma no es una lista.
  timeEntries.value = Array.isArray(lista) ? lista : []
}

/**
 * Pide los vinculos de la tarea y las tareas del proyecto.
 *
 * Las tareas del proyecto son para el selector del vinculo nuevo: todo el
 * mundo del proyecto menos la propia tarea.
 */
async function loadDependencias() {
  const token = await auth.ensureSession()
  const [deps, tareas] = await Promise.all([
    dependenciesApi.task(token, props.taskId),
    projectsApi.tasks(token, task.value.project_id),
  ])
  // Cualquier respuesta que no sea la lista esperada se trata como lista
  // vacia, como hacen el resto de las cargas del dialogo.
  requisitos.value = Array.isArray(deps?.requirements) ? deps.requirements : []
  dependientes.value = Array.isArray(deps?.dependents) ? deps.dependents : []
  tareasProyecto.value = Array.isArray(tareas) ? tareas : []
}

/** El tipo del vinculo en texto: `precedes` ordena, `relates` no. */
function tipoLabel(tipo) {
  return tipo === 'precedes' ? 'debe terminar antes' : 'relacion'
}

/** Titulo de una tarea del proyecto por su identificador. */
function tituloTarea(id) {
  return tareasProyecto.value.find((tarea) => tarea.id === id)?.title ?? ''
}

/** Tareas del proyecto para el selector, menos la propia. */
const tareasParaElSelector = computed(() =>
  tareasProyecto.value.filter((tarea) => tarea.id !== props.taskId),
)

/** Crea el vinculo nuevo y recarga la seccion. */
async function anadirDependencia() {
  const requisito = Number(newDependsOn.value)
  if (!requisito) return
  depError.value = null
  saving.value = true
  try {
    const token = await auth.ensureSession()
    await dependenciesApi.add(token, task.value.project_id, {
      task_id: props.taskId,
      depends_on_id: requisito,
      type: newDepType.value,
    })
    newDependsOn.value = ''
    newDepType.value = 'precedes'
    await loadDependencias()
  } catch (err) {
    depError.value = err.message
  } finally {
    saving.value = false
  }
}

/**
 * Quita un requisito, por el par.
 *
 * El vinculo se quita desde la tarea dependiente: las dependientes no llevan
 * boton.
 */
async function quitarRequisito(req) {
  depError.value = null
  saving.value = true
  try {
    const token = await auth.ensureSession()
    await dependenciesApi.remove(token, props.taskId, req.depends_on_id)
    await loadDependencias()
  } catch (err) {
    depError.value = err.message
  } finally {
    saving.value = false
  }
}

/**
 * Pide todo lo que enseña el dialogo.
 *
 * Los miembros del proyecto hacen falta para el desplegable de responsable:
 * solo se puede asignar a quien esta en el proyecto.
 */
async function load() {
  if (!props.taskId) return
  loading.value = true
  error.value   = null
  try {
    const token = await auth.ensureSession()
    const tarea = await tasksApi.detail(token, props.taskId)
    fillForm(tarea)
    // Los estados del proyecto van aparte: si no se pueden leer, el
    // desplegable se queda con los cuatro por defecto.
    await statusStore.loadProject(token, tarea.project_id).catch(() => [])
    const equipo   = await projectsApi.members(token, tarea.project_id).catch(() => [])
    members.value  = equipo ?? []
    await Promise.all([
      loadComments(),
      loadChecklist(),
      loadTimeEntries(),
      loadActivity(),
      loadDependencias(),
    ])
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

/** Vuelve a pedir los datos y enseña el esqueleto mientras llegan. */
async function reintentar() {
  loading.value = true
  await load()
}

/** Guarda los campos de la tarea. */
async function guardar() {
  if (!hasChanges.value) return
  saving.value  = true
  try {
    const token   = await auth.ensureSession()
    const guardada = await tasksApi.update(token, props.taskId, changes.value)
    fillForm(guardada)
    await loadActivity()
    emit('saved')
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

/** Anade un comentario y recarga lo que depende de el. */
async function comentar() {
  const cuerpo = newComment.value.trim()
  if (!cuerpo) return
  saving.value = true
  error.value  = null
  try {
    const token = await auth.ensureSession()
    await tasksApi.comments.add(token, props.taskId, cuerpo)
    newComment.value = ''
    await Promise.all([loadComments(), loadActivity()])
    emit('saved')
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

/** Anade un punto a la lista de comprobacion. */
async function anadirItem() {
  const etiqueta = newItem.value.trim()
  if (!etiqueta) return
  saving.value = true
  error.value  = null
  try {
    const token = await auth.ensureSession()
    await tasksApi.checklist.add(token, props.taskId, etiqueta)
    newItem.value = ''
    await Promise.all([loadChecklist(), loadActivity()])
    emit('saved')
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

/** Marca o desmarca un punto de la lista. */
async function alternarItem(item) {
  error.value = null
  try {
    const token = await auth.ensureSession()
    await tasksApi.checklist.update(token, props.taskId, item.id, { done: !item.done })
    await Promise.all([loadChecklist(), loadActivity()])
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}

/** Cambia el texto de un punto de la lista. */
async function renombrarItem(item, event) {
  const etiqueta = event.target.value.trim()
  if (!etiqueta || etiqueta === item.label) return
  error.value = null
  try {
    const token = await auth.ensureSession()
    await tasksApi.checklist.update(token, props.taskId, item.id, { label: etiqueta })
    await Promise.all([loadChecklist(), loadActivity()])
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}

/** Quita un punto de la lista. */
async function quitarItem(item) {
  error.value = null
  try {
    const token = await auth.ensureSession()
    await tasksApi.checklist.remove(token, props.taskId, item.id)
    await Promise.all([loadChecklist(), loadActivity()])
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}

/**
 * Guarda una imputacion de horas de la tarea.
 *
 * No emite `saved`: la tarea no cambia, solo su lista de imputaciones, que
 * se recarga.
 */
async function imputar() {
  const horas = Number.parseFloat(entryHours.value)
  if (!entryDate.value || !Number.isFinite(horas) || horas <= 0) return
  saving.value = true
  error.value  = null
  try {
    const token = await auth.ensureSession()
    await tasksApi.addTimeEntry(token, props.taskId, {
      work_date: entryDate.value,
      hours: horas.toFixed(2),
      note: entryNote.value.trim() || null,
    })
    entryDate.value  = hoy()
    entryHours.value = ''
    entryNote.value  = ''
    await loadTimeEntries()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

/** Borra una imputacion propia. */
async function borrarImputacion(entry) {
  error.value = null
  try {
    const token = await auth.ensureSession()
    await tasksApi.deleteTimeEntry(token, entry.id)
    await loadTimeEntries()
  } catch (err) {
    error.value = err.message
  }
}

/** Borra la tarea entera. */
async function eliminar() {
  saving.value = true
  error.value  = null
  try {
    const token = await auth.ensureSession()
    await tasksApi.remove(token, props.taskId)
    emit('deleted')
  } catch (err) {
    error.value          = err.message
    confirmingDelete.value = false
  } finally {
    saving.value = false
  }
}

watch(
  () => [props.open, props.taskId],
  ([abierto, id]) => {
    if (abierto && id) load()
  },
  { immediate: true },
)
</script>

<template>
  <ModalDialog
    :open="open"
    :title="title"
    size="lg"
    data-testid="task-panel"
    @close="emit('close')"
  >
    <!-- Cuerpo con scroll -->
    <AsyncState
      :loading="loading"
      :error="error"
      error-test-id="task-panel-error"
      loading-label="Cargando la tarea"
      @retry="reintentar"
    >
      <div class="space-y-5">
        <!-- ModalDialog no admite slot de subtitulo: el estado va aqui, en la primera linea. -->
        <span
          class="inline-flex items-center gap-1.5 rounded-pastilla px-2 py-0.5 text-cp-xs font-semibold"
          :style="statusPill(task?.status ?? '', estados.value)"
        >
          {{ statusLabel }}
        </span>

        <form class="space-y-3" data-testid="task-form" @submit.prevent="guardar">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="block sm:col-span-2">
              <span class="text-cp-sm font-medium text-texto">Título</span>
              <input
                v-model="form.title"
                type="text"
                :disabled="!canEdit"
                class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 text-cp-sm text-texto transition-colors hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:cursor-not-allowed disabled:bg-tarjeta-suave disabled:text-texto-tenue"
              />
            </label>

            <label class="block">
              <span class="text-cp-sm font-medium text-texto">Asignada a</span>
              <select
                v-model="form.assigned_to"
                :disabled="!canEdit"
                class="mt-1 w-full min-h-10 cursor-pointer rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 text-cp-sm text-texto transition-colors hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:cursor-not-allowed disabled:bg-tarjeta-suave disabled:text-texto-tenue"
                data-testid="task-assigned"
              >
                <option :value="null">Sin asignar</option>
                <option v-for="member in members" :key="member.user_id" :value="member.user_id">
                  {{ member.name }}
                </option>
              </select>
            </label>

            <label class="block">
              <span class="text-cp-sm font-medium text-texto">Estado</span>
              <select
                v-model="form.status"
                :disabled="!canEdit"
                class="mt-1 w-full min-h-10 cursor-pointer rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 text-cp-sm text-texto transition-colors hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:cursor-not-allowed disabled:bg-tarjeta-suave disabled:text-texto-tenue"
                data-testid="task-status"
              >
                <option v-for="estado in estados" :key="estado.key" :value="estado.key">
                  {{ estado.label }}
                </option>
              </select>
            </label>

            <label class="block">
              <span class="text-cp-sm font-medium text-texto">Inicio</span>
              <input
                v-model="form.start_date"
                type="date"
                :disabled="!canEdit"
                class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 font-mono text-cp-sm text-texto transition-colors hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:cursor-not-allowed disabled:bg-tarjeta-suave disabled:text-texto-tenue"
              />
            </label>

            <label class="block">
              <span class="text-cp-sm font-medium text-texto">Fin</span>
              <input
                v-model="form.end_date"
                type="date"
                :disabled="!canEdit"
                class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 font-mono text-cp-sm text-texto transition-colors hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:cursor-not-allowed disabled:bg-tarjeta-suave disabled:text-texto-tenue"
              />
            </label>

            <label class="block">
              <span class="text-cp-sm font-medium text-texto">Horas estimadas</span>
              <input
                v-model="form.estimated_hours"
                type="number"
                min="0"
                step="0.25"
                :disabled="!canEdit"
                class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 font-mono text-cp-sm tabular-nums text-texto transition-colors hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:cursor-not-allowed disabled:bg-tarjeta-suave disabled:text-texto-tenue"
              />
            </label>

            <label class="block sm:col-span-2">
              <span class="text-cp-sm font-medium text-texto">Descripción</span>
              <textarea
                v-model="form.description"
                rows="4"
                :disabled="!canEdit"
                placeholder="Qué hay que hacer, con qué detalles y con quién."
                class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 text-cp-sm text-texto placeholder:text-texto-tenue transition-colors hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:cursor-not-allowed disabled:bg-tarjeta-suave disabled:text-texto-tenue"
                data-testid="task-description"
              />
            </label>
          </div>
        </form>

        <section class="border-t border-borde-suave pt-4">
          <h3 class="font-titulo text-cp-titulo font-bold text-texto-marca">Lista de comprobación</h3>

          <ul v-if="checklist.length" class="mt-2 space-y-1" data-testid="task-checklist">
            <li
              v-for="item in checklist"
              :key="item.id"
              class="flex items-center gap-2 rounded-control px-1 py-1 text-cp-sm"
              data-testid="checklist-item"
            >
              <input
                type="checkbox"
                :checked="item.done"
                :disabled="!canEdit"
                class="h-4 w-4 shrink-0 rounded-control border-borde-fuerte accent-primario focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                data-testid="checklist-toggle"
                @change="alternarItem(item)"
              />
              <input
                :value="item.label"
                :disabled="!canEdit"
                class="min-w-0 flex-1 rounded-control border border-transparent bg-transparent px-2 py-1 text-cp-sm text-texto transition-colors hover:border-borde focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:text-texto-tenue"
                :class="item.done ? 'text-texto-tenue line-through' : ''"
                data-testid="checklist-label"
                @change="renombrarItem(item, $event)"
              />
              <button
                v-if="canEdit"
                type="button"
                class="inline-flex min-h-10 flex-none items-center rounded-control border border-borde-fuerte bg-tarjeta px-2 py-1 text-cp-xs font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                data-testid="checklist-remove"
                @click="quitarItem(item)"
              >
                Quitar
              </button>
            </li>
          </ul>
          <p v-else class="mt-2 text-cp-xs text-texto-tenue">Todavía no hay puntos en la lista.</p>

          <form v-if="canEdit" class="mt-2 flex gap-2" @submit.prevent="anadirItem">
            <input
              v-model="newItem"
              type="text"
              placeholder="Añadir un punto"
              class="min-w-0 flex-1 rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 text-cp-sm text-texto placeholder:text-texto-tenue transition-colors hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="checklist-new"
            />
            <button
              type="submit"
              :disabled="!newItem.trim() || saving"
              class="inline-flex min-h-10 flex-none items-center rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-xs font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:opacity-60"
              data-testid="checklist-add"
            >
              Añadir
            </button>
          </form>
        </section>

        <section class="border-t border-borde-suave pt-4">
          <h3 class="font-titulo text-cp-titulo font-bold text-texto-marca">Comentarios</h3>

          <ul v-if="comments.length" class="mt-2 space-y-2" data-testid="task-comments">
            <li
              v-for="comment in comments"
              :key="comment.id"
              class="rounded-control border border-borde bg-tarjeta-suave p-3"
              data-testid="comment"
            >
              <p class="text-cp-xs text-texto-tenue">
                <span class="font-semibold text-texto">{{ comment.author_name }}</span>
                · {{ relativeTime(comment.created_at) }}
              </p>
              <p class="mt-1 whitespace-pre-line text-cp-sm text-texto">{{ comment.body }}</p>
            </li>
          </ul>
          <p v-else class="mt-2 text-cp-xs text-texto-tenue">Todavía no hay comentarios.</p>

          <form v-if="canEdit" class="mt-2 space-y-2" @submit.prevent="comentar">
            <textarea
              v-model="newComment"
              rows="2"
              placeholder="Escribir un comentario"
              class="w-full rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 text-cp-sm text-texto placeholder:text-texto-tenue transition-colors hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="comment-new"
            />
            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="!newComment.trim() || saving"
                class="inline-flex min-h-10 items-center rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-xs font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:opacity-60"
                data-testid="comment-add"
              >
                Comentar
              </button>
            </div>
          </form>
        </section>

        <section class="border-t border-borde-suave pt-4">
          <h3 class="font-titulo text-cp-titulo font-bold text-texto-marca">
            Horas imputadas
            <span class="font-normal text-texto-tenue">· total {{ totalHoras }} h</span>
          </h3>

          <ul v-if="timeEntries.length" class="mt-2 space-y-1" data-testid="time-entries">
            <li
              v-for="entry in timeEntries"
              :key="entry.id"
              class="flex items-center gap-2 rounded-control px-1 py-1 text-cp-sm text-texto"
              data-testid="time-entry"
            >
              <span class="font-mono text-cp-xs tabular-nums text-texto-suave">{{ entry.work_date }}</span>
              <span class="font-mono text-cp-xs font-semibold tabular-nums text-texto">
                {{ formatHours(entry.hours) }}
              </span>
              <span class="text-cp-xs text-texto-suave">
                <span class="font-semibold text-texto">{{ entry.user_name }}</span>
              </span>
              <span v-if="entry.note" class="min-w-0 truncate text-cp-xs text-texto-tenue">
                · {{ entry.note }}
              </span>
              <button
                v-if="canEdit && esPropria(entry)"
                type="button"
                class="ml-auto inline-flex min-h-10 flex-none items-center rounded-control border border-borde-fuerte bg-tarjeta px-2 py-1 text-cp-xs font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                data-testid="time-entry-remove"
                @click="borrarImputacion(entry)"
              >
                Borrar
              </button>
            </li>
          </ul>
          <p v-else class="mt-2 text-cp-xs text-texto-tenue">Todavía no hay horas imputadas.</p>

          <form v-if="canEdit" class="mt-2 flex flex-wrap items-center gap-2" @submit.prevent="imputar">
            <input
              v-model="entryDate"
              type="date"
              class="rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 font-mono text-cp-sm text-texto transition-colors hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="time-entry-date"
            />
            <input
              v-model="entryHours"
              type="number"
              min="0"
              step="0.25"
              placeholder="Horas"
              class="w-20 rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 font-mono tabular-nums text-cp-sm text-texto transition-colors placeholder:text-texto-tenue hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="time-entry-hours"
            />
            <input
              v-model="entryNote"
              type="text"
              placeholder="Nota (opcional)"
              class="min-w-0 flex-1 rounded-control border border-borde-fuerte bg-tarjeta px-3 py-2 text-cp-sm text-texto transition-colors placeholder:text-texto-tenue hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="time-entry-note"
            />
            <button
              type="submit"
              :disabled="saving"
              class="inline-flex min-h-10 flex-none items-center rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-xs font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:opacity-60"
              data-testid="time-entry-add"
            >
              Imputar
            </button>
          </form>
        </section>

        <section class="border-t border-borde-suave pt-4" data-testid="deps-section">
          <h3 class="font-titulo text-cp-titulo font-bold text-texto-marca">Dependencias</h3>

          <AlertBanner v-if="depError" variant="error" class="mt-2">
            {{ depError }}
          </AlertBanner>

          <div class="mt-2">
            <p class="text-cp-xs font-medium text-texto-tenue">Requisitos</p>
            <ul v-if="requisitos.length" class="mt-1 space-y-1" data-testid="deps-requisitos">
              <li
                v-for="req in requisitos"
                :key="req.id"
                class="flex items-center gap-2 text-cp-sm text-texto"
                data-testid="dep-requisito"
              >
                <span class="min-w-0 flex-1 truncate">{{ tituloTarea(req.depends_on_id) }}</span>
                <span class="shrink-0 text-cp-xs text-texto-tenue" data-testid="dep-tipo">
                  {{ tipoLabel(req.type) }}
                </span>
                <button
                  v-if="canEdit"
                  type="button"
                  class="inline-flex min-h-10 flex-none items-center rounded-control border border-borde-fuerte bg-tarjeta px-2 py-1 text-cp-xs font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                  data-testid="dep-quitar"
                  @click="quitarRequisito(req)"
                >
                  Quitar
                </button>
              </li>
            </ul>
            <p v-else class="mt-1 text-cp-xs text-texto-tenue">
              Esta tarea no depende de ninguna otra.
            </p>
          </div>

          <div class="mt-3">
            <p class="text-cp-xs font-medium text-texto-tenue">Dependientes</p>
            <ul v-if="dependientes.length" class="mt-1 space-y-1" data-testid="deps-dependientes">
              <li
                v-for="dep in dependientes"
                :key="dep.id"
                class="flex items-center gap-2 text-cp-sm text-texto"
                data-testid="dep-dependiente"
              >
                <span class="min-w-0 flex-1 truncate">{{ tituloTarea(dep.task_id) }}</span>
                <span class="shrink-0 text-cp-xs text-texto-tenue">{{ tipoLabel(dep.type) }}</span>
              </li>
            </ul>
            <p v-else class="mt-1 text-cp-xs text-texto-tenue">
              Ninguna tarea depende de esta.
            </p>
          </div>

          <form v-if="canEdit" class="mt-3 flex flex-wrap items-center gap-2" @submit.prevent="anadirDependencia">
            <select
              v-model="newDependsOn"
              class="min-h-10 min-w-0 flex-1 cursor-pointer rounded-control border border-borde-fuerte bg-tarjeta px-2 py-1.5 text-cp-sm text-texto transition-colors hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="dep-new-task"
            >
              <option value="" disabled>
                Tarea que esta depende de...
              </option>
              <option v-for="tarea in tareasParaElSelector" :key="tarea.id" :value="tarea.id">
                {{ tarea.title }}
              </option>
            </select>
            <select
              v-model="newDepType"
              class="min-h-10 cursor-pointer rounded-control border border-borde-fuerte bg-tarjeta px-2 py-1.5 text-cp-sm text-texto transition-colors hover:border-foco focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="dep-new-type"
            >
              <option value="precedes">Debe terminar antes</option>
              <option value="relates">Relacion</option>
            </select>
            <button
              type="submit"
              :disabled="!newDependsOn || saving"
              class="inline-flex min-h-10 flex-none items-center rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-xs font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:opacity-60"
              data-testid="dep-add"
            >
              Añadir
            </button>
          </form>
        </section>

        <section class="border-t border-borde-suave pt-4">
          <h3 class="font-titulo text-cp-titulo font-bold text-texto-marca">Actividad</h3>

          <ul v-if="activity.length" class="mt-2 space-y-1.5" data-testid="task-activity">
            <li
              v-for="entry in activity"
              :key="entry.id"
              class="text-cp-sm text-texto"
              data-testid="task-activity-entry"
            >
              <span class="font-semibold">{{ entry.actor_name }}</span>
              <span class="text-texto-suave">{{ actionLabel(entry, estados.value) }}</span>
              <span class="ml-1 text-cp-xs text-texto-tenue">{{ relativeTime(entry.created_at) }}</span>
            </li>
          </ul>
          <p v-else class="mt-2 text-cp-xs text-texto-tenue">Todavía no hay actividad registrada.</p>
        </section>

        <section v-if="canEdit" class="border-t border-borde-suave pt-4">
          <div v-if="!confirmingDelete" class="flex justify-end">
            <button
              type="button"
              class="inline-flex min-h-10 items-center rounded-control border border-peligro-borde bg-tarjeta px-3 py-1.5 text-cp-xs font-semibold text-peligro-texto transition-colors hover:bg-peligro-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="task-delete"
              @click="confirmingDelete = true"
            >
              Eliminar tarea
            </button>
          </div>
          <div v-else class="space-y-2">
            <p class="text-cp-xs text-peligro-texto">
              Se borra la tarea con sus comentarios y su lista de comprobación. No hay vuelta atrás.
            </p>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="inline-flex min-h-10 items-center rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-xs font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                @click="confirmingDelete = false"
              >
                Cancelar
              </button>
              <button
                type="button"
                :disabled="saving"
                class="inline-flex min-h-10 items-center rounded-control bg-peligro-texto px-3 py-1.5 text-cp-xs font-semibold text-sobre-primario transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:opacity-60"
                data-testid="task-delete-confirm"
                @click="eliminar"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </section>
      </div>
    </AsyncState>

    <!-- Pie: guardar cambios (solo si canEdit y hay cambios posibles) -->
    <template v-if="canEdit" #footer>
      <button
        type="button"
        :disabled="!hasChanges || saving"
        class="inline-flex min-h-10 items-center rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:opacity-60"
        data-testid="task-save"
        @click="guardar"
      >
        {{ saving ? 'Guardando...' : 'Guardar cambios' }}
      </button>
    </template>
  </ModalDialog>
</template>
