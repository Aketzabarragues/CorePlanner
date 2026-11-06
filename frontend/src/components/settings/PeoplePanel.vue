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
})

const form = ref(empty())
const editing = computed(() => form.value.id !== null)

function reset() {
  form.value = empty()
  error.value = null
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
      email: form.value.email,
      company_role: form.value.company_role,
      department_id:
        form.value.department_id === '' ? null : Number(form.value.department_id),
      weekly_base_hours: form.value.weekly_base_hours,
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
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-left">
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Nombre
          </th>
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Rol
          </th>
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Departamento
          </th>
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Horas
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="person in props.people" :key="person.id" class="border-b border-slate-100">
          <td class="px-2 py-2">
            <span class="block font-medium text-siemens-900">{{ person.name }}</span>
            <span class="block text-xs text-slate-500">{{ person.email }}</span>
          </td>
          <td class="px-2 py-2 text-slate-600">{{ person.company_role_label }}</td>
          <td class="px-2 py-2 text-slate-600">
            {{ person.department_name ?? 'Sin departamento' }}
          </td>
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
      </tbody>
    </table>

    <p v-if="!props.people.length" class="text-sm text-slate-500">
      No hay personas en la organizacion.
    </p>

    <form class="rounded border border-slate-200 bg-white p-4" @submit.prevent="save">
      <h3 class="mb-3 text-sm font-semibold text-siemens-900">
        {{ editing ? 'Modificar persona' : 'Nueva persona' }}
      </h3>

      <div class="grid grid-cols-2 gap-3">
        <label class="block text-sm font-medium">
          Nombre
          <input v-model="form.name" class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" />
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
          Contrasena
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
          {{ editing ? 'Guardar cambios' : 'Dar de alta' }}
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
