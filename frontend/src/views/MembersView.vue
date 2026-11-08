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
import AlertBanner from '../components/common/AlertBanner.vue'
import AsyncState from '../components/common/AsyncState.vue'
import ModalDialog from '../components/ModalDialog.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'

const props = defineProps({
  id: { type: [String, Number], required: true },
})

const auth = useAuthStore()
const store = useProjectsStore()

const error = ref(null)
const notice = ref(null)
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
  notice.value = null
  formError.value = null
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
}

async function addMember() {
  error.value = null
  notice.value = null
  formError.value = null
  try {
    const token = await auth.ensureSession()
    await configApi.addMember(token, props.id, {
      user_id: Number(selection.value.user_id),
      role_id: Number(selection.value.role_id),
    })
    formOpen.value = false
    notice.value = 'Persona anadida al proyecto.'
    await refreshMembers(token)
  } catch (err) {
    formError.value = err.message
  }
}

async function changeRole(member, roleId) {
  error.value = null
  notice.value = null
  try {
    const token = await auth.ensureSession()
    await configApi.updateMemberRole(token, props.id, member.user_id, Number(roleId))
    notice.value = `Rol de ${member.name} cambiado.`
    await refreshMembers(token)
  } catch (err) {
    error.value = err.message
    await refreshMembers(token)
  }
}

async function removeMember(member) {
  error.value = null
  notice.value = null
  try {
    const token = await auth.ensureSession()
    await configApi.removeMember(token, props.id, member.user_id)
    notice.value = `${member.name} fuera del proyecto.`
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
    <header class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-siemens-900">Miembros y Asignaciones</h1>
        <p class="mt-1 text-sm text-slate-500">
          Personas asignadas al proyecto, con su rol y sus horas base.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <p v-if="!loading && members.length" class="text-sm text-slate-500">
          {{ members.length }} persona(s) · {{ totalHours }} h base en total
        </p>
        <button
          v-if="isManager"
          type="button"
          class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
          data-testid="new-member"
          @click="openCreate"
        >
          Añadir persona
        </button>
      </div>
    </header>

    <AsyncState
      :loading="loading"
      :error="error"
      error-test-id="members-error"
      loading-label="Cargando los miembros"
      @retry="reintentar"
    >
      <AlertBanner
        v-if="notice"
        variant="success"
        class="mb-4"
        data-testid="members-notice"
      >
        {{ notice }}
      </AlertBanner>

      <div class="overflow-x-auto rounded border border-slate-200 bg-white">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="bg-slate-100">
              <th class="border border-slate-200 px-3 py-2 text-left">Persona</th>
              <th class="border border-slate-200 px-3 py-2 text-left">Correo</th>
              <th class="border border-slate-200 px-3 py-2 text-left">Rol</th>
              <th class="border border-slate-200 px-3 py-2 text-right">Horas base</th>
              <th v-if="isManager" class="border border-slate-200 px-3 py-2 text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="member in members" :key="member.user_id" data-testid="member-row">
              <th class="border border-slate-200 bg-white px-3 py-2 text-left font-medium">
                {{ member.name }}
              </th>
              <td class="border border-slate-200 px-3 py-2 text-slate-600">{{ member.email }}</td>
              <td class="border border-slate-200 px-3 py-2 text-slate-600">
                <select
                  v-if="isManager"
                  :value="member.role_id"
                  class="rounded border border-slate-300 px-2 py-1 text-sm"
                  :data-testid="`member-role-${member.user_id}`"
                  @change="changeRole(member, $event.target.value)"
                >
                  <option v-for="role in roles" :key="role.id" :value="role.id">
                    {{ role.name }}
                  </option>
                </select>
                <span v-else>{{ member.role_name }}</span>
              </td>
              <td class="border border-slate-200 px-3 py-2 text-right tabular-nums">
                {{ member.weekly_base_hours }} h/semana
              </td>
              <td v-if="isManager" class="border border-slate-200 px-3 py-2 text-right">
                <button
                  type="button"
                  class="rounded border border-slate-300 px-3 py-1.5 text-slate-600"
                  :data-testid="`remove-member-${member.user_id}`"
                  @click="removeMember(member)"
                >
                  Quitar
                </button>
              </td>
            </tr>
            <tr v-if="!members.length">
              <td colspan="5" class="px-3 py-4 text-center text-sm text-slate-500">
                No hay personas asignadas al proyecto.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AsyncState>

    <ModalDialog :open="formOpen" title="Añadir persona al proyecto" @close="closeForm">
      <form @submit.prevent="addMember">
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm font-medium">
            Persona
            <select
              v-model="selection.user_id"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              data-testid="member-person"
            >
              <option value="">Elige una persona</option>
              <option v-for="person in candidates" :key="person.id" :value="String(person.id)">
                {{ person.name }}
              </option>
            </select>
          </label>
          <label class="block text-sm font-medium">
            Rol
            <select
              v-model="selection.role_id"
              class="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
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
          class="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          data-testid="member-form-error"
        >
          {{ formError }}
        </p>

        <div class="mt-4 flex gap-2">
          <button
            type="submit"
            class="rounded bg-siemens-900 px-3 py-2 text-sm font-medium text-white"
            data-testid="add-member"
          >
            Añadir
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
  </div>
</template>
