<script setup>
/**
 * Miembros de cada proyecto.
 *
 * Una persona entra en un proyecto con el rol que ejercen dentro de el, que es
 * distinto del rol de empresa que tenga en la organizacion.
 *
 * La accion primaria ("Añadir persona a un proyecto") no vive en el panel: la
 * expone a la vista, que la pinta en la cabecera compartida.
 */
import { ref } from 'vue'

import { configApi } from '../../api/client'
import { useConfigAccion } from '../../composables/useConfigAccion'
import { useAuthStore } from '../../stores/auth'
import { useToastStore } from '../../stores/toast'
import ModalDialog from '../ModalDialog.vue'
import AlertBanner from '../common/AlertBanner.vue'

const props = defineProps({
  projects: { type: Array, required: true },
  people: { type: Array, required: true },
  projectRoles: { type: Array, required: true },
  membersByProject: { type: Object, required: true },
})

const emit = defineEmits(['saved'])

const auth = useAuthStore()
const toast = useToastStore()
const error = ref(null)
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
  saving.value = true
  try {
    const token = await auth.ensureSession()
    await configApi.addMember(token, selection.value.project_id, {
      user_id: Number(selection.value.user_id),
      role_id: Number(selection.value.role_id),
    })
    toast.success('Persona añadida al proyecto.')
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
  saving.value = true
  try {
    const token = await auth.ensureSession()
    await configApi.removeMember(token, projectId, userId)
    toast.success('Persona retirada del proyecto.')
    emit('saved')
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

/** La accion primaria de la pestana: la pinta la vista en la cabecera. */
useConfigAccion({ etiqueta: '+ Añadir persona', onClick: openCreate })
</script>

<template>
  <section class="rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta">
    <div v-for="project in props.projects" :key="project.id" class="px-3 py-3">
      <h3 class="mb-2 text-cp-sm font-semibold text-texto-marca">{{ project.name }}</h3>

      <div class="overflow-x-auto">
        <table class="w-full text-cp-sm">
          <thead class="bg-tarjeta-suave text-left text-cp-micro uppercase tracking-wider text-texto-tenue">
            <tr>
              <th class="px-3 py-2.5 font-semibold">Persona</th>
              <th class="px-3 py-2.5 font-semibold">Rol en el proyecto</th>
              <th />
            </tr>
          </thead>
          <tbody class="divide-y divide-borde-suave">
            <tr
              v-for="member in props.membersByProject[project.id] ?? []"
              :key="member.user_id"
            >
              <td class="px-3 py-2 text-texto">{{ member.name }}</td>
              <td class="px-3 py-2 text-texto-suave">{{ member.role_name }}</td>
              <td class="px-3 py-2 text-right">
                <button
                  type="button"
                  class="rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                  @click="remove(project.id, member.user_id)"
                >
                  Quitar
                </button>
              </td>
            </tr>
            <tr v-if="!(props.membersByProject[project.id] ?? []).length">
              <td class="px-3 py-2 text-cp-sm text-texto-tenue" colspan="3">Sin miembros.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ModalDialog :open="formOpen" title="Añadir persona a un proyecto" @close="closeForm">
      <form id="form-miembro" @submit.prevent="add">
        <div class="grid grid-cols-3 gap-3">
          <label class="block text-cp-sm font-medium text-texto">
            Proyecto
            <select
              v-model="selection.project_id"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            >
              <option value="">Elige un proyecto</option>
              <option v-for="project in props.projects" :key="project.id" :value="String(project.id)">
                {{ project.name }}
              </option>
            </select>
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Persona
            <select
              v-model="selection.user_id"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            >
              <option value="">Elige una persona</option>
              <option v-for="person in props.people" :key="person.id" :value="String(person.id)">
                {{ person.name }}
              </option>
            </select>
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Rol
            <select
              v-model="selection.role_id"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            >
              <option value="">Elige un rol</option>
              <option v-for="role in props.projectRoles" :key="role.id" :value="String(role.id)">
                {{ role.name }}
              </option>
            </select>
          </label>
        </div>

        <AlertBanner v-if="error" variant="error" class="mt-3">
          {{ error }}
        </AlertBanner>
      </form>

      <template #footer="{ submit }">
        <button
          type="button"
          class="inline-flex min-h-10 items-center gap-1.5 rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          @click="closeForm"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="submit"
          :disabled="saving"
          class="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:opacity-60"
        >
          Añadir
        </button>
      </template>
    </ModalDialog>
  </section>
</template>
