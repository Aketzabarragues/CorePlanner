<script setup>
/**
 * Miembros del proyecto.
 *
 * Lista las personas asignadas con el rol que ejercen y sus horas base, que
 * son las que se toman como referencia para marcar la sobrecarga en la
 * matriz. El gerente puede meter gente, sacarla y cambiar su rol.
 */
import { computed, onMounted, ref, watch } from 'vue'

import { configApi, meApi } from '../api/client'
import AsyncState from '../components/common/AsyncState.vue'
import ModalDialog from '../components/ModalDialog.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { useToastStore } from '../stores/toast'
import { plural } from '../utils/plural'

const props = defineProps({
  id: { type: [String, Number], required: true },
})

const auth = useAuthStore()
const store = useProjectsStore()
const toast = useToastStore()

const error = ref(null)
const formError = ref(null)
const loading = ref(true)
const isManager = ref(false)
const people = ref([])
const roles = ref([])
const formOpen = ref(false)
const selection = ref({ user_id: '', role_id: '' })

const members = computed(() => store.members)
const totalHours = computed(() =>
  members.value.reduce((sum, member) => sum + Number(member.weekly_base_hours ?? 0), 0),
)

/** Personas de la organizacion que todavia no estan en el proyecto. */
const candidates = computed(() => {
  const inside = new Set(members.value.map((member) => member.user_id))
  return people.value.filter((person) => !inside.has(person.id))
})

