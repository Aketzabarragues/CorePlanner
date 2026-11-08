<script setup>
/**
 * Calendario laboral: dias no laborables con su alcance.
 *
 * Un dia global se quita a todo el mundo; uno de departamento, solo a quien
 * pertenece a ese departamento. El gerente es quien lo mantiene.
 */
import { ref } from 'vue'

import { calendarApi } from '../../api/client'
import AlertBanner from '../common/AlertBanner.vue'
import { useAuthStore } from '../../stores/auth'

const props = defineProps({
  days: { type: Array, required: true },
  departments: { type: Array, required: true },
  isManager: { type: Boolean, default: false },
})

const emit = defineEmits(['saved'])

const auth = useAuthStore()
const error = ref(null)
const notice = ref(null)
const form = ref({
  date: '',
  name: '',
  scope: 'global',
  department_id: '',
  half_day: false,
})

async function addDay() {
  error.value = null
  notice.value = null
  try {
    const token = await auth.ensureSession()
    await calendarApi.create(token, {
      date: form.value.date,
      name: form.value.name,
      scope: form.value.scope,
      department_id:
        form.value.scope === 'department' ? Number(form.value.department_id) : null,
      half_day: form.value.half_day,
    })
    form.value = { date: '', name: '', scope: 'global', department_id: '', half_day: false }
    notice.value = 'Día no laborable añadido.'
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}

async function removeDay(day) {
  error.value = null
  try {
    const token = await auth.ensureSession()
    await calendarApi.remove(token, day.id)
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <div class="space-y-4">
    <AlertBanner v-if="error" variant="error" data-testid="calendar-error">
      {{ error }}
    </AlertBanner>
    <AlertBanner v-if="notice" variant="success" data-testid="calendar-notice">
      {{ notice }}
    </AlertBanner>

    <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th class="px-3 py-2 font-medium">Fecha</th>
            <th class="px-3 py-2 font-medium">Motivo</th>
            <th class="px-3 py-2 font-medium">Alcance</th>
            <th class="px-3 py-2 font-medium">Jornada</th>
            <th v-if="isManager" class="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="day in days" :key="day.id" data-testid="non-working-row">
            <td class="px-3 py-2 text-slate-900">{{ day.date }}</td>
            <td class="px-3 py-2 text-slate-600">{{ day.name }}</td>
            <td class="px-3 py-2">
              <span
                v-if="day.scope === 'global'"
                class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
              >
                Global
              </span>
              <span
                v-else
                class="rounded-full bg-siemens-900 px-2 py-0.5 text-xs text-white"
              >
                {{ day.department_name ?? 'Departamento' }}
              </span>
            </td>
            <td class="px-3 py-2 text-slate-600">{{ day.half_day ? 'Medio día' : 'Jornada entera' }}</td>
            <td v-if="isManager" class="px-3 py-2 text-right">
              <button
                type="button"
                class="text-sm font-medium text-red-700 hover:underline"
                :data-testid="`remove-day-${day.id}`"
                @click="removeDay(day)"
              >
                Quitar
              </button>
            </td>
          </tr>
          <tr v-if="!days.length">
            <td :colspan="isManager ? 5 : 4" class="px-3 py-6 text-center text-sm text-slate-500">
              No hay días no laborables registrados.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <form
      v-if="isManager"
      class="rounded-lg border border-slate-200 bg-white p-4"
      data-testid="non-working-form"
      @submit.prevent="addDay"
    >
      <h3 class="mb-3 text-sm font-semibold text-slate-900">Añadir día no laborable</h3>
      <div class="grid grid-cols-4 gap-3">
        <label class="text-xs text-slate-500">
          Fecha
          <input
            v-model="form.date"
            type="date"
            required
            class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            data-testid="day-date"
          />
        </label>
        <label class="text-xs text-slate-500">
          Motivo
          <input
            v-model="form.name"
            type="text"
            required
            maxlength="255"
            class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            data-testid="day-name"
          />
        </label>
        <label class="text-xs text-slate-500">
          Alcance
          <select
            v-model="form.scope"
            class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            data-testid="day-scope"
          >
            <option value="global">Global</option>
            <option value="department">Departamento</option>
          </select>
        </label>
        <label v-if="form.scope === 'department'" class="text-xs text-slate-500">
          Departamento
          <select
            v-model="form.department_id"
            required
            class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            data-testid="day-department"
          >
            <option value="" disabled>Selecciona...</option>
            <option v-for="department in departments" :key="department.id" :value="department.id">
              {{ department.name }}
            </option>
          </select>
        </label>
      </div>
      <label class="mt-3 flex items-center gap-2 text-sm text-slate-600">
        <input v-model="form.half_day" type="checkbox" class="h-4 w-4 rounded" data-testid="day-half" />
        Medio día laborable
      </label>
      <button
        type="submit"
        class="mt-3 rounded bg-siemens-900 px-3 py-1.5 text-sm font-medium text-white"
        data-testid="save-day"
      >
        Añadir al calendario
      </button>
    </form>
  </div>
</template>
