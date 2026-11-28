<script setup>
/**
 * Alta y modificacion de proyectos.
 *
 * Cada proyecto tiene el departamento que lo gestiona y una persona
 * responsable, que no tienen por que coincidir.
 *
 * La accion primaria ("Nuevo proyecto") no vive en el panel: la expone a la
 * vista, que la pinta en la cabecera compartida.
 */
import { computed, ref } from 'vue'

import { configApi } from '../../api/client'
import { useConfigAccion } from '../../composables/useConfigAccion'
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

/** La accion primaria de la pestana: la pinta la vista en la cabecera. */
useConfigAccion({ etiqueta: '+ Nuevo proyecto', onClick: openCreate })
</script>

<template>
  <section class="rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta">
    <div class="overflow-x-auto">
      <table class="w-full text-cp-sm" data-testid="projects-table">
        <thead class="bg-tarjeta-suave text-left text-cp-micro uppercase tracking-wider text-texto-tenue">
          <tr>
            <th class="px-3 py-2.5 font-semibold">Proyecto</th>
            <th class="px-3 py-2.5 font-semibold">Departamento</th>
            <th class="px-3 py-2.5 font-semibold">Responsable</th>
            <th class="px-3 py-2.5 font-semibold">Estado</th>
            <th />
          </tr>
        </thead>
        <tbody class="divide-y divide-borde-suave">
          <tr v-for="project in props.projects" :key="project.id">
            <td class="px-3 py-2 font-medium text-texto">
              <span
                class="mr-2 inline-block h-3 w-3 rounded-full align-middle bg-borde-fuerte"
                :style="project.color ? { backgroundColor: project.color } : undefined"
                :data-testid="`project-color-${project.id}`"
              ></span>
              {{ project.name }}
              <span
                v-if="project.is_provisional"
                class="ml-1 text-cp-micro font-medium text-texto-tenue"
                data-testid="project-provisional-label"
              >
                Provisional
              </span>
            </td>
            <td class="px-3 py-2 text-texto-suave">{{ departmentName(project.department_id) }}</td>
            <td class="px-3 py-2 text-texto-suave">{{ personName(project.owner_id) }}</td>
            <td class="px-3 py-2 text-texto-suave">{{ projectStatus(project.status).label }}</td>
            <td class="px-3 py-2 text-right">
              <button
                type="button"
                class="rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                @click="edit(project)"
              >
                Editar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ModalDialog
      :open="formOpen"
      :title="editing ? 'Modificar proyecto' : 'Nuevo proyecto'"
      @close="closeForm"
    >
      <form id="form-proyecto" @submit.prevent="save">
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-cp-sm font-medium text-texto">
            Nombre
            <input
              v-model="form.name"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            />
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Estado
            <select
              v-model="form.status"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            >
              <option v-for="status in STATUSES" :key="status.value" :value="status.value">
                {{ status.label }}
              </option>
            </select>
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Departamento que lo gestiona
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
            Responsable
            <select
              v-model="form.owner_id"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            >
              <option value="">Sin responsable</option>
              <option v-for="person in props.people" :key="person.id" :value="String(person.id)">
                {{ person.name }}
              </option>
            </select>
          </label>
        </div>

        <ColorPicker v-if="editing" v-model="form.color" class="mt-3" />

        <label class="mt-3 flex items-center gap-2 text-cp-sm font-medium text-texto">
          <span>Provisional</span>
          <button
            type="button"
            role="switch"
            :aria-checked="form.is_provisional"
            data-testid="project-provisional-switch"
            class="relative h-5 w-9 rounded-pastilla transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            :class="form.is_provisional ? 'bg-primario-fuerte' : 'bg-borde-fuerte'"
            @click="form.is_provisional = !form.is_provisional"
          >
            <span
              class="absolute top-0.5 h-4 w-4 rounded-pastilla bg-tarjeta transition-all"
              :class="form.is_provisional ? 'left-[18px]' : 'left-0.5'"
            ></span>
          </button>
        </label>
        <p class="text-cp-xs text-texto-tenue">
          Proyecto en estudio: sus horas solo se cuentan con «Contar lo provisional».
        </p>

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
          {{ editing ? 'Guardar cambios' : 'Crear' }}
        </button>
      </template>
    </ModalDialog>
  </section>
</template>
