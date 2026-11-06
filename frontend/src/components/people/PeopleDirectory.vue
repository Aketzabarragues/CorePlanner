<script setup>
/**
 * Directorio de personas.
 *
 * Cada fila es una persona con su puesto, su tipo de contrato, el horario
 * que tiene vigente en la semana abierta y la carga que lleva en ella.
 */
import { computed } from 'vue'

const props = defineProps({
  people: { type: Array, required: true },
  week: { type: String, required: true },
})

defineEmits(['open'])

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V']

/** Horas de cada dia laborable del horario vigente. */
function weekdayChips(schedule) {
  if (!schedule) return []
  return DAY_LABELS.map((label, index) => ({
    label,
    hours: schedule.hours[index],
    active: schedule.hours[index] > 0,
  }))
}

/** Iniciales de la persona, para el avatar. */
function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

const hasLoad = computed(() => props.people.some((person) => person.hours !== null))
</script>

<template>
  <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
    <table class="w-full text-sm">
      <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
        <tr>
          <th class="px-2 py-2 font-medium">Persona</th>
          <th class="px-2 py-2 font-medium">Puesto</th>
          <th class="px-2 py-2 font-medium">Departamento</th>
          <th class="px-2 py-2 font-medium">Contrato</th>
          <th class="px-2 py-2 font-medium">Horario vigente</th>
          <th class="px-2 py-2 text-right font-medium">Factor</th>
          <th class="px-2 py-2 text-right font-medium">Capacidad</th>
          <th v-if="hasLoad" class="px-2 py-2 text-right font-medium">Carga</th>
          <th class="px-2 py-2 font-medium">Estado</th>
          <th class="px-2 py-2"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-100">
        <tr v-for="person in people" :key="person.id" data-testid="person-row">
          <td class="px-2 py-2">
            <div class="flex items-center gap-2">
              <span
                class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-siemens-900 text-xs font-semibold text-white"
              >
                {{ initials(person.name) }}
              </span>
              <span class="min-w-0">
                <span class="block truncate font-medium text-slate-900">{{ person.name }}</span>
                <span class="block truncate text-xs text-slate-500">{{ person.email }}</span>
              </span>
            </div>
          </td>
          <td class="px-2 py-2 text-slate-600">{{ person.job_title ?? '—' }}</td>
          <td class="px-2 py-2 text-slate-600">{{ person.department_name ?? '—' }}</td>
          <td class="px-2 py-2 text-slate-600">{{ person.employment_type_label }}</td>
          <td class="px-2 py-2">
            <div v-if="person.schedule" class="flex items-center gap-1">
              <span
                v-for="day in weekdayChips(person.schedule)"
                :key="day.label"
                class="flex h-5 w-5 items-center justify-center rounded text-xs"
                :class="day.active ? 'bg-slate-200 text-siemens-900' : 'bg-slate-50 text-slate-400'"
                :title="`${day.label}: ${day.hours} h`"
              >
                {{ day.label }}
              </span>
            </div>
            <span v-else class="text-xs text-slate-400">Sin horario</span>
          </td>
          <td class="px-2 py-2 text-right text-slate-600">
            {{ person.schedule ? `${person.schedule.availability_factor} %` : '—' }}
          </td>
          <td class="px-2 py-2 text-right font-medium text-slate-900">
            {{ person.capacity === null ? '—' : `${person.capacity} h` }}
          </td>
          <td v-if="hasLoad" class="px-2 py-2 text-right text-slate-600">
            {{ person.hours === null ? '—' : `${person.hours} h` }}
          </td>
          <td class="px-2 py-2">
            <span
              v-if="person.capacity === null"
              class="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
            >
              Sin capacidad
            </span>
            <span
              v-else-if="person.is_overloaded"
              class="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
            >
              Sobrecargada
            </span>
            <span
              v-else-if="person.hours === null"
              class="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
            >
              Con margen
            </span>
            <span
              v-else
              class="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
            >
              Con margen
            </span>
          </td>
          <td class="px-2 py-2 text-right">
            <button
              type="button"
              class="text-sm font-medium text-siemens-700 hover:underline"
              :data-testid="`open-profile-${person.id}`"
              @click="$emit('open', person.id)"
            >
              Perfil
            </button>
          </td>
        </tr>
        <tr v-if="!people.length">
          <td colspan="10" class="px-3 py-6 text-center text-sm text-slate-500">
            No hay personas en el ámbito.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
