<script setup>
/**
 * Altas y modificaciones de personas.
 *
 * El formulario sirve para las dos cosas: vacio da de alta, y relleno con una
 * persona modifica sus campos. El correo se puede cambiar, la contrasena solo
 * se pide al dar de alta.
 */
import { computed, ref } from 'vue'

import { configApi } from '../../api/client'
import { useAuthStore } from '../../stores/auth'
import { initials } from '../../utils/people'
import ModalDialog from '../ModalDialog.vue'
import AlertBanner from '../common/AlertBanner.vue'

const props = defineProps({
  people: { type: Array, required: true },
  departments: { type: Array, required: true },
  companyRoles: { type: Array, required: true },
})

const emit = defineEmits(['saved'])

const auth = useAuthStore()
const error = ref(null)
const saving = ref(false)

const empty = () => ({
  id: null,
  name: '',
  email: '',
  password: '',
  company_role: 'tecnico',
  department_id: '',
  weekly_base_hours: '40',
  job_title: '',
  seniority: '',
  employment_type: 'objetivo',
})

const form = ref(empty())
const editing = computed(() => form.value.id !== null)
const formOpen = ref(false)

function reset() {
  form.value = empty()
  error.value = null
  formOpen.value = false
}

/** Abre el formulario vacio para dar de alta una persona. */
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

function edit(person) {
  form.value = {
    id: person.id,
    name: person.name,
    email: person.email,
    password: '',
    company_role: person.company_role,
    department_id: person.department_id ?? '',
    weekly_base_hours: String(person.weekly_base_hours),
    job_title: person.job_title ?? '',
    seniority: person.seniority ?? '',
    employment_type: person.employment_type ?? 'objetivo',
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
      email: form.value.email,
      company_role: form.value.company_role,
      department_id:
        form.value.department_id === '' ? null : Number(form.value.department_id),
      weekly_base_hours: form.value.weekly_base_hours,
      job_title: form.value.job_title || null,
      seniority: form.value.seniority || null,
      employment_type: form.value.employment_type,
    }
    if (editing.value) {
      await configApi.updatePerson(token, form.value.id, payload)
    } else {
      await configApi.createPerson(token, { ...payload, password: form.value.password })
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
        data-testid="new-person"
        @click="openCreate"
      >
        Nueva persona
      </button>
    </div>

    <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-2 py-2 font-medium">Nombre</th>
            <th class="px-2 py-2 font-medium">Rol</th>
            <th class="px-2 py-2 font-medium">Puesto</th>
            <th class="px-2 py-2 font-medium">Departamento</th>
            <th class="px-2 py-2 font-medium">Contrato</th>
            <th class="px-2 py-2 font-medium">Horas</th>
            <th />
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="person in props.people" :key="person.id" data-testid="person-row">
            <td class="px-2 py-2">
              <div class="flex items-center gap-2">
                <span
                  class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-siemens-900 text-xs font-semibold text-white"
                >
                  {{ initials(person.name) }}
                </span>
                <span class="min-w-0">
                  <span class="block truncate font-medium text-slate-900">{{ person.name }}</span>
                  <span class="block truncate text-xs text-slate-500">{{ person.email }}</span>
                </span>
              </div>
            </td>
            <td class="px-2 py-2 text-slate-600">{{ person.company_role_label }}</td>
            <td class="px-2 py-2 text-slate-600">{{ person.job_title ?? '—' }}</td>
            <td class="px-2 py-2 text-slate-600">
              {{ person.department_name ?? 'Sin departamento' }}
            </td>
            <td class="px-2 py-2 text-slate-600">{{ person.employment_type_label }}</td>
            <td class="px-2 py-2 text-slate-600">{{ person.weekly_base_hours }} h</td>
            <td class="px-2 py-2 text-right">
              <button
                type="button"
                class="rounded border border-slate-300 px-3 py-1.5 text-slate-600"
                @click="edit(person)"
              >
                Editar
              </button>
            </td>
          </tr>
          <tr v-if="!props.people.length">
            <td colspan="7" class="px-3 py-6 text-center text-sm text-slate-500">
              No hay personas en la organización.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ModalDialog
      :open="formOpen"
      :title="editing ? 'Modificar persona' : 'Nueva persona'"
      @close="closeForm"
    >
      <form @submit.prevent="save">
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm font-medium">
            Nombre
            <input
              v-model="form.name"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label class="block text-sm font-medium">
            Correo
            <input
              v-model="form.email"
              type="email"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label v-if="!editing" class="block text-sm font-medium">
            Contraseña
            <input
              v-model="form.password"
              type="password"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label class="block text-sm font-medium">
            Rol de empresa
            <select
              v-model="form.company_role"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option v-for="role in props.companyRoles" :key="role.value" :value="role.value">
                {{ role.label }}
              </option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            Departamento
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
            Horas base semanales
            <input
              v-model="form.weekly_base_hours"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label class="block text-sm font-medium">
            Puesto
            <input
              v-model="form.job_title"
              maxlength="120"
              placeholder="Ingeniero PLC, Project Manager..."
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              data-testid="person-job-title"
            />
          </label>
          <label class="block text-sm font-medium">
            Nivel
            <select
              v-model="form.seniority"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              data-testid="person-seniority"
            >
              <option value="">Sin nivel</option>
              <option value="junior">Junior</option>
              <option value="medio">Medio</option>
              <option value="senior">Senior</option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            Tipo de contrato
            <select
              v-model="form.employment_type"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              data-testid="person-employment-type"
            >
              <option value="objetivo">Objetivo</option>
              <option value="techo">Techo</option>
              <option value="mejor_esfuerzo">Mejor esfuerzo</option>
            </select>
          </label>
        </div>

        <AlertBanner v-if="error" variant="error" class="mt-3">
          {{ error }}
        </AlertBanner>

        <div class="mt-4 flex gap-2">
          <button
            type="submit"
            :disabled="saving"
            class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
          >
            {{ editing ? 'Guardar cambios' : 'Dar de alta' }}
          </button>
          <button
            type="button"
            class="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600"
            @click="closeForm"
          >
            Cancelar
          </button>
        </div>
      </form>
    </ModalDialog>
  </section>
</template>
