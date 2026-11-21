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
import { PROJECT_STATUSES, projectStatus } from '../../utils/navigation'
import { PALETTE } from '../../utils/palette'
import ModalDialog from '../ModalDialog.vue'
import AlertBanner from '../common/AlertBanner.vue'
import ColorPicker from '../common/ColorPicker.vue'

const props = defineProps({
  projects: { type: Array, required: true },
  departments: { type: Array, required: true },
  people: { type: Array, required: true },
})

const emit = defineEmits(['saved'])

const auth = useAuthStore()
const error = ref(null)
const saving = ref(false)

const STATUSES = PROJECT_STATUSES

/** Color de una fila que todavia no tiene color guardado. */
const COLOR_SIN_DEFINIR = '#94a3b8'

const empty = () => ({
  id: null,
  name: '',
  status: 'planning',
  department_id: '',
  owner_id: '',
  color: PALETTE[0].hex,
  is_provisional: false,
})
const form = ref(empty())
const editing = computed(() => form.value.id !== null)
const formOpen = ref(false)

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
  formOpen.value = false
}

/** Abre el formulario vacio para dar de alta un proyecto. */
function openCreate() {
  form.value = empty()
  error.value = null
  formOpen.value = true
}

/** Cierra el formulario sin guardar. */
function closeForm() {
  error.value = null
  formOpen.value = false
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
    color: project.color ?? PALETTE[0].hex,
    is_provisional: project.is_provisional === true,
  }
  error.value = null
  formOpen.value = true
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
      is_provisional: form.value.is_provisional === true,
    }
    if (editing.value) {
      await configApi.updateProject(token, form.value.id, {
        ...payload,
        color: form.value.color,
      })
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
    <div class="flex justify-end">
      <button
        type="button"
        class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
        data-testid="new-project"
        @click="openCreate"
      >
        Nuevo proyecto
      </button>
    </div>

    <table class="w-full text-sm" data-testid="projects-table">
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
          <td class="px-2 py-2 font-medium text-siemens-900">
            <span
              class="mr-2 inline-block h-3 w-3 rounded-full align-middle"
              :style="{ backgroundColor: project.color ?? COLOR_SIN_DEFINIR }"
              :data-testid="`project-color-${project.id}`"
            ></span>
            {{ project.name }}
            <span
              v-if="project.is_provisional"
              class="ml-1 text-[10px] font-medium text-slate-500"
              data-testid="project-provisional-label"
            >
              Provisional
            </span>
          </td>
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

    <ModalDialog
      :open="formOpen"
      :title="editing ? 'Modificar proyecto' : 'Nuevo proyecto'"
      @close="closeForm"
    >
      <form id="form-proyecto" @submit.prevent="save">
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

        <ColorPicker v-if="editing" v-model="form.color" class="mt-3" />

        <label class="mt-3 flex items-center gap-2 text-sm font-medium text-slate-600">
          <span>Provisional</span>
          <button
            type="button"
            role="switch"
            :aria-checked="form.is_provisional"
            data-testid="project-provisional-switch"
            class="relative h-5 w-9 rounded-full transition-colors"
            :class="form.is_provisional ? 'bg-siemens-900' : 'bg-slate-300'"
            @click="form.is_provisional = !form.is_provisional"
          >
            <span
              class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
              :class="form.is_provisional ? 'left-[18px]' : 'left-0.5'"
            ></span>
          </button>
        </label>
        <p class="text-xs text-slate-500">
          Proyecto en estudio: sus horas solo se cuentan con «Contar lo provisional».
        </p>

        <AlertBanner v-if="error" variant="error" class="mt-3">
          {{ error }}
        </AlertBanner>
      </form>

      <template #footer="{ submit }">
        <button
          type="button"
          class="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600"
          @click="closeForm"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="submit"
          :disabled="saving"
          class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
        >
          {{ editing ? 'Guardar cambios' : 'Crear' }}
        </button>
      </template>
    </ModalDialog>
  </section>
</template>
