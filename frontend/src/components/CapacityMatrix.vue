<script setup>
/**
 * Matriz de ocupacion del proyecto.
 *
 * Hace un login automatico con el usuario administrador de demostracion y
 * guarda el token en localStorage, de modo que al abrir la aplicacion ya
 * hay datos que ver.
 *
 * Las celdas son clicables: al pulsar una se abre el desglose de las tareas
 * que componen esas horas, desde donde se pueden editar. Cualquier cambio
 * recalcula la matriz.
 */
import { computed, onMounted, ref, watch } from 'vue'

import { projectsApi, tasksApi } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import CellBreakdown from './CellBreakdown.vue'

const auth = useAuthStore()
const store = useProjectsStore()

const props = defineProps({
  id: { type: [String, Number], default: null },
})

const report = ref(null)
const project = ref(null)
const error = ref(null)
const notice = ref(null)
const loading = ref(true)
const saving = ref(false)

const breakdown = ref(null)
const breakdownTasks = ref([])

const members = computed(() => store.members)
const weeks = computed(() => report.value?.weeks ?? [])
const rows = computed(() => report.value?.rows ?? [])

function cellOf(row, week) {
  return (
    row.cells.find((cell) => cell.week === week) ?? {
      week,
      hours: 0,
      is_overloaded: false,
    }
  )
}

/** Recarga matriz, miembros y tareas del proyecto. */
async function refresh() {
  const token = auth.token
  const [capacity] = await Promise.all([
    projectsApi.capacity(token, project.value.id),
    store.ensureMembers(token, project.value.id),
  ])
  report.value = capacity
}

async function reload() {
  try {
    await refresh()
    if (breakdown.value) {
      await loadBreakdownTasks()
      syncBreakdownCell()
    }
    error.value = null
  } catch (err) {
    error.value = err.message
  }
}

/** Actualiza las horas que muestra el desglose con las del informe nuevo. */
function syncBreakdownCell() {
  const row = rows.value.find((r) => r.user_id === breakdown.value.user_id)
  if (!row) return
  const cell = cellOf(row, breakdown.value.week)
  breakdown.value = {
    ...breakdown.value,
    hours: cell.hours,
    weekly_base_hours: row.weekly_base_hours,
    is_overloaded: cell.is_overloaded,
  }
}

async function openCell(row, week) {
  const cell = cellOf(row, week)
  breakdown.value = {
    user_id: row.user_id,
    name: row.name,
    week,
    hours: cell.hours,
    weekly_base_hours: row.weekly_base_hours,
    is_overloaded: cell.is_overloaded,
  }
  await loadBreakdownTasks()
}

/**
 * Descarga las tareas de la persona en la semana abierta.
 *
 * El backend filtra por semana, asi que el filtro de persona se aplica en
 * cliente sobre el conjunto del proyecto.
 */
async function loadBreakdownTasks() {
  if (!breakdown.value) return
  const token = auth.token
  const tasks = await projectsApi.tasks(token, project.value.id, {
    week: breakdown.value.week,
  })
  breakdownTasks.value = tasks.filter(
    (task) => task.assigned_to === breakdown.value.user_id,
  )
}

async function saveTask(taskId, payload) {
  saving.value = true
  try {
    await tasksApi.update(auth.token, taskId, payload)
    notice.value = 'Tarea actualizada.'
    await reload()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function deleteTask(task) {
  saving.value = true
  try {
    await tasksApi.remove(auth.token, task.id)
    notice.value = `Tarea "${task.title}" eliminada.`
    await reload()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

/** Reasigna una tarea a otra persona del proyecto. */
async function reassignTask(task, targetUserId) {
  if (targetUserId === null || targetUserId === undefined) {
    error.value = 'No hay personas a las que reasignar la tarea.'
    return
  }
  await saveTask(task.id, { assigned_to: targetUserId })
}

/**
 * Abre el proyecto pedido y carga su matriz.
 *
 * Se vuelve a llamar cuando cambia el proyecto de la ruta. El router
 * reutiliza la misma instancia del componente cuando solo cambia el
 * parametro, de modo que sin esta recarga la matriz seguiria mostrando los
 * datos del proyecto anterior.
 */
async function loadProject() {
  const token = await auth.ensureSession()
  const projects = await store.ensureProjects(token)
  if (projects.length === 0) {
    error.value =
      'No hay proyectos visibles. Ejecuta python backend/seed.py para cargar datos.'
    return
  }

  project.value = projects.find((p) => String(p.id) === String(props.id)) ?? projects[0]
  await reload()
}

onMounted(async () => {
  try {
    await loadProject()
  } catch (err) {
    error.value = err.message
    auth.clear()
  } finally {
    loading.value = false
  }
})

watch(
  () => props.id,
  async () => {
    loading.value = true
    try {
      await loadProject()
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  },
)
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="mb-4">
      <h1 class="text-xl font-semibold text-siemens-900">Matriz de ocupacion</h1>
      <p v-if="project" class="mt-1 text-sm text-slate-500">{{ project.name }}</p>
    </header>

    <p v-if="loading" class="text-sm text-slate-500">Cargando...</p>

    <p
      v-else-if="error"
      class="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      {{ error }}
    </p>

    <p
      v-else-if="notice"
      class="mb-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
    >
      {{ notice }}
    </p>

    <div v-if="!loading && !error" class="overflow-x-auto rounded border border-slate-200 bg-white">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="bg-slate-100">
            <th class="sticky left-0 border border-slate-200 bg-slate-100 px-3 py-2 text-left">
              Persona
            </th>
            <th
              v-for="week in weeks"
              :key="week"
              class="border border-slate-200 px-3 py-2 text-center"
            >
              {{ week }}
            </th>
            <th class="border border-slate-200 px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.user_id">
            <th
              class="sticky left-0 border border-slate-200 bg-white px-3 py-2 text-left font-medium"
            >
              {{ row.name }}
              <span class="block text-xs font-normal text-slate-400">
                {{ row.weekly_base_hours }} h/semana
              </span>
            </th>
            <td
              v-for="week in weeks"
              :key="week"
              class="border border-slate-200 px-3 py-2 text-center tabular-nums"
              :class="cellOf(row, week).is_overloaded
                ? 'bg-red-200 font-semibold text-red-900'
                : 'text-slate-700'"
            >
              <button
                type="button"
                class="w-full hover:underline"
                :title="`Ver tareas de ${row.name} en ${week}`"
                @click="openCell(row, week)"
              >
                {{ cellOf(row, week).hours }}
              </button>
            </td>
            <td class="border border-slate-200 px-3 py-2 text-right tabular-nums">
              {{ row.total_hours }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p
      v-if="!loading && !error && rows.some((r) => r.has_overload)"
      class="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
    >
      En rojo, las semanas que superan las horas base de la persona. Pulsa una celda
      para ver y editar las tareas que la componen.
    </p>

    <!-- Modal de desglose de celda -->
    <div
      v-if="breakdown"
      class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      @click.self="breakdown = null"
    >
      <div class="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <CellBreakdown
          :cell="breakdown"
          :tasks="breakdownTasks"
          :members="members"
          :saving="saving"
          @save="saveTask"
          @delete="deleteTask"
          @reassign="reassignTask"
          @close="breakdown = null"
        />
      </div>
    </div>
  </div>
</template>
