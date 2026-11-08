<script setup>
/**
 * Panel de detalle de una tarea.
 *
 * Reune todo lo que se puede hacer con una tarea en un solo sitio: sus
 * campos, la descripcion, la lista de comprobacion, los comentarios y su
 * historico. El historico sale de la bitacora filtrada por la tarea, asi que
 * no hay que mantenerlo aparte: cada accion que se hace desde aqui queda
 * registrada y se ve al momento.
 */
import { computed, ref, watch } from 'vue'

import { activityApi, projectsApi, tasksApi } from '../api/client'
import AsyncState from './common/AsyncState.vue'
import SidePanel from './common/SidePanel.vue'
import { useAuthStore } from '../stores/auth'
import { actionLabel, relativeTime } from '../utils/activity'
import { KANBAN_COLUMNS, columnLabel } from '../utils/kanban'

const props = defineProps({
  open: { type: Boolean, default: false },
  taskId: { type: Number, default: null },
  canEdit: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'saved', 'deleted'])

const auth = useAuthStore()

const task = ref(null)
const members = ref([])
const comments = ref([])
const checklist = ref([])
const activity = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref(null)
const notice = ref(null)
/** Texto del comentario que se esta escribiendo. */
const newComment = ref('')
/** Texto del punto de la lista que se esta escribiendo. */
const newItem = ref('')
/** Pedir confirmacion antes de borrar la tarea. */
const confirmingDelete = ref(false)

/** Copia de la tarea que se esta editando. */
const form = ref({
  title: '',
  assigned_to: null,
  status: 'backlog',
  start_date: '',
  end_date: '',
  estimated_hours: '',
  description: '',
})

const title = computed(() => task.value?.title ?? 'Tarea')

/** Estado de la pila, para el subtitulo del panel. */
const statusLabel = computed(() => columnLabel(form.value.status))

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
  const diff = {}
  if (ahora.title !== antes.title) diff.title = ahora.title
  if (ahora.assigned_to !== antes.assigned_to) diff.assigned_to = ahora.assigned_to
  if (ahora.status !== antes.status) diff.status = ahora.status
  if (ahora.start_date !== (antes.start_date ?? '')) diff.start_date = ahora.start_date
  if (ahora.end_date !== (antes.end_date ?? '')) diff.end_date = ahora.end_date
  if (ahora.description !== (antes.description ?? '')) diff.description = ahora.description
  const horas = Number.parseFloat(ahora.estimated_hours)
  if (Number.isFinite(horas) && horas !== Number(antes.estimated_hours)) {
    diff.estimated_hours = horas.toFixed(2)
  }
  return diff
})

const hasChanges = computed(() => Object.keys(changes.value).length > 0)

function fillForm(tarea) {
  task.value = tarea
  form.value = {
    title: tarea.title ?? '',
    assigned_to: tarea.assigned_to ?? null,
    status: tarea.status ?? 'backlog',
    start_date: tarea.start_date ?? '',
    end_date: tarea.end_date ?? '',
    estimated_hours: tarea.estimated_hours ?? '',
    description: tarea.description ?? '',
  }
}

/** Vuelve a pedir la bitacora de la tarea. */
async function loadActivity() {
  if (!props.taskId) return
  const token = await auth.ensureSession()
  const page = await activityApi.list(token, {
    entity_type: 'task',
    entity_id: props.taskId,
    limit: 20,
  })
  activity.value = page?.items ?? []
}

/** Pide los comentarios de la tarea. */
async function loadComments() {
  const token = await auth.ensureSession()
  comments.value = (await tasksApi.comments.list(token, props.taskId)) ?? []
}

/** Pide la lista de comprobacion de la tarea. */
async function loadChecklist() {
  const token = await auth.ensureSession()
  checklist.value = (await tasksApi.checklist.list(token, props.taskId)) ?? []
}

/**
 * Pide todo lo que enseña el panel.
 *
 * Los miembros del proyecto hacen falta para el desplegable de responsable:
 * solo se puede asignar a quien esta en el proyecto.
 */
