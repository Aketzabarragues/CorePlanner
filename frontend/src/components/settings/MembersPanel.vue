<script setup>
/**
 * Miembros de cada proyecto.
 *
 * Una persona entra en un proyecto con el rol que ejercen dentro de el, que es
 * distinto del rol de empresa que tenga en la organizacion.
 */
import { ref } from 'vue'

import { configApi } from '../../api/client'
import { useAuthStore } from '../../stores/auth'
import ModalDialog from '../ModalDialog.vue'

const props = defineProps({
  projects: { type: Array, required: true },
  people: { type: Array, required: true },
  projectRoles: { type: Array, required: true },
  membersByProject: { type: Object, required: true },
})

const emit = defineEmits(['saved'])

const auth = useAuthStore()
const error = ref(null)
const notice = ref(null)
const saving = ref(false)
const selection = ref({ project_id: '', user_id: '', role_id: '' })
const formOpen = ref(false)

function reset() {
  selection.value = { project_id: '', user_id: '', role_id: '' }
}

/** Abre el formulario vacio para anadir una persona a un proyecto. */
function openCreate() {
  reset()
  error.value = null
  formOpen.value = true
}

/** Cierra el formulario sin guardar. */
function closeForm() {
  error.value = null
  formOpen.value = false
}

async function add() {
  error.value = null
  notice.value = null
  saving.value = true
  try {
    const token = await auth.ensureSession()
    await configApi.addMember(token, selection.value.project_id, {
      user_id: Number(selection.value.user_id),
      role_id: Number(selection.value.role_id),
    })
    notice.value = 'Persona anadida al proyecto.'
    reset()
    formOpen.value = false
    emit('saved')
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

async function remove(projectId, userId) {
  error.value = null
  notice.value = null
  saving.value = true
  try {
    const token = await auth.ensureSession()
    await configApi.removeMember(token, projectId, userId)
    notice.value = 'Persona retirada del proyecto.'
    emit('saved')
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex justify-end">
      <button
        type="button"
        class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
        data-testid="new-member"
        @click="openCreate"
      >
        Anadir persona a un proyecto
      </button>
    </div>

    <p
      v-if="notice"
      class="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
      data-testid="member-notice"
    >
      {{ notice }}
    </p>

    <div
      v-for="project in props.projects"
      :key="project.id"
      class="rounded border border-slate-200 bg-white p-4"
    >
      <h3 class="mb-3 text-sm font-semibold text-siemens-900">{{ project.name }}</h3>

      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-left">
            <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Persona
            </th>
            <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Rol en el proyecto
            </th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="member in props.membersByProject[project.id] ?? []"
            :key="member.user_id"
            class="border-b border-slate-100"
          >
            <td class="px-2 py-2 text-slate-700">{{ member.name }}</td>
            <td class="px-2 py-2 text-slate-600">{{ member.role_name }}</td>
            <td class="px-2 py-2 text-right">
              <button
                type="button"
                class="rounded border border-slate-300 px-3 py-1.5 text-slate-600"
                @click="remove(project.id, member.user_id)"
              >
                Quitar
              </button>
            </td>
          </tr>
          <tr v-if="!(props.membersByProject[project.id] ?? []).length">
            <td class="px-2 py-2 text-slate-500" colspan="3">Sin miembros.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <ModalDialog :open="formOpen" title="Anadir persona a un proyecto" @close="closeForm">
      <form @submit.prevent="add">
        <div class="grid grid-cols-3 gap-3">
          <label class="block text-sm font-medium">
            Proyecto
            <select
              v-model="selection.project_id"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Elige un proyecto</option>
              <option v-for="project in props.projects" :key="project.id" :value="String(project.id)">
                {{ project.name }}
              </option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            Persona
            <select
              v-model="selection.user_id"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Elige una persona</option>
              <option v-for="person in props.people" :key="person.id" :value="String(person.id)">
                {{ person.name }}
              </option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            Rol
            <select
              v-model="selection.role_id"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Elige un rol</option>
              <option v-for="role in props.projectRoles" :key="role.id" :value="String(role.id)">
                {{ role.name }}
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
            Anadir
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
