<script setup>
/**
 * Catalogo de competencias de la empresa.
 *
 * Es la lista de habilidades que se pueden asignar a la gente. Se anade, se
 * renombra y se quita mientras nadie la tenga asignada.
 */
import { ref } from 'vue'

import { skillsApi } from '../../api/client'
import { useAuthStore } from '../../stores/auth'

defineProps({
  skills: { type: Array, required: true },
})

const emit = defineEmits(['saved'])

const auth = useAuthStore()
const error = ref(null)
const notice = ref(null)
const newName = ref('')
const editingId = ref(null)
const editingName = ref('')

async function addSkill() {
  error.value = null
  notice.value = null
  try {
    const token = await auth.ensureSession()
    await skillsApi.create(token, newName.value.trim())
    newName.value = ''
    notice.value = 'Competencia añadida al catálogo.'
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}

function startRename(skill) {
  editingId.value = skill.id
  editingName.value = skill.name
}

async function saveRename() {
  error.value = null
  notice.value = null
  try {
    const token = await auth.ensureSession()
    await skillsApi.rename(token, editingId.value, editingName.value.trim())
    editingId.value = null
    notice.value = 'Competencia renombrada.'
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}

async function removeSkill(skill) {
  error.value = null
  notice.value = null
  try {
    const token = await auth.ensureSession()
    await skillsApi.remove(token, skill.id)
    notice.value = 'Competencia quitada del catálogo.'
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <section class="space-y-4">
    <p
      v-if="error"
      class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
      data-testid="skill-catalog-error"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      class="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
      data-testid="skill-catalog-notice"
    >
      {{ notice }}
    </p>

    <div class="rounded border border-slate-200 bg-white p-4">
      <h3 class="mb-1 text-sm font-semibold text-siemens-900">Catálogo de competencias</h3>
      <p class="mb-3 text-xs text-slate-500">
        Las habilidades de la empresa. Se pueden añadir, renombrar y quitar mientras
        nadie las tenga asignadas.
      </p>
      <div class="flex gap-2">
        <input
          v-model="newName"
          type="text"
          maxlength="100"
          placeholder="Nombre de la competencia"
          class="w-full rounded border border-slate-300 px-3 py-1.5 text-sm"
          data-testid="new-skill-name"
          @keyup.enter="addSkill"
        />
        <button
          type="button"
          class="rounded bg-siemens-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          :disabled="!newName.trim()"
          data-testid="add-skill"
          @click="addSkill"
        >
          Añadir
        </button>
      </div>
    </div>

    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-200 text-left">
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Competencia
          </th>
          <th class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Personas
          </th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="skill in skills"
          :key="skill.id"
          class="border-b border-slate-100"
          data-testid="skill-catalog-row"
        >
          <td class="px-2 py-2">
            <template v-if="editingId === skill.id">
              <input
                v-model="editingName"
                type="text"
                maxlength="100"
                class="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                data-testid="rename-skill-input"
                @keyup.enter="saveRename"
                @keyup.esc="editingId = null"
              />
            </template>
            <template v-else>
              <span class="font-medium text-siemens-900">{{ skill.name }}</span>
            </template>
          </td>
          <td class="px-2 py-2 text-slate-600">
            {{ skill.person_count }} persona{{ skill.person_count === 1 ? '' : 's' }}
          </td>
          <td class="px-2 py-2 text-right">
            <span class="flex justify-end gap-3">
              <template v-if="editingId === skill.id">
                <button
                  type="button"
                  class="text-sm font-medium text-siemens-700 hover:underline"
                  data-testid="save-skill-name"
                  @click="saveRename"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  class="text-sm text-slate-500 hover:underline"
                  data-testid="cancel-skill-name"
                  @click="editingId = null"
                >
                  Cancelar
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="text-sm font-medium text-siemens-700 hover:underline"
                  :data-testid="`rename-skill-${skill.id}`"
                  @click="startRename(skill)"
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  class="text-sm font-medium text-red-700 hover:underline"
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
          <td colspan="3" class="px-2 py-4 text-sm text-slate-500">
            Todavía no hay competencias en el catálogo.
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
