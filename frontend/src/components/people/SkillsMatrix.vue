<script setup>
/**
 * Matriz de competencias.
 *
 * Una fila por habilidad y una columna por persona, con el nivel de 1 a 3. Sirve
 * para ver de un vistazo quien cubre que y donde esta la concentration.
 *
 * El catalogo de la empresa se mantiene en Configuracion: aqui solo se mira
 * como se reparten las habilidades.
 */
import { computed } from 'vue'

import { initials } from '../../utils/people'

const props = defineProps({
  people: { type: Array, required: true },
  skills: { type: Array, required: true },
})

/** Nivel de una persona en una competencia. */
function levelOf(person, skillId) {
  const found = person.skills.find((item) => item.skill_id === skillId)
  return found ? found.level : 0
}

const rows = computed(() =>
  props.skills.map((skill) => ({
    ...skill,
    cells: props.people.map((person) => levelOf(person, skill.id)),
  })),
)
</script>

<template>
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
</template>
