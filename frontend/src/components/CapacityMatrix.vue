<script setup>
/**
 * Matriz de ocupacion.
 *
 * Con identificador de proyecto muestra la matriz de ese proyecto. Sin el, la
 * matriz es global: reúne las horas de todos los proyectos visibles y admite
 * un filtro por departamento.
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

import { overviewApi, projectsApi, tasksApi } from '../api/client'
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
const departmentFilter = ref('')
const globalMembers = ref([])

const breakdown = ref(null)
const breakdownTasks = ref([])

/** Sin identificador de proyecto la matriz es global. */
const isGlobal = computed(() => props.id === null || props.id === undefined)

const members = computed(() => (isGlobal.value ? globalMembers.value : store.members))
const weeks = computed(() => report.value?.weeks ?? [])
const rows = computed(() => report.value?.rows ?? [])
/** Tareas que caen enteramente en dias no laborables: valen cero horas. */
const holidayTaskIds = computed(() => report.value?.holiday_task_ids ?? [])

function cellOf(row, week) {
  return (
    row.cells.find((cell) => cell.week === week) ?? {
      week,
      hours: 0,
      is_overloaded: false,
    }
  )
}

/** Junta las listas de miembros de varios proyectos sin repetir personas. */
function mergeMembers(lists) {
  const merged = new Map()
  for (const list of lists) {
    for (const member of list) {
      if (!merged.has(member.user_id)) merged.set(member.user_id, member)
    }
  }
  return [...merged.values()]
}

/** Recarga la matriz y, en el espacio global, las personas de todos los proyectos. */
async function refresh() {
  const token = auth.token
  if (isGlobal.value) {
    const params = departmentFilter.value ? { department_id: departmentFilter.value } : {}
    const [capacity, memberLists] = await Promise.all([
      overviewApi.capacity(token, params),
      Promise.all(store.projects.map((item) => projectsApi.members(token, item.id))),
    ])
    report.value = capacity
    globalMembers.value = mergeMembers(memberLists)
    return
  }

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
 * cliente sobre el conjunto de proyectos.
 */
async function loadBreakdownTasks() {
  if (!breakdown.value) return
  const token = auth.token
  const tasks = isGlobal.value
    ? await tasksApi.list(token, { week: breakdown.value.week })
    : await projectsApi.tasks(token, project.value.id, { week: breakdown.value.week })
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
 * Carga la matriz que toca.
 *
 * En el espacio global no hay proyecto que abrir: se piden los datos de
 * toda la organizacion. En un proyecto se busca entre los visibles y se
 * carga su matriz.
 *
 * Se vuelve a llamar cuando cambia el identificador de la ruta. El router
 * reutiliza la misma instancia del componente cuando solo cambia el
 * parametro, de modo que sin esta recarga la matriz seguiria mostrando los
 * datos del proyecto anterior.
 */
async function loadReport() {
  const token = await auth.ensureSession()
  await store.ensureProjects(token)

  if (isGlobal.value) {
    project.value = null
    await reload()
    return
  }

  const projects = store.projects
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
    await loadReport()
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
      await loadReport()
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  },
)

watch(departmentFilter, () => {
  if (!isGlobal.value) return
  reload()
})
</script>

<template>
  <div>
    <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-siemens-900">
          {{ isGlobal ? 'Capacidad Global' : 'Matriz de ocupacion' }}
        </h1>
        <p v-if="project" class="mt-1 text-sm text-slate-500">{{ project.name }}</p>
        <p v-else-if="isGlobal" class="mt-1 text-sm text-slate-500">
          Reparto de horas de todos los proyectos visibles.
        </p>
      </div>

      <label v-if="isGlobal" class="text-xs font-medium text-slate-600">
        <span class="mb-1 block">Departamento</span>
        <select
          v-model="departmentFilter"
          class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">Todos los departamentos</option>
          <option
            v-for="department in store.departments"
            :key="department.id"
            :value="department.id"
          >
            {{ department.name }}
          </option>
        </select>
      </label>
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
      v-if="!loading && !error && holidayTaskIds.length"
      class="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
      data-testid="capacity-holiday-warning"
    >
      {{ holidayTaskIds.length }} tarea(s) caen enteramente en dias no laborables y no se
      imputan: su carga no aparece en la matriz.
    </p>

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
          :projects="isGlobal ? store.projects : []"
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
