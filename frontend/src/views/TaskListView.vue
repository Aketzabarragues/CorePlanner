<script setup>
/**
 * Lista de tareas del proyecto.
 *
 * El Tablero enseña el reparto por estado y el Gantt el calendario; esta vista
 * enseña las tareas en fila: su responsable, su estado, sus fechas, sus horas
 * y el progreso de su lista de comprobacion.
 *
 * Es una vista del proyecto, no una vista global con filtro: el proyecto va en
 * la ruta. Un clic en una fila abre el detalle de la tarea, que es el mismo
 * panel que abre el Tablero.
 */
import { computed, onMounted, ref, watch } from 'vue'

import { meApi, projectsApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import AppIcon from '../components/AppIcon.vue'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import TaskDetailPanel from '../components/TaskDetailPanel.vue'
import { useAuthStore } from '../stores/auth'
import { KANBAN_COLUMNS, columnLabel, formatHours, statusPill } from '../utils/kanban'

const props = defineProps({
  id: { type: [String, Number], required: true },
})

const auth = useAuthStore()

const tasks = ref([])
const members = ref([])
const scope = ref(null)
const error = ref(null)
const loading = ref(true)
/** Tarea abierta en el panel de detalle. */
const selectedTaskId = ref(null)

/** Filtro por estado: vacio es todos. */
const statusFilter = ref('')
/** Filtro por persona: vacio es todas. */
const personFilter = ref('')
/** Columna por la que se ordena y en que sentido. */
const orden = ref({ key: 'start_date', dir: 'asc' })

/** Si el orden activo va de mayor a menor. */
const ordenInverso = computed(() => orden.value.dir === 'desc')

const COLUMNAS = [
  { key: 'title', label: 'Título' },
  { key: 'assigned', label: 'Asignado' },
  { key: 'status', label: 'Estado' },
  { key: 'start_date', label: 'Inicio → Fin' },
  { key: 'hours', label: 'Horas' },
  { key: 'checklist', label: 'Checklist' },
]

/**
 * Si la persona puede escribir en el proyecto abierto.
 *
 * Es el mismo criterio que usa el Tablero: el proyecto tiene que estar entre
 * los editables de quien entra.
 */
const canEdit = computed(() => {
  const editable = scope.value?.editable_project_ids
  if (!editable) return false
  return editable.includes(Number(props.id))
})

const subtitle = computed(() =>
  scope.value && !canEdit.value
    ? 'Solo lectura: no puedes cambiar las tareas de este proyecto.'
    : 'Las tareas del proyecto en fila. Un clic en una fila abre su detalle.',
)

/** Personas que pueden aparecer en el filtro de responsable. */
const people = computed(() => {
  const nombres = new Map()
  for (const member of members.value) {
    nombres.set(member.user_id, member.name)
  }
  for (const task of tasks.value) {
    if (task.assigned_to && !nombres.has(task.assigned_to)) {
      nombres.set(task.assigned_to, task.assigned_name ?? '')
    }
  }
  return [...nombres.entries()].map(([id, name]) => ({ id, name }))
})

/** Tareas que pasan los filtros. */
const filtradas = computed(() =>
  tasks.value.filter((task) => {
    if (statusFilter.value && task.status !== statusFilter.value) return false
    if (personFilter.value && String(task.assigned_to ?? '') !== personFilter.value) {
      return false
    }
    return true
  }),
)

/** Valor de una tarea para la columna por la que se ordena. */
function valor(task, key) {
  switch (key) {
    case 'title':
      return task.title ?? ''
    case 'assigned':
      return task.assigned_name ?? ''
    case 'status':
      return KANBAN_COLUMNS.findIndex((column) => column.status === task.status)
    case 'start_date':
      return task.start_date ?? null
    case 'hours':
      return Number(task.estimated_hours ?? 0)
    case 'checklist':
      return task.checklist_total ?? 0
    default:
      return null
  }
}

/** Las tareas ordenadas por la columna activa. */
const ordenadas = computed(() => {
  const { key, dir } = orden.value
  const signo = dir === 'asc' ? 1 : -1
  return [...filtradas.value].sort((a, b) => {
    const primero = valor(a, key)
    const segundo = valor(b, key)
    // Lo que no tiene valor se queda al final en los dos sentidos.
    if (primero === null && segundo === null) return 0
    if (primero === null) return 1
    if (segundo === null) return -1
    if (typeof primero === 'string') {
      return primero.localeCompare(segundo, 'es') * signo
    }
    return (primero < segundo ? -1 : primero > segundo ? 1 : 0) * signo
  })
})

/**
 * Cambia la columna por la que se ordena.
 *
 * Si es la misma, el sentido se invierte; si es otra, empieza de nuevo.
 */
function ordenarPor(key) {
  orden.value =
    orden.value.key === key
      ? { key, dir: orden.value.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' }
}

/** Abre el detalle de una tarea. */
function abrirTarea(task) {
  selectedTaskId.value = task.id
}

/** Cierra el panel de detalle y vuelve a pintar la lista. */
function onTaskDeleted() {
  selectedTaskId.value = null
  load()
}

async function load() {
  try {
    const token = await auth.ensureSession()
    const [lista, equipo, ambito] = await Promise.all([
      projectsApi.tasks(token, props.id),
      projectsApi.members(token, props.id).catch(() => []),
      meApi.get(token).catch(() => null),
    ])
    tasks.value = lista ?? []
    members.value = equipo ?? []
    scope.value = ambito
    error.value = null
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

onMounted(load)
watch(() => props.id, load)
useTaskReload(load)
</script>

<template>
  <div>
    <PageHeader title="Lista de tareas" :subtitle="subtitle" />

    <AsyncState
      :loading="loading"
      :error="error"
      loading-label="Cargando las tareas"
      @retry="reintentar"
    >
      <div class="mb-4 flex flex-wrap items-end gap-3">
        <label class="text-xs font-medium text-slate-600">
          <span class="mb-1 block">Estado</span>
          <select
            v-model="statusFilter"
            class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            data-testid="filter-status"
          >
            <option value="">Todos los estados</option>
            <option v-for="column in KANBAN_COLUMNS" :key="column.status" :value="column.status">
              {{ column.label }}
            </option>
          </select>
        </label>

        <label class="text-xs font-medium text-slate-600">
          <span class="mb-1 block">Persona</span>
          <select
            v-model="personFilter"
            class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            data-testid="filter-person"
          >
            <option value="">Todas las personas</option>
            <option v-for="person in people" :key="person.id" :value="String(person.id)">
              {{ person.name }}
            </option>
          </select>
        </label>

        <p class="ml-auto text-xs text-slate-500" data-testid="task-count">
          {{ ordenadas.length }} de {{ tasks.length }} tareas
        </p>
      </div>

      <div class="overflow-x-auto rounded border border-slate-200 bg-white">
        <table class="w-full border-collapse text-sm" data-testid="task-table">
          <thead>
            <tr class="bg-slate-100">
              <th
                v-for="column in COLUMNAS"
                :key="column.key"
                class="border border-slate-200 px-3 py-2 text-left"
              >
                <button
                  type="button"
                  class="flex items-center gap-1 font-medium text-slate-700 hover:text-siemens-900"
                  :data-testid="`sort-${column.key}`"
                  @click="ordenarPor(column.key)"
                >
                  {{ column.label }}
                  <span
                    class="inline-flex h-3.5 w-3.5"
                    :class="orden.key === column.key ? 'text-slate-600' : 'text-slate-300'"
                  >
                    <span
                      class="inline-flex h-full w-full transition-transform"
                      :class="orden.key === column.key && ordenInverso ? 'rotate-180' : ''"
                    >
                      <AppIcon name="chevronUpDown" />
                    </span>
                  </span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="task in ordenadas"
              :key="task.id"
              class="cursor-pointer hover:bg-slate-50"
              data-testid="task-row"
              @click="abrirTarea(task)"
            >
              <td class="border border-slate-200 px-3 py-2">
                <button
                  type="button"
                  class="text-left font-medium text-slate-900 hover:text-siemens-900"
                  data-testid="task-title"
                  @click.stop="abrirTarea(task)"
                >
                  {{ task.title }}
                </button>
              </td>
              <td class="border border-slate-200 px-3 py-2 text-slate-600">
                {{ task.assigned_name ?? 'Sin asignar' }}
              </td>
              <td class="border border-slate-200 px-3 py-2">
                <span
                  class="rounded px-2 py-0.5 text-xs font-medium"
                  :class="statusPill(task.status)"
                >
                  {{ columnLabel(task.status) }}
                </span>
              </td>
              <td class="border border-slate-200 px-3 py-2 text-slate-600 tabular-nums">
                {{ task.start_date ?? '—' }} → {{ task.end_date ?? '—' }}
              </td>
              <td class="border border-slate-200 px-3 py-2 text-right tabular-nums text-slate-600">
                {{ formatHours(task.estimated_hours) }}
              </td>
              <td class="border border-slate-200 px-3 py-2 text-slate-600 tabular-nums">
                <span v-if="task.checklist_total > 0" data-testid="task-checklist-progress">
                  {{ task.checklist_done }}/{{ task.checklist_total }} hechos
                </span>
              </td>
            </tr>
            <tr v-if="!ordenadas.length">
              <td :colspan="COLUMNAS.length" class="px-3 py-6 text-center text-sm text-slate-500">
                No hay tareas que enseñar.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AsyncState>

    <!--
      Detalle de la tarea: es el mismo panel que abre el Tablero, con sus
      campos, su descripcion, su lista de comprobacion, sus comentarios y su
      historico.
    -->
    <TaskDetailPanel
      :open="selectedTaskId !== null"
      :task-id="selectedTaskId"
      :can-edit="canEdit"
      @close="selectedTaskId = null"
      @saved="load"
      @deleted="onTaskDeleted"
    />
  </div>
</template>
