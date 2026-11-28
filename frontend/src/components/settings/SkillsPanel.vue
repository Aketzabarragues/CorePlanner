<script setup>
/**
 * Catalogo de competencias de la empresa.
 *
 * Es la lista de habilidades que se pueden asignar a la gente. Se anade, se
 * renombra y se quita mientras nadie la tenga asignada.
 *
 * La accion primaria ("Nueva competencia") no vive en el panel: la expone a
 * la vista, que la pinta en la cabecera compartida.
 */
import { ref } from 'vue'

import { skillsApi } from '../../api/client'
import { useConfigAccion } from '../../composables/useConfigAccion'
import { useAuthStore } from '../../stores/auth'
import { useToastStore } from '../../stores/toast'
import ModalDialog from '../ModalDialog.vue'
import AlertBanner from '../common/AlertBanner.vue'

defineProps({
  skills: { type: Array, required: true },
})

const emit = defineEmits(['saved'])

const auth = useAuthStore()
const toast = useToastStore()
const error = ref(null)
const formError = ref(null)
const newName = ref('')
const editingId = ref(null)
const editingName = ref('')
const formOpen = ref(false)

/** Abre el formulario vacio para anadir una competencia. */
function openCreate() {
  newName.value = ''
  formError.value = null
  formOpen.value = true
}

/** Cierra el formulario sin guardar. */
function closeForm() {
  formError.value = null
  formOpen.value = false
}

async function addSkill() {
  formError.value = null
  try {
    const token = await auth.ensureSession()
    await skillsApi.create(token, newName.value.trim())
    newName.value = ''
    formOpen.value = false
    toast.success('Competencia añadida al catálogo.')
    emit('saved')
  } catch (err) {
    formError.value = err.message
  }
}

function startRename(skill) {
  editingId.value = skill.id
  editingName.value = skill.name
}

async function saveRename() {
  error.value = null
  try {
    const token = await auth.ensureSession()
    await skillsApi.rename(token, editingId.value, editingName.value.trim())
    editingId.value = null
    toast.success('Competencia renombrada.')
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}

async function removeSkill(skill) {
  error.value = null
  try {
    const token = await auth.ensureSession()
    await skillsApi.remove(token, skill.id)
    toast.success('Competencia quitada del catálogo.')
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}

/** La accion primaria de la pestana: la pinta la vista en la cabecera. */
useConfigAccion({ etiqueta: '+ Nueva competencia', onClick: openCreate })
</script>

<template>
  <section class="rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta">
    <AlertBanner v-if="error" variant="error" class="p-4" data-testid="skill-catalog-error">
      {{ error }}
    </AlertBanner>

    <div class="overflow-x-auto">
      <table class="w-full text-cp-sm">
        <thead class="bg-tarjeta-suave text-left text-cp-micro uppercase tracking-wider text-texto-tenue">
          <tr>
            <th class="px-3 py-2.5 font-semibold">Competencia</th>
            <th class="px-3 py-2.5 font-semibold">Personas</th>
            <th />
          </tr>
        </thead>
        <tbody class="divide-y divide-borde-suave">
          <tr
            v-for="skill in skills"
            :key="skill.id"
            data-testid="skill-catalog-row"
          >
            <td class="px-3 py-2">
              <template v-if="editingId === skill.id">
                <input
                  v-model="editingName"
                  type="text"
                  maxlength="100"
                  class="w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-1.5 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                  data-testid="rename-skill-input"
                  @keyup.enter="saveRename"
                  @keyup.esc="editingId = null"
                />
              </template>
              <template v-else>
                <span class="font-medium text-texto">{{ skill.name }}</span>
              </template>
            </td>
            <td class="px-3 py-2 text-texto-suave">
              {{ skill.person_count }} persona{{ skill.person_count === 1 ? '' : 's' }}
            </td>
            <td class="px-3 py-2 text-right">
              <span class="flex justify-end gap-3">
                <template v-if="editingId === skill.id">
                  <button
                    type="button"
                    class="text-cp-sm font-medium text-primario-medio hover:underline"
                    data-testid="save-skill-name"
                    @click="saveRename"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    class="text-cp-sm text-texto-tenue hover:underline"
                    data-testid="cancel-skill-name"
                    @click="editingId = null"
                  >
                    Cancelar
                  </button>
                </template>
                <template v-else>
                  <button
                    type="button"
                    class="text-cp-sm font-medium text-primario-medio hover:underline"
                    :data-testid="`rename-skill-${skill.id}`"
                    @click="startRename(skill)"
                  >
                    Renombrar
                  </button>
                  <button
                    type="button"
                    class="text-cp-sm font-medium text-peligro-texto hover:underline"
                    :data-testid="`remove-skill-${skill.id}`"
                    @click="removeSkill(skill)"
                  >
                    Quitar
                  </button>
                </template>
              </span>
            </td>
          </tr>
          <tr v-if="!skills.length">
            <td colspan="3" class="px-3 py-4 text-cp-sm text-texto-tenue">
              Todavía no hay competencias en el catálogo.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ModalDialog :open="formOpen" title="Nueva competencia" size="sm" @close="closeForm">
      <form id="form-competencia" @submit.prevent="addSkill">
        <label class="block text-cp-sm font-medium text-texto">
          Nombre de la competencia
          <input
            v-model="newName"
            type="text"
            maxlength="100"
            placeholder="Robótica, TIA Portal..."
            class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco placeholder:text-texto-tenue"
            data-testid="new-skill-name"
          />
        </label>

        <p
          v-if="formError"
          class="mt-3 rounded-control border border-peligro-borde bg-peligro-fondo p-3 text-cp-sm text-peligro-texto"
          data-testid="skill-form-error"
        >
          {{ formError }}
        </p>
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
          class="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          data-testid="add-skill"
        >
          Añadir
        </button>
      </template>
    </ModalDialog>
  </section>
</template>
