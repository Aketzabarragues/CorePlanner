<script setup>
/**
 * Directorio de personas.
 *
 * Cada fila es una persona con su puesto, su tipo de contrato, el horario
 * que tiene vigente en la semana abierta y la carga que lleva en ella.
 *
 * La fila sigue el boceto: avatar md, nombre en negrita y email en mono
 * tenue, departamento con punto de color, contrato en pildora, las iniciales
 * de los dias laborables en cajitas mono, factor y capacidad en mono a la
 * derecha y el estado como pildora de tono. El boton "Perfil" abre la ficha.
 */
import { computed } from 'vue'

import PersonAvatar from '../common/PersonAvatar.vue'

const props = defineProps({
  people: { type: Array, required: true },
  week: { type: String, required: true },
  /** Departamentos (id, nombre, color): para el punto de color y el avatar. */
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

/** Color del departamento de la persona para su avatar; vacio, el neutro. */
function colorAvatar(person) {
  const dep = person.department_id
    ? props.departments.find((item) => String(item.id) === String(person.department_id))
    : null
  return dep?.color ?? ''
}

/**
 * Tono de la pildora de contrato: Techo, azul; el resto, neutro.
 * El tipo de contrato es un dato y no cambia el calculo: solo su aspecto.
 */
function claseContrato(person) {
  return person.employment_type === 'techo'
    ? 'border-info-borde bg-info-fondo text-info-texto'
    : 'border-borde bg-neutro-fondo text-neutro-texto'
}

/**
 * Pildora de estado de la fila.
 *
 * Sin horario, ambar; sin capacidad resuelta, neutra; sobrecarga, rojo;
 * sin horas imputadas, verde Disponible (todo libre); con horas dentro de
 * la capacidad, gris-azul Con margen. `whitespace-nowrap`: la pildora no
 * parte en dos lineas.
 */
function estadoDe(person) {
  if (!person.schedule) {
    return { label: 'Sin horario', clases: 'border-aviso-borde bg-aviso-fondo text-aviso-texto' }
  }
  if (person.capacity === null) {
    return { label: 'Sin capacidad', clases: 'border-borde bg-neutro-fondo text-texto-suave' }
  }
  if (person.is_overloaded) {
    return { label: 'Sobrecargada', clases: 'border-peligro-borde bg-peligro-fondo text-peligro-texto' }
  }
  if (person.hours === null) {
    return { label: 'Disponible', clases: 'border-ok-borde bg-ok-fondo text-ok-texto' }
  }
  return { label: 'Con margen', clases: 'border-borde bg-neutro-fondo text-texto-suave' }
}
</script>

<template>
  <div class="overflow-x-auto rounded-tarjeta border border-borde bg-tarjeta">
    <!--
      table-fixed: la tabla cabe en el ancho del area sin scroll horizontal.
      Cabeceras `whitespace-nowrap`: no se solapan ni parten. Puesto y
      Departamento se truncan en extremos, con el texto completo en el title.
    -->
    <table class="w-full table-fixed text-sm">
      <thead class="bg-tarjeta-suave text-left text-cp-xs uppercase tracking-wider text-texto-tenue">
        <tr>
          <th class="w-[18.5%] whitespace-nowrap px-3 py-2 font-semibold">Persona</th>
          <th class="w-[15.5%] whitespace-nowrap px-3 py-2 font-semibold">Puesto</th>
          <th class="w-[12%] whitespace-nowrap px-3 py-2 font-semibold">Departamento</th>
          <th class="w-[7.5%] whitespace-nowrap px-3 py-2 font-semibold">Contrato</th>
          <th class="w-[12%] whitespace-nowrap px-3 py-2 font-semibold">Horario vigente</th>
          <th class="w-[6%] whitespace-nowrap px-3 py-2 text-right font-semibold">Factor</th>
          <th class="w-[8.5%] whitespace-nowrap px-3 py-2 text-right font-semibold">Capacidad</th>
          <th v-if="hasLoad" class="w-[5.5%] whitespace-nowrap px-3 py-2 text-right font-semibold">Carga</th>
          <th class="w-[8.5%] whitespace-nowrap px-3 py-2 font-semibold">Estado</th>
          <th class="w-[6%] whitespace-nowrap px-3 py-2"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-borde-suave">
        <tr v-for="person in people" :key="person.id" data-testid="person-row">
          <td class="px-3 py-3">
            <div class="flex items-center gap-2.5">
              <PersonAvatar :nombre="person.name" :color="colorAvatar(person)" />
              <span class="min-w-0 leading-tight">
                <span class="block truncate text-cp-sm font-bold text-texto">{{ person.name }}</span>
                <span class="block whitespace-nowrap font-mono text-cp-xs text-texto-tenue">{{ person.email }}</span>
              </span>
            </div>
          </td>
          <td class="px-3 py-3 text-cp-sm font-medium text-texto-suave">
            <span class="block truncate whitespace-nowrap" :title="person.job_title">
              {{ person.job_title ?? '—' }}
            </span>
          </td>
          <td class="px-3 py-3 text-cp-sm text-texto-suave">
            <span class="flex min-w-0 items-center gap-1.5" :title="person.department_name">
              <span
                v-if="person.department_id"
                class="h-1.5 w-1.5 flex-none rounded-full"
                :style="{ backgroundColor: colorDepartamento(person.department_id) }"
                aria-hidden="true"
              ></span>
              <span class="truncate whitespace-nowrap">{{ person.department_name ?? '—' }}</span>
            </span>
          </td>
          <td class="px-3 py-3">
            <span
              class="whitespace-nowrap rounded-control border px-2 py-0.5 text-cp-xs font-medium"
              :class="claseContrato(person)"
            >
              {{ person.employment_type_label }}
            </span>
          </td>
          <td class="px-3 py-3">
            <div v-if="person.schedule" class="flex items-center gap-1">
              <span
                v-for="day in weekdayChips(person.schedule)"
                :key="day.label"
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-cp-xs"
                :class="
                  day.active
                    ? 'border border-borde bg-tarjeta-suave text-primario-fuerte'
                    : 'border border-borde-suave bg-tarjeta text-texto-tenue'
                "
                :title="`${day.label}: ${day.hours} h`"
              >
                {{ day.label }}
              </span>
            </div>
            <span v-else class="text-cp-xs text-texto-tenue">Sin horario</span>
          </td>
          <td class="whitespace-nowrap px-3 py-3 text-right font-mono text-cp-xs text-texto-suave">
            {{ person.schedule ? `${person.schedule.availability_factor} %` : '—' }}
          </td>
          <td class="whitespace-nowrap px-3 py-3 text-right font-mono text-cp-xs font-bold text-texto">
            {{ person.capacity === null ? '—' : `${person.capacity} h` }}
          </td>
          <td v-if="hasLoad" class="whitespace-nowrap px-3 py-3 text-right font-mono text-cp-xs text-texto-suave">
            {{ person.hours === null ? '—' : `${person.hours} h` }}
          </td>
          <td class="px-3 py-3">
            <span
              class="whitespace-nowrap rounded-pastilla border px-2 py-0.5 text-cp-xs font-medium"
              :class="estadoDe(person).clases"
            >
              {{ estadoDe(person).label }}
            </span>
          </td>
          <td class="px-3 py-3 text-right">
            <button
              type="button"
              class="rounded-control border border-borde bg-tarjeta px-2.5 py-1 text-cp-xs font-semibold text-primario-medio transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              :data-testid="`open-profile-${person.id}`"
              @click="$emit('open', person.id)"
            >
              Perfil
            </button>
          </td>
        </tr>
        <tr v-if="!people.length">
          <td colspan="9" class="px-3 py-6 text-center text-sm text-texto-tenue">
            No hay personas en el ámbito.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
