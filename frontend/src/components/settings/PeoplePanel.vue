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
  <section class="rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta">
    <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-borde-suave px-4 py-3">
      <h2 class="font-titulo text-cp-titulo font-bold text-texto-marca">Personas</h2>
      <button
        type="button"
        class="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
        data-testid="new-person"
        @click="openCreate"
      >
        Nueva persona
      </button>
    </header>

    <div class="p-4">
      <div class="overflow-x-auto rounded-control border border-borde bg-tarjeta">
        <table class="w-full text-cp-sm">
          <thead class="bg-tarjeta-suave text-left text-cp-micro uppercase tracking-wider text-texto-tenue">
            <tr>
              <th class="px-3 py-2.5 font-semibold">Nombre</th>
              <th class="px-3 py-2.5 font-semibold">Rol</th>
              <th class="px-3 py-2.5 font-semibold">Puesto</th>
              <th class="px-3 py-2.5 font-semibold">Departamento</th>
              <th class="px-3 py-2.5 font-semibold">Contrato</th>
              <th class="px-3 py-2.5 font-semibold">Horas</th>
              <th />
            </tr>
          </thead>
          <tbody class="divide-y divide-borde-suave">
            <tr v-for="person in props.people" :key="person.id" data-testid="person-row">
              <td class="px-3 py-2">
                <div class="flex items-center gap-2">
                  <span
                    class="flex h-8 w-8 flex-none items-center justify-center rounded-avatar bg-primario-fuerte text-cp-xs font-semibold text-texto-inverso"
                  >
                    {{ initials(person.name) }}
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate font-medium text-texto">{{ person.name }}</span>
                    <span class="block truncate text-cp-xs text-texto-tenue">{{ person.email }}</span>
                  </span>
                </div>
              </td>
              <td class="px-3 py-2 text-texto-suave">{{ person.company_role_label }}</td>
              <td class="px-3 py-2 text-texto-suave">{{ person.job_title ?? '—' }}</td>
              <td class="px-3 py-2 text-texto-suave">
                {{ person.department_name ?? 'Sin departamento' }}
              </td>
              <td class="px-3 py-2 text-texto-suave">{{ person.employment_type_label }}</td>
              <td class="px-3 py-2 text-texto-suave">{{ person.weekly_base_hours }} h</td>
              <td class="px-3 py-2 text-right">
                <button
                  type="button"
                  class="rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                  @click="edit(person)"
                >
                  Editar
                </button>
              </td>
            </tr>
            <tr v-if="!props.people.length">
              <td colspan="7" class="px-3 py-6 text-center text-cp-sm text-texto-tenue">
                No hay personas en la organización.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ModalDialog
      :open="formOpen"
      :title="editing ? 'Modificar persona' : 'Nueva persona'"
      size="lg"
      @close="closeForm"
    >
      <form id="form-persona" @submit.prevent="save">
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-cp-sm font-medium text-texto">
            Nombre
            <input
              v-model="form.name"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            />
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Correo
            <input
              v-model="form.email"
              type="email"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            />
          </label>
          <label v-if="!editing" class="block text-cp-sm font-medium text-texto">
            Contraseña
            <input
              v-model="form.password"
              type="password"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            />
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Rol de empresa
            <select
              v-model="form.company_role"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            >
              <option v-for="role in props.companyRoles" :key="role.value" :value="role.value">
                {{ role.label }}
              </option>
            </select>
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Departamento
            <select
              v-model="form.department_id"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
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
          <label class="block text-cp-sm font-medium text-texto">
            Horas base semanales
            <input
              v-model="form.weekly_base_hours"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            />
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Puesto
            <input
              v-model="form.job_title"
              maxlength="120"
              placeholder="Ingeniero PLC, Project Manager..."
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco placeholder:text-texto-tenue"
              data-testid="person-job-title"
            />
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Nivel
            <select
              v-model="form.seniority"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="person-seniority"
            >
              <option value="">Sin nivel</option>
              <option value="junior">Junior</option>
              <option value="medio">Medio</option>
              <option value="senior">Senior</option>
            </select>
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Tipo de contrato
            <select
              v-model="form.employment_type"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
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
          {{ editing ? 'Guardar cambios' : 'Dar de alta' }}
        </button>
      </template>
    </ModalDialog>
  </section>
</template>
