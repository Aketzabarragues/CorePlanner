<script setup>
/**
 * Matriz de competencias y catalogo de la empresa.
 *
 * Una fila por habilidad y una columna por persona, con el nivel de 1 a 3. Sirve
 * para ver de un vistazo quien cubre que y donde esta la concentration.
 *
 * El gerente mantiene el catalogo desde aqui: anade, renombra y quita
 * habilidades. Una habilidad que alguien tiene asignada no se puede quitar.
 */
import { computed, ref } from 'vue'

import { peopleApi } from '../../api/client'
import { useAuthStore } from '../../stores/auth'

const props = defineProps({
  people: { type: Array, required: true },
  skills: { type: Array, required: true },
  isManager: { type: Boolean, default: false },
})

const emit = defineEmits(['saved'])

const auth = useAuthStore()
const error = ref(null)
const notice = ref(null)
const newName = ref('')
const editingId = ref(null)
const editingName = ref('')

/** Nivel de una persona en una competencia. */
function levelOf(person, skillId) {
  const found = person.skills.find((item) => item.skill_id === skillId)
  return found ? found.level : 0
}

/** Iniciales de la persona, para la cabecera de la columna. */
function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

const rows = computed(() =>
  props.skills.map((skill) => ({
    ...skill,
    cells: props.people.map((person) => levelOf(person, skill.id)),
  })),
)

/** Cuantas personas tienen asignada cada habilidad. */
const usage = computed(() => {
  const counts = {}
  for (const person of props.people) {
    for (const skill of person.skills) {
      counts[skill.skill_id] = (counts[skill.skill_id] ?? 0) + 1
    }
  }
  return counts
})

async function addSkill() {
  error.value = null
  notice.value = null
  try {
    const token = await auth.ensureSession()
    await peopleApi.createSkill(token, newName.value.trim())
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
    await peopleApi.renameSkill(token, editingId.value, editingName.value.trim())
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
    await peopleApi.removeSkill(token, skill.id)
    notice.value = 'Competencia quitada del catálogo.'
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <div class="space-y-4">
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

    <section
      v-if="isManager"
      class="rounded-lg border border-slate-200 bg-white p-4"
      data-testid="skill-catalog"
    >
      <h3 class="mb-1 text-sm font-semibold text-slate-900">Catálogo de competencias</h3>
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

      <ul class="mt-3 divide-y divide-slate-100">
        <li
          v-for="skill in skills"
          :key="skill.id"
          class="flex items-center justify-between gap-2 py-1.5"
          data-testid="skill-catalog-row"
        >
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
              @click="editingId = null"
            >
              Cancelar
            </button>
          </template>
          <template v-else>
            <span class="text-sm text-slate-700">
              {{ skill.name }}
              <span class="text-xs text-slate-400">
                ({{ usage[skill.id] ?? 0 }} persona{{ (usage[skill.id] ?? 0) === 1 ? '' : 's' }})
              </span>
            </span>
            <span class="flex gap-3">
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
            </span>
          </template>
        </li>
        <li v-if="!skills.length" class="py-2 text-sm text-slate-500">
          Todavía no hay competencias en el catálogo.
        </li>
      </ul>
    </section>

    <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-3 py-2 font-medium">Habilidad</th>
            <th v-for="person in people" :key="person.id" class="px-3 py-2 text-center font-medium">
              <span
                class="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-siemens-900 text-xs font-semibold text-white"
                :title="person.name"
              >
                {{ initials(person.name) }}
              </span>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="row in rows" :key="row.id" data-testid="skill-row">
            <td class="px-3 py-2 text-slate-700">{{ row.name }}</td>
            <td v-for="(level, index) in row.cells" :key="index" class="px-3 py-2">
              <span class="flex justify-center gap-0.5">
                <span
                  v-for="dot in 3"
                  :key="dot"
                  class="h-2 w-2 rounded-full"
                  :class="dot <= level ? 'bg-siemens-700' : 'bg-slate-200'"
                ></span>
              </span>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td :colspan="people.length + 1" class="px-3 py-6 text-center text-sm text-slate-500">
              Todavía no hay competencias en el catálogo.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
