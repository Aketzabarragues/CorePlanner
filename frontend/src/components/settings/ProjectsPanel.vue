<script setup>
/**
 * Alta y modificacion de proyectos.
 *
 * Cada proyecto tiene el departamento que lo gestiona y una persona
 * responsable, que no tienen por que coincidir.
 */
import { computed, ref } from 'vue'

import { configApi } from '../../api/client'
import { useAuthStore } from '../../stores/auth'
import { projectStatus } from '../../utils/navigation'

const props = defineProps({
  projects: { type: Array, required: true },
  departments: { type: Array, required: true },
  people: { type: Array, required: true },
})

const emit = defineEmits(['saved'])

const auth = useAuthStore()
const error = ref(null)
const saving = ref(false)

const STATUSES = [
  { value: 'planning', label: 'Planificación' },
  { value: 'active', label: 'Activo' },
  { value: 'on_hold', label: 'Pausado' },
  { value: 'done', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
]

const empty = () => ({
  id: null,
  name: '',
  status: 'planning',
  department_id: '',
  owner_id: '',
})
const form = ref(empty())
const editing = computed(() => form.value.id !== null)

function departmentName(departmentId) {
  if (departmentId === null || departmentId === undefined) return 'Sin departamento'
  return (
    props.departments.find((department) => String(department.id) === String(departmentId))
      ?.name ?? 'Sin departamento'
  )
}

function personName(userId) {
  if (userId === null || userId === undefined) return 'Sin responsable'
  return props.people.find((person) => String(person.id) === String(userId))?.name ?? 'Sin responsable'
}

function reset() {
  form.value = empty()
  error.value = null
}

function edit(project) {
  form.value = {
    id: project.id,
    name: project.name,
    status: project.status,
    department_id:
      project.department_id === null || project.department_id === undefined
        ? ''
        : String(project.department_id),
    owner_id:
      project.owner_id === null || project.owner_id === undefined ? '' : String(project.owner_id),
  }
  error.value = null
}

async function save() {
  error.value = null
  saving.value = true
  try {
    const token = await auth.ensureSession()
    const payload = {
      name: form.value.name,
      status: form.value.status,
      department_id:
        form.value.department_id === '' ? null : Number(form.value.department_id),
      owner_id: form.value.owner_id === '' ? null : Number(form.value.owner_id),
    }
    if (editing.value) {
      await configApi.updateProject(token, form.value.id, payload)
    } else {
      await configApi.createProject(token, payload)
    }
    reset()
    emit('saved')
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="space-y-4">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-left">
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Proyecto
          </th>
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Departamento
          </th>
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Responsable
          </th>
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Estado
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="project in props.projects" :key="project.id" class="border-b border-slate-100">
          <td class="px-2 py-2 font-medium text-siemens-900">{{ project.name }}</td>
          <td class="px-2 py-2 text-slate-600">{{ departmentName(project.department_id) }}</td>
          <td class="px-2 py-2 text-slate-600">{{ personName(project.owner_id) }}</td>
          <td class="px-2 py-2 text-slate-600">{{ projectStatus(project.status).label }}</td>
          <td class="px-2 py-2 text-right">
            <button
              type="button"
              class="rounded border border-slate-300 px-3 py-1.5 text-slate-600"
              @click="edit(project)"
            >
              Editar
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <form class="rounded border border-slate-200 bg-white p-4" @submit.prevent="save">
      <h3 class="mb-3 text-sm font-semibold text-siemens-900">
        {{ editing ? 'Modificar proyecto' : 'Nuevo proyecto' }}
      </h3>

      <div class="grid grid-cols-2 gap-3">
        <label class="block text-sm font-medium">
          Nombre
          <input
            v-model="form.name"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label class="block text-sm font-medium">
          Estado
          <select
            v-model="form.status"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option v-for="status in STATUSES" :key="status.value" :value="status.value">
              {{ status.label }}
            </option>
          </select>
        </label>
        <label class="block text-sm font-medium">
          Departamento que lo gestiona
          <select
            v-model="form.department_id"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Sin departamento</option>
            <option
              v-for="department in props.departments"
              :key="department.id"
              :value="String(department.id)"
            >
              {{ department.name }}
            </option>
          </select>
        </label>
        <label class="block text-sm font-medium">
          Responsable
          <select
            v-model="form.owner_id"
            class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Sin responsable</option>
            <option v-for="person in props.people" :key="person.id" :value="String(person.id)">
              {{ person.name }}
            </option>
          </select>
        </label>
      </div>

      <p v-if="error" class="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {{ error }}
      </p>

      <div class="mt-4 flex gap-2">
        <button
          type="submit"
          :disabled="saving"
          class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
        >
          {{ editing ? 'Guardar cambios' : 'Crear' }}
        </button>
        <button
          v-if="editing"
          type="button"
          class="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600"
          @click="reset"
        >
          Cancelar
        </button>
      </div>
    </form>
  </section>
</template>
