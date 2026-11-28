<script setup>
/**
 * Alta y modificacion de departamentos.
 *
 * El responsable de un departamento pasa a pertenecer a el, de modo que el
 * area y su responsable siempre van juntos.
 *
 * La accion primaria ("Nuevo departamento") no vive en el panel: la expone a
 * la vista, que la pinta en la cabecera compartida.
 */
import { computed, ref } from 'vue'

import { configApi } from '../../api/client'
import { useConfigAccion } from '../../composables/useConfigAccion'
import { useAuthStore } from '../../stores/auth'
import { PALETTE } from '../../utils/palette'
import ModalDialog from '../ModalDialog.vue'
import AlertBanner from '../common/AlertBanner.vue'
import ColorPicker from '../common/ColorPicker.vue'

const props = defineProps({
  departments: { type: Array, required: true },
  people: { type: Array, required: true },
})

const emit = defineEmits(['saved'])

const auth = useAuthStore()
const error = ref(null)
const saving = ref(false)

const empty = () => ({ id: null, name: '', manager_id: '', color: PALETTE[0].hex })
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
    color: department.color ?? PALETTE[0].hex,
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
      await configApi.updateDepartment(token, form.value.id, {
        ...payload,
        color: form.value.color,
      })
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

/** La accion primaria de la pestana: la pinta la vista en la cabecera. */
useConfigAccion({ etiqueta: '+ Nuevo departamento', onClick: openCreate })
</script>

<template>
  <section class="rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta">
    <div class="overflow-x-auto">
      <table class="w-full text-cp-sm">
        <thead class="bg-tarjeta-suave text-left text-cp-micro uppercase tracking-wider text-texto-tenue">
          <tr>
            <th class="px-3 py-2.5 font-semibold">Departamento</th>
            <th class="px-3 py-2.5 font-semibold">Responsable</th>
            <th />
          </tr>
        </thead>
        <tbody class="divide-y divide-borde-suave">
          <tr
            v-for="department in props.departments"
            :key="department.id"
          >
            <td class="px-3 py-2 font-medium text-texto">
              <span
                class="mr-2 inline-block h-3 w-3 rounded-full align-middle bg-borde-fuerte"
                :style="department.color ? { backgroundColor: department.color } : undefined"
                :data-testid="`department-color-${department.id}`"
              ></span>
              {{ department.name }}
            </td>
            <td class="px-3 py-2 text-texto-suave">
              {{ department.manager_name ?? 'Sin responsable' }}
            </td>
            <td class="px-3 py-2 text-right">
              <button
                type="button"
                class="rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                @click="edit(department)"
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
      :title="editing ? 'Modificar departamento' : 'Nuevo departamento'"
      @close="closeForm"
    >
      <form id="form-departamento" @submit.prevent="save">
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-cp-sm font-medium text-texto">
            Nombre
            <input
              v-model="form.name"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            />
          </label>
          <label class="block text-cp-sm font-medium text-texto">
            Responsable
            <select
              v-model="form.manager_id"
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
