<script setup>
/**
 * Diagrama de Gantt.
 *
 * Las barras llegan del backend ya con el formato que espera la libreria:
 * una por tarea, con la persona asignada en la etiqueta y su color.
 *
 * En el espacio global se reunen las barras de todos los proyectos visibles y
 * cada una lleva delante el nombre de su proyecto, para saber de donde sale.
 *
 * Al mover o redimensionar una barra se guardan las fechas nuevas con un
 * PATCH de la tarea, de modo que el diagrama y la matriz de ocupacion
 * cuentan lo mismo.
 */
import Gantt from 'frappe-gantt'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { overviewApi, projectsApi, tasksApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import { useAuthStore } from '../stores/auth'
import { GANTT_VIEW_MODES, dateChangePayload } from '../utils/gantt'

const props = defineProps({ id: { type: [String, Number], default: null } })

const container = ref(null)
const error = ref(null)
const notice = ref(null)
const loading = ref(true)
const saving = ref(false)
const viewMode = ref('Week')
const members = ref([])
const undatedTaskIds = ref([])

let gantt = null

const auth = useAuthStore()

/** Sin identificador de proyecto el diagrama es global. */
const isGlobal = computed(() => props.id === null || props.id === undefined)

/**
 * Prepara las tareas para la libreria.
 *
 * La libreria busca la barra que se esta moviendo comparando con
 * igualdad estricta el identificador de la tarea, que es un numero, con el
 * que lee del DOM, que es texto. Con identificadores como texto las dos
 * cosas coinciden y el arrastre encuentra su barra.
 *
 * En el diagrama global cada barra se antepone el nombre de su proyecto.
 */
function toBarTasks(tasks) {
  return tasks.map((task) => ({
    ...task,
    id: String(task.id),
    name: isGlobal.value && task.project_name ? `${task.project_name} · ${task.name}` : task.name,
  }))
}

function render(feed) {
  if (!container.value) return
  container.value.innerHTML = ''
  gantt = new Gantt(container.value, toBarTasks(feed.tasks ?? []), {
    view_mode: viewMode.value,
    bar_height: 24,
    padding: 16,
    on_date_change: handleDateChange,
  })
  members.value = feed.members ?? []
  undatedTaskIds.value = feed.undated_task_ids ?? []
}

async function load() {
  try {
    const token = await auth.ensureSession()
    const feed = isGlobal.value
      ? await overviewApi.gantt(token)
      : await projectsApi.gantt(token, props.id)
    render(feed)
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

/** Guarda las fechas nuevas cuando se mueve o redimensiona una barra. */
async function handleDateChange(task, start, end) {
  saving.value = true
  const payload = dateChangePayload(start, end)
  try {
    await tasksApi.update(auth.token, task.id, payload)
    notice.value = `Fechas actualizadas: ${payload.start_date} a ${payload.end_date}.`
    error.value = null
  } catch (err) {
    error.value = err.message
    await load()
  } finally {
    saving.value = false
  }
}

function changeViewMode(mode) {
  viewMode.value = mode
  if (gantt) gantt.change_view_mode(mode)
}

onMounted(load)
watch(() => props.id, load)
useTaskReload(load)
onBeforeUnmount(() => {
  gantt = null
})
</script>

<template>
  <div>
    <header class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-siemens-900">
          {{ isGlobal ? 'Gantt Global' : 'Diagrama de Gantt' }}
        </h1>
        <p class="text-xs text-slate-500">
          {{ isGlobal
            ? 'Las barras de todos los proyectos visibles, agrupadas por proyecto.'
            : 'Mueve o redimensiona una barra para guardar sus fechas.' }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-for="mode in GANTT_VIEW_MODES"
          :key="mode.id"
          type="button"
          class="rounded border px-3 py-1.5 text-sm"
          :class="
            viewMode === mode.id
              ? 'border-siemens-900 bg-siemens-900 text-white'
              : 'border-slate-300 bg-white text-slate-700'
          "
          @click="changeViewMode(mode.id)"
        >
          {{ mode.label }}
        </button>
      </div>
    </header>

    <p v-if="notice" class="mb-2 text-sm text-emerald-700">{{ notice }}</p>
    <p v-if="error" class="mb-2 text-sm text-red-600">{{ error }}</p>
    <p v-if="loading" class="text-sm text-slate-500">Cargando...</p>
    <p v-if="saving" class="text-sm text-slate-500">Guardando fechas...</p>

    <ul v-if="members.length" class="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
      <li v-for="member in members" :key="member.user_id" class="flex items-center gap-1.5">
        <span :class="['inline-block h-3 w-3 rounded-sm', member.css_class]" />
        {{ member.name }}
      </li>
    </ul>

    <p v-if="undatedTaskIds.length" class="mb-3 text-xs text-amber-700">
      {{ undatedTaskIds.length }} tarea(s) sin fechas no aparecen en el diagrama.
    </p>

    <div ref="container" class="overflow-x-auto rounded border border-slate-200 bg-white p-2" />
  </div>
</template>
