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

import { NIVEL_COMPETENCIA, nivelTexto } from '../../utils/people'
import PersonAvatar from '../common/PersonAvatar.vue'

const props = defineProps({
  people: { type: Array, required: true },
  skills: { type: Array, required: true },
  /** Departamentos (id, nombre, color): para el avatar de la cabecera. */
  departments: { type: Array, default: () => [] },
})

/** Color del departamento de la persona para su avatar; vacio, el neutro. */
function colorAvatar(person) {
  const dep = person.department_id
    ? props.departments.find((item) => String(item.id) === String(person.department_id))
    : null
  return dep?.color ?? ''
}

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
  <div class="overflow-x-auto rounded-tarjeta border border-borde bg-tarjeta">
    <table class="w-full text-sm">
      <thead class="bg-tarjeta-suave text-left text-xs uppercase tracking-wide text-texto-tenue">
        <tr>
          <th class="px-3 py-2 font-medium">Habilidad</th>
          <th v-for="person in people" :key="person.id" class="px-3 py-2 text-center font-medium">
            <PersonAvatar :nombre="person.name" :color="colorAvatar(person)" class="mx-auto" :title="person.name" />
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-borde-suave">
        <tr v-for="row in rows" :key="row.id" data-testid="skill-row">
          <td class="px-3 py-2 text-texto-suave">{{ row.name }}</td>
          <td v-for="(level, index) in row.cells" :key="index" class="px-3 py-2">
            <!-- Sin nivel no hay pastilla activa: texto tenue, no puntos. -->
            <span v-if="level === 0" class="text-cp-xs text-texto-tenue" data-testid="skill-level-none">
              0 · Sin asignar
            </span>
            <span v-else class="flex items-center justify-center gap-2" :data-testid="`skill-level-${level}`">
              <!-- Puntos: la forma, no solo el color -->
              <span class="flex gap-0.5" aria-hidden="true">
                <span
                  v-for="dot in 3"
                  :key="dot"
                  class="h-2 w-2 rounded-full"
                  :class="dot <= level ? 'bg-primario-medio' : 'bg-borde'"
                ></span>
              </span>
              <span
                class="rounded-pastilla bg-tarjeta-suave px-2 py-0.5 font-mono text-cp-xs font-semibold tabular-nums text-texto-suave"
                :title="nivelTexto(level)"
              >
                {{ level }} · {{ NIVEL_COMPETENCIA[level] }}
              </span>
            </span>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="people.length + 1" class="px-3 py-6 text-center text-sm text-texto-tenue">
            Todavía no hay competencias en el catálogo.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
