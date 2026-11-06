<script setup>
/**
 * Alta y modificacion de departamentos.
 *
 * El responsable de un departamento pasa a pertenecer a el, de modo que el
 * area y su responsable siempre van juntos.
 */
import { computed, ref } from 'vue'

import { configApi } from '../../api/client'
import { useAuthStore } from '../../stores/auth'
import ModalDialog from '../ModalDialog.vue'

const props = defineProps({
  departments: { type: Array, required: true },
  people: { type: Array, required: true },
})

const emit = defineEmits(['saved'])

const auth = useAuthStore()
const error = ref(null)
const saving = ref(false)

const empty = () => ({ id: null, name: '', manager_id: '' })
const form = ref(empty())
const editing = computed(() => form.value.id !== null)
const formOpen = ref(false)

function reset() {
  form.value = empty()
  error.value = null
  formOpen.value = false
}

/** Abre el formulario vacio para dar de alta un departamento. */
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

function edit(department) {
  form.value = {
    id: department.id,
    name: department.name,
    manager_id: department.manager_id === null ? '' : String(department.manager_id),
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
      manager_id: form.value.manager_id === '' ? null : Number(form.value.manager_id),
    }
    if (editing.value) {
      await configApi.updateDepartment(token, form.value.id, payload)
    } else {
      await configApi.createDepartment(token, payload)
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
        data-testid="new-department"
        @click="openCreate"
      >
        Nuevo departamento
      </button>
    </div>

    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-left">
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Departamento
          </th>
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Responsable
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="department in props.departments"
          :key="department.id"
          class="border-b border-slate-100"
        >
          <td class="px-2 py-2 font-medium text-siemens-900">{{ department.name }}</td>
          <td class="px-2 py-2 text-slate-600">
            {{ department.manager_name ?? 'Sin responsable' }}
          </td>
          <td class="px-2 py-2 text-right">
            <button
              type="button"
              class="rounded border border-slate-300 px-3 py-1.5 text-slate-600"
              @click="edit(department)"
            >
              Editar
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <ModalDialog
      :open="formOpen"
      :title="editing ? 'Modificar departamento' : 'Nuevo departamento'"
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
            Responsable
            <select
              v-model="form.manager_id"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Sin responsable</option>
              <option v-for="person in props.people" :key="person.id" :value="String(person.id)">
                {{ person.name }}
              </option>
            </select>
          </label>
        </div>

        <p
          v-if="error"
          class="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
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