async function load() {
  if (!props.taskId) return
  loading.value = true
  error.value = null
  try {
    const token = await auth.ensureSession()
    const tarea = await tasksApi.detail(token, props.taskId)
    fillForm(tarea)
    const equipo = await projectsApi.members(token, tarea.project_id).catch(() => [])
    members.value = equipo ?? []
    await Promise.all([loadComments(), loadChecklist(), loadActivity()])
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
  saving.value = true
  notice.value = null
  try {
    const token = await auth.ensureSession()
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
  error.value = null
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
  error.value = null
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

/** Borra la tarea entera. */
async function eliminar() {
  saving.value = true
  error.value = null
  try {
    const token = await auth.ensureSession()
    await tasksApi.remove(token, props.taskId)
    emit('deleted')
  } catch (err) {
    error.value = err.message
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
  <SidePanel :open="open" :title="title" data-testid="task-panel" @close="emit('close')">
    <template #subtitle>
      <p class="mt-1 text-sm text-slate-500" data-testid="task-panel-status">
        {{ statusLabel }}
      </p>
    </template>

    <AsyncState
      :loading="loading"
      :error="error"
      error-test-id="task-panel-error"
      loading-label="Cargando la tarea"
      @retry="reintentar"
    >
      <div class="space-y-5">
        <form class="space-y-3" data-testid="task-form" @submit.prevent="guardar">
          <label class="block">
            <span class="text-sm font-medium">Título</span>
            <input
              v-model="form.title"
              type="text"
              :disabled="!canEdit"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </label>

          <label class="block">
            <span class="text-sm font-medium">Asignada a</span>
            <select
              v-model="form.assigned_to"
              :disabled="!canEdit"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              data-testid="task-assigned"
            >
              <option :value="null">Sin asignar</option>
              <option v-for="member in members" :key="member.user_id" :value="member.user_id">
                {{ member.name }}
              </option>
            </select>
          </label>

          <label class="block">
            <span class="text-sm font-medium">Estado</span>
            <select
              v-model="form.status"
              :disabled="!canEdit"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              data-testid="task-status"
            >
              <option v-for="column in KANBAN_COLUMNS" :key="column.status" :value="column.status">
                {{ column.label }}
              </option>
            </select>
          </label>

          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="text-sm font-medium">Inicio</span>
              <input
                v-model="form.start_date"
                type="date"
                :disabled="!canEdit"
                class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </label>

            <label class="block">
              <span class="text-sm font-medium">Fin</span>
              <input
                v-model="form.end_date"
                type="date"
                :disabled="!canEdit"
                class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </label>
          </div>

          <label class="block">
            <span class="text-sm font-medium">Horas estimadas</span>
            <input
              v-model="form.estimated_hours"
              type="number"
              min="0"
              step="0.25"
              :disabled="!canEdit"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </label>

          <label class="block">
            <span class="text-sm font-medium">Descripción</span>
            <textarea
              v-model="form.description"
              rows="4"
              :disabled="!canEdit"
              placeholder="Qué hay que hacer, con qué detalles y con quién."
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              data-testid="task-description"
            />
          </label>

          <div v-if="canEdit" class="flex justify-end">
            <button
              type="submit"
              :disabled="!hasChanges || saving"
              class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              data-testid="task-save"
            >
              {{ saving ? 'Guardando...' : 'Guardar cambios' }}
            </button>
          </div>
        </form>

        <section class="border-t border-slate-200 pt-4">
          <h3 class="text-sm font-semibold text-siemens-900">Lista de comprobación</h3>

          <ul v-if="checklist.length" class="mt-2 space-y-2" data-testid="task-checklist">
            <li
              v-for="item in checklist"
              :key="item.id"
              class="flex items-center gap-2 text-sm"
              data-testid="checklist-item"
            >
              <input
                type="checkbox"
                :checked="item.done"
                :disabled="!canEdit"
                class="h-4 w-4 shrink-0 rounded border-slate-300"
                data-testid="checklist-toggle"
                @change="alternarItem(item)"
              />
              <input
                :value="item.label"
                :disabled="!canEdit"
                class="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm focus:border-slate-300 disabled:text-slate-500"
                :class="item.done ? 'text-slate-400 line-through' : ''"
                data-testid="checklist-label"
                @change="renombrarItem(item, $event)"
              />
              <button
                v-if="canEdit"
                type="button"
                class="shrink-0 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600"
                data-testid="checklist-remove"
                @click="quitarItem(item)"
              >
                Quitar
              </button>
            </li>
          </ul>
          <p v-else class="mt-2 text-xs text-slate-500">Todavía no hay puntos en la lista.</p>

          <form v-if="canEdit" class="mt-2 flex gap-2" @submit.prevent="anadirItem">
            <input
              v-model="newItem"
              type="text"
              placeholder="Añadir un punto"
              class="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
              data-testid="checklist-new"
            />
            <button
              type="submit"
              :disabled="!newItem.trim() || saving"
              class="shrink-0 rounded bg-siemens-900 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              data-testid="checklist-add"
            >
              Añadir
            </button>
          </form>
        </section>

        <section class="border-t border-slate-200 pt-4">
          <h3 class="text-sm font-semibold text-siemens-900">Comentarios</h3>

          <ul v-if="comments.length" class="mt-2 space-y-3" data-testid="task-comments">
            <li
              v-for="comment in comments"
              :key="comment.id"
              class="rounded border border-slate-200 bg-slate-50 p-2"
              data-testid="comment"
            >
              <p class="text-xs text-slate-500">
                <span class="font-medium text-slate-700">{{ comment.author_name }}</span>
                · {{ relativeTime(comment.created_at) }}
              </p>
              <p class="mt-1 whitespace-pre-line text-sm">{{ comment.body }}</p>
            </li>
          </ul>
          <p v-else class="mt-2 text-xs text-slate-500">Todavía no hay comentarios.</p>

          <form v-if="canEdit" class="mt-2 space-y-2" @submit.prevent="comentar">
            <textarea
              v-model="newComment"
              rows="2"
              placeholder="Escribir un comentario"
              class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              data-testid="comment-new"
            />
            <div class="flex justify-end">
              <button
                type="submit"
                :disabled="!newComment.trim() || saving"
                class="rounded bg-siemens-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                data-testid="comment-add"
              >
                Comentar
              </button>
            </div>
          </form>
        </section>

        <section class="border-t border-slate-200 pt-4">
          <h3 class="text-sm font-semibold text-siemens-900">Actividad</h3>

          <ul v-if="activity.length" class="mt-2 space-y-2" data-testid="task-activity">
            <li
              v-for="entry in activity"
              :key="entry.id"
              class="text-sm"
              data-testid="task-activity-entry"
            >
              <span class="font-medium text-slate-900">{{ entry.actor_name }}</span>
              <span class="text-slate-600">{{ actionLabel(entry) }}</span>
              <span class="ml-1 text-xs text-slate-400">{{ relativeTime(entry.created_at) }}</span>
            </li>
          </ul>
          <p v-else class="mt-2 text-xs text-slate-500">Todavía no hay actividad registrada.</p>
        </section>

        <section v-if="canEdit" class="border-t border-slate-200 pt-4">
          <div v-if="!confirmingDelete" class="flex justify-end">
            <button
              type="button"
              class="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700"
              data-testid="task-delete"
              @click="confirmingDelete = true"
            >
              Eliminar tarea
            </button>
          </div>
          <div v-else class="space-y-2">
            <p class="text-xs text-red-700">
              Se borra la tarea con sus comentarios y su lista de comprobación. No hay vuelta atrás.
            </p>
            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="rounded border border-slate-300 px-3 py-1.5 text-xs"
                @click="confirmingDelete = false"
              >
                Cancelar
              </button>
              <button
                type="button"
                :disabled="saving"
                class="rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
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
  </SidePanel>
</template>
