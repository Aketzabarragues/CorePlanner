<script setup>
/**
 * Directorio de personas.
 *
 * Cada fila es una persona con su puesto, su tipo de contrato, el horario
 * que tiene vigente en la semana abierta y la carga que lleva en ella.
 */
import { computed } from 'vue'

import { initials } from '../../utils/people'

const props = defineProps({
  people: { type: Array, required: true },
  week: { type: String, required: true },
  /** Departamentos (id, nombre, color): para el punto de color de la fila. */
  departments: { type: Array, default: () => [] },
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

const hasLoad = computed(() => props.people.some((person) => person.hours !== null))

/** Color del departamento por id (dato del backend); sin color, punto neutro. */
function colorDepartamento(id) {
  const dep = props.departments.find((item) => String(item.id) === String(id))
  return dep?.color ?? 'rgb(var(--cp-neutro-punto))'
}
</script>

<template>
  <div class="overflow-x-auto rounded-tarjeta border border-borde bg-tarjeta">
    <!-- Ancho minimo: la tabla se desplaza horizontal en vez de cortarse. -->
    <table class="w-full min-w-[960px] text-sm">
      <thead class="bg-tarjeta-suave text-left text-xs uppercase tracking-wide text-texto-tenue">
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
      <tbody class="divide-y divide-borde-suave">
        <tr v-for="person in people" :key="person.id" data-testid="person-row">
          <td class="px-2 py-2">
            <div class="flex items-center gap-2">
              <span
                class="flex h-8 w-8 flex-none items-center justify-center rounded-avatar bg-primario-fuerte text-xs font-semibold text-texto-inverso"
              >
                {{ initials(person.name) }}
              </span>
              <span class="min-w-0">
                <span class="block truncate font-medium text-texto">{{ person.name }}</span>
                <span class="block truncate text-xs text-texto-tenue">{{ person.email }}</span>
              </span>
            </div>
          </td>
          <td class="px-2 py-2 text-texto-suave">{{ person.job_title ?? '—' }}</td>
          <td class="px-2 py-2 text-texto-suave">
            <span class="flex items-center gap-1.5">
              <span
                v-if="person.department_id"
                class="h-1.5 w-1.5 flex-none rounded-full"
                :style="{ backgroundColor: colorDepartamento(person.department_id) }"
                aria-hidden="true"
              ></span>
              {{ person.department_name ?? '—' }}
            </span>
          </td>
          <td class="px-2 py-2">
            <span
              class="whitespace-nowrap rounded-control bg-neutro-fondo px-2 py-0.5 text-cp-xs font-semibold text-neutro-texto"
            >
              {{ person.employment_type_label }}
            </span>
          </td>
          <td class="px-2 py-2">
            <div v-if="person.schedule" class="flex items-center gap-1">
              <span
                v-for="day in weekdayChips(person.schedule)"
                :key="day.label"
                class="flex h-5 w-5 items-center justify-center rounded text-xs"
                :class="day.active ? 'bg-borde text-primario-fuerte' : 'bg-tarjeta-suave text-texto-tenue'"
                :title="`${day.label}: ${day.hours} h`"
              >
                {{ day.label }}
              </span>
            </div>
            <span v-else class="text-xs text-texto-tenue">Sin horario</span>
          </td>
          <td class="px-2 py-2 text-right text-texto-suave">
            {{ person.schedule ? `${person.schedule.availability_factor} %` : '—' }}
          </td>
          <td class="px-2 py-2 text-right font-medium text-texto">
            {{ person.capacity === null ? '—' : `${person.capacity} h` }}
          </td>
          <td v-if="hasLoad" class="px-2 py-2 text-right text-texto-suave">
            {{ person.hours === null ? '—' : `${person.hours} h` }}
          </td>
          <td class="px-2 py-2">
            <span
              v-if="person.capacity === null"
              class="whitespace-nowrap rounded-pastilla bg-neutro-fondo px-2 py-0.5 text-xs text-texto-suave"
            >
              Sin capacidad
            </span>
            <span
              v-else-if="person.is_overloaded"
              class="whitespace-nowrap rounded-pastilla bg-peligro-fondo px-2 py-0.5 text-xs font-medium text-peligro-texto"
            >
              Sobrecargada
            </span>
            <span
              v-else-if="person.hours === null"
              class="whitespace-nowrap rounded-pastilla bg-neutro-fondo px-2 py-0.5 text-xs text-texto-suave"
            >
              Con margen
            </span>
            <span
              v-else
              class="whitespace-nowrap rounded-pastilla bg-ok-fondo px-2 py-0.5 text-xs font-medium text-ok-texto"
            >
              Con margen
            </span>
          </td>
          <td class="px-2 py-2 text-right">
            <button
              type="button"
              class="text-sm font-medium text-primario-medio hover:underline"
              :data-testid="`open-profile-${person.id}`"
              @click="$emit('open', person.id)"
            >
              Perfil
            </button>
          </td>
        </tr>
        <tr v-if="!people.length">
          <td colspan="10" class="px-3 py-6 text-center text-sm text-texto-tenue">
            No hay personas en el ámbito.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
