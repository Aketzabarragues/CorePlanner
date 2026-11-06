<script setup>
/**
 * Configuracion del proyecto.
 *
 * Los datos del proyecto: como se llama, en que estado esta, que departamento
 * lo gestiona y quien lo lleva. Solo el gerente puede cambiarlos.
 */
import { computed, onMounted, ref, watch } from 'vue'

import { configApi, meApi } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { PROJECT_STATUSES, projectStatus } from '../utils/navigation'

const props = defineProps({
  id: { type: [String, Number], required: true },
})

const auth = useAuthStore()
const store = useProjectsStore()

const error = ref(null)
const notice = ref(null)
const loading = ref(true)
const saving = ref(false)
const isManager = ref(false)
const people = ref([])
const form = ref({ name: '', status: 'planning', department_id: '', owner_id: '' })

const project = computed(
  () => store.projects.find((item) => String(item.id) === String(props.id)) ?? null,
)

const departments = computed(() => store.departments)

/** Rellena el formulario con los datos del proyecto. */
function fillForm(current) {
  form.value = {
    name: current.name,
    status: current.status,
    department_id: current.department_id === null ? '' : String(current.department_id),
    owner_id: current.owner_id === null ? '' : String(current.owner_id),
  }
}

async function load() {
  loading.value = true
  try {
    const token = await auth.ensureSession()
    const scope = await meApi.get(token)
    isManager.value = scope.is_manager === true
    await store.ensureProjects(token)
    const current = store.projects.find((item) => String(item.id) === String(props.id))
    if (current) fillForm(current)
    if (isManager.value) {
      people.value = await configApi.people(token).catch(() => [])
    }
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function save() {
  error.value = null
  notice.value = null
  saving.value = true
  try {
    const token = await auth.ensureSession()
    await configApi.updateProject(token, props.id, {
      name: form.value.name,
      status: form.value.status,
      department_id: form.value.department_id === '' ? null : Number(form.value.department_id),
      owner_id: form.value.owner_id === '' ? null : Number(form.value.owner_id),
    })
    await store.load(token)
    notice.value = 'Proyecto guardado.'
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

onMounted(load)
watch(() => props.id, load)
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <header class="mb-4">
      <h1 class="text-xl font-semibold text-siemens-900">Configuración del proyecto</h1>
      <p class="mt-1 text-sm text-slate-500">
        {{ project?.name ?? 'Proyecto' }} · {{ projectStatus(project?.status).label }}
      </p>
    </header>

    <p v-if="loading" class="text-sm text-slate-500">Cargando...</p>

    <p
      v-else-if="error && !isManager"
      class="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      data-testid="project-settings-error"
    >
      {{ error }}
    </p>

    <div v-else class="rounded border border-slate-200 bg-white p-5">
      <p
        v-if="error"
        class="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        data-testid="project-settings-error"
      >
        {{ error }}
      </p>
      <p
        v-if="notice"
        class="mb-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
        data-testid="project-settings-notice"
      >
        {{ notice }}
      </p>

      <form @submit.prevent="save">
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm font-medium">
            Nombre
            <input
              v-model="form.name"
              :disabled="!isManager"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              data-testid="project-name"
            />
          </label>
          <label class="block text-sm font-medium">
            Estado
            <select
              v-model="form.status"
              :disabled="!isManager"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              data-testid="project-status"
            >
              <option v-for="status in PROJECT_STATUSES" :key="status.value" :value="status.value">
                {{ status.label }}
              </option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            Departamento que lo gestiona
            <select
              v-model="form.department_id"
              :disabled="!isManager"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              data-testid="project-department"
            >
              <option value="">Sin departamento</option>
              <option
                v-for="department in departments"
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
              :disabled="!isManager"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              data-testid="project-owner"
            >
              <option value="">Sin responsable</option>
              <option v-for="person in people" :key="person.id" :value="String(person.id)">
                {{ person.name }}
              </option>
            </select>
          </label>
        </div>

        <div v-if="isManager" class="mt-4 flex gap-2">
          <button
            type="submit"
            :disabled="saving"
            class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
            data-testid="save-project"
          >
            Guardar cambios
          </button>
        </div>
        <p v-else class="mt-4 text-sm text-slate-500">
          Solo el gerente puede cambiar los datos del proyecto.
        </p>
      </form>
    </div>
  </div>
</template>