async function loadMembers() {
  try {
    const token = await auth.ensureSession()
    const scope = await meApi.get(token)
    isManager.value = scope.is_manager === true
    await store.ensureProjects(token)
    await store.ensureMembers(token, props.id)
    if (isManager.value) {
      const [peopleData, rolesData] = await Promise.all([
        configApi.people(token).catch(() => []),
        configApi.projectRoles(token).catch(() => []),
      ])
      people.value = peopleData
      roles.value = rolesData
    }
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function refreshMembers(token) {
  await store.reloadMembers(token, props.id)
}

/** Abre el formulario vacio para meter a alguien en el proyecto. */
function openCreate() {
  selection.value = { user_id: '', role_id: roles.value[0] ? String(roles.value[0].id) : '' }
  formError.value = null
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
}

async function addMember() {
  error.value = null
  formError.value = null
  try {
    const token = await auth.ensureSession()
    await configApi.addMember(token, props.id, {
      user_id: Number(selection.value.user_id),
      role_id: Number(selection.value.role_id),
    })
    formOpen.value = false
    toast.success('Persona añadida al proyecto.')
    await refreshMembers(token)
  } catch (err) {
    formError.value = err.message
  }
}

async function changeRole(member, roleId) {
  error.value = null
  try {
    const token = await auth.ensureSession()
    await configApi.updateMemberRole(token, props.id, member.user_id, Number(roleId))
    toast.success(`Rol de ${member.name} cambiado.`)
    await refreshMembers(token)
  } catch (err) {
    error.value = err.message
    await refreshMembers(token)
  }
}

async function removeMember(member) {
  error.value = null
  try {
    const token = await auth.ensureSession()
    await configApi.removeMember(token, props.id, member.user_id)
    toast.success(`${member.name} fuera del proyecto.`)
    await refreshMembers(token)
  } catch (err) {
    error.value = err.message
  }
}

/** Vuelve a pedir los datos y enseña el esqueleto mientras llegan. */
async function reintentar() {
  loading.value = true
  await load()
}

onMounted(loadMembers)
watch(() => props.id, loadMembers)
</script>

<template>
  <div>
    <PageHeader
      title="Miembros y Asignaciones"
      ayuda="Personas asignadas al proyecto, con su rol y sus horas base."
    >
      <template #actions>
        <p v-if="!loading && members.length" class="text-cp-sm text-texto-tenue">
          {{ plural(members.length, 'persona', 'personas') }} · {{ totalHours }} h base en total
        </p>
        <button
          v-if="isManager"
          type="button"
          class="inline-flex min-h-10 items-center rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          data-testid="new-member"
          @click="openCreate"
        >
          Añadir persona
        </button>
      </template>
    </PageHeader>

    <AsyncState
      :loading="loading"
      :error="error"
      error-test-id="members-error"
      loading-label="Cargando los miembros"
      @retry="reintentar"
    >
      <div class="overflow-x-auto rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta">
        <table class="w-full border-collapse text-cp-sm">
          <thead>
            <tr class="bg-tarjeta-suave">
              <th class="border border-borde px-3 py-2 text-left">Persona</th>
              <th class="border border-borde px-3 py-2 text-left">Correo</th>
              <th class="border border-borde px-3 py-2 text-left">Rol</th>
              <th class="border border-borde px-3 py-2 text-right">Horas base</th>
              <th v-if="isManager" class="border border-borde px-3 py-2 text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in members" :key="member.user_id" data-testid="member-row">
              <th
                class="border border-borde bg-tarjeta px-3 py-2 text-left font-medium text-texto"
              >
                {{ member.name }}
              </th>
              <td class="border border-borde px-3 py-2 text-texto-suave">
                {{ member.email }}
              </td>
              <td class="border border-borde px-3 py-2 text-texto-suave">
                <select
                  v-if="isManager"
                  :value="member.role_id"
                  class="min-h-10 cursor-pointer rounded-control border border-borde-fuerte bg-tarjeta-suave px-2.5 py-1.5 text-cp-sm text-texto transition-colors hover:border-foco hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                  :data-testid="`member-role-${member.user_id}`"
                  @change="changeRole(member, $event.target.value)"
                >
                  <option v-for="role in roles" :key="role.id" :value="role.id">
                    {{ role.name }}
                  </option>
                </select>
                <span v-else>{{ member.role_name }}</span>
              </td>
              <td
                class="border border-borde px-3 py-2 text-right font-mono tabular-nums text-texto"
              >
                {{ member.weekly_base_hours }} h/semana
              </td>
              <td v-if="isManager" class="border border-borde px-3 py-2 text-right">
                <button
                  type="button"
                  class="inline-flex min-h-10 items-center rounded-control border border-peligro-borde bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-peligro-texto transition-colors hover:bg-peligro-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                  :data-testid="`remove-member-${member.user_id}`"
                  @click="removeMember(member)"
                >
                  Quitar
                </button>
              </td>
            </tr>
            <tr v-if="!members.length">
              <td colspan="5" class="px-3 py-4 text-center text-cp-sm text-texto-tenue">
                No hay personas asignadas al proyecto.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AsyncState>

    <ModalDialog :open="formOpen" title="Añadir persona al proyecto" @close="closeForm">
      <form id="form-miembro-proyecto" @submit.prevent="addMember">
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-cp-sm font-medium text-texto">
            Persona
            <select
              v-model="selection.user_id"
              class="mt-1 w-full min-h-10 rounded-control border border-borde-fuerte bg-tarjeta-suave px-2.5 py-1.5 text-cp-sm text-texto transition-colors hover:border-foco hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="member-person"
            >
              <option value="">Elige una persona</option>
              <option v-for="person in candidates" :key="person.id" :value="String(person.id)">
                {{ person.name }}
              </option>
            </select>
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Rol
            <select
              v-model="selection.role_id"
              class="mt-1 w-full min-h-10 rounded-control border border-borde-fuerte bg-tarjeta-suave px-2.5 py-1.5 text-cp-sm text-texto transition-colors hover:border-foco hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="member-role"
            >
              <option v-for="role in roles" :key="role.id" :value="String(role.id)">
                {{ role.name }}
              </option>
            </select>
          </label>
        </div>

        <p
          v-if="formError"
          class="mt-3 rounded-control border border-peligro-borde bg-peligro-fondo p-3 text-cp-sm text-peligro-texto"
          data-testid="member-form-error"
        >
          {{ formError }}
        </p>
      </form>

      <template #footer="{ submit }">
        <button
          type="button"
          class="inline-flex min-h-10 items-center rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          @click="closeForm"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="submit"
          class="inline-flex min-h-10 items-center rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          data-testid="add-member"
        >
          Añadir
        </button>
      </template>
    </ModalDialog>
  </div>
</template>
