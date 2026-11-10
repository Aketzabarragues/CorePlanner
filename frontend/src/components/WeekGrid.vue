<script setup>
/**
 * Vista semanal: una fila por persona.
 *
 * Es un envoltorio de los carriles: calcula los dias laborables de la semana
 * ISO y les pasa las personas visibles, las tareas ya filtradas y los dias no
 * laborables. Quien dibuja es `WeekLanes`, que es el mismo que usa la vista de
 * mes.
 */
import { computed } from 'vue'

import WeekLanes from './common/WeekLanes.vue'
import { weekWorkdays } from '../utils/weeks'

const props = defineProps({
  /** Clave de la semana ISO: "2026-W45". */
  weekKey: { type: String, required: true },
  /** Personas visibles, ordenadas por departamento y luego por nombre. */
  people: { type: Array, default: () => [] },
  /** Tareas ya filtradas. */
  tasks: { type: Array, default: () => [] },
  /** Dias no laborables. */
  nonWorkingDays: { type: Array, default: () => [] },
})

const emit = defineEmits(['open-day', 'open-task'])

/** Dias laborables de la semana, de lunes a viernes. */
const days = computed(() => weekWorkdays(props.weekKey))
</script>

<template>
  <div data-testid="week-grid">
    <WeekLanes
      :days="days"
      :people="people"
      :tasks="tasks"
      :non-working-days="nonWorkingDays"
      @open-day="emit('open-day', $event)"
      @open-task="emit('open-task', $event)"
    />
  </div>
</template>
