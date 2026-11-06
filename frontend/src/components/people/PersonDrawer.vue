<script setup>
/**
 * Ficha de una persona.
 *
 * Muestra su identidad profesional, el horario que tiene vigente y el
 * historial de horarios, que es donde se ve como ha cambiado su capacidad.
 * El gerente puede anadir una version de horario y fijar sus competencias.
 */
import { computed, ref, watch } from 'vue'

import { peopleApi } from '../../api/client'
import { useAuthStore } from '../../stores/auth'

const props = defineProps({
  person: { type: Object, required: true },
  skills: { type: Array, required: true },
  isManager: { type: Boolean, default: false },
  week: { type: String, required: true },
})

const emit = defineEmits(['close', 'saved'])

const auth = useAuthStore()
const profile = ref(null)
const loading = ref(false)
const error = ref(null)
const notice = ref(null)

const DAY_FIELDS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]
const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const scheduleForm = ref({
  valid_from: '',
  hours: [8, 8, 8, 8, 8, 0, 0],
  availability_factor: 100,
  note: '',
})

const skillLevels = ref({})

const history = computed(() => profile.value?.schedule_history ?? [])

/** Competencias de la persona con su nivel, en el orden del catalogo. */
const personSkills = computed(() => {
  const levels = skillLevels.value
  return props.skills
    .map((skill) => ({ ...skill, level: levels[skill.id] ?? 0 }))
    .filter((skill) => skill.level > 0)
})

function dayChips(entry) {
  return DAY_FIELDS.map((field, index) => ({
    label: DAY_LABELS[index],
    hours: entry.hours[index],
    active: entry.hours[index] > 0,
  }))
}

async function loadProfile() {
  loading.value = true
  try {
    const token = await auth.ensureSession()
    profile.value = await peopleApi.profile(token, props.person.id, { week: props.week })
    skillLevels.value = Object.fromEntries(
      (profile.value.skills ?? []).map((skill) => [skill.skill_id, skill.level]),
    )
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

watch(() => props.person.id, loadProfile, { immediate: true })

async function addSchedule() {
  error.value = null
  notice.value = null
  try {
    const token = await auth.ensureSession()
    const days = scheduleForm.value.hours.map((hours) => Math.round(Number(hours) * 100))
    await peopleApi.addSchedule(token, props.person.id, {
      valid_from: scheduleForm.value.valid_from,
      days,
      availability_factor: Number(scheduleForm.value.availability_factor),
      note: scheduleForm.value.note || null,
    })
    notice.value = 'Horario guardado.'
    await loadProfile()
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}

async function saveSkills() {
  error.value = null
  notice.value = null
  try {
    const token = await auth.ensureSession()
    const skills = Object.entries(skillLevels.value)
      .filter(([, level]) => Number(level) > 0)
      .map(([skillId, level]) => ({ skill_id: Number(skillId), level: Number(level) }))
    await peopleApi.setSkills(token, props.person.id, skills)
    notice.value = 'Competencias guardadas.'
    await loadProfile()
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex justify-end bg-slate-900/40" @click.self="$emit('close')">
    <div
      class="flex w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-xl"
      data-testid="person-drawer"
    >
      <header class="flex items-start justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 class="text-base font-semibold text-siemens-900">{{ person.name }}</h2>
          <p class="mt-0.5 text-sm text-slate-500">
            {{ [person.job_title, person.department_name, person.seniority_label].filter(Boolean).join(' · ') }}
          </p>
        </div>
        <button
          type="button"
          class="text-sm text-slate-500 hover:text-slate-700"
          data-testid="close-profile"
          @click="$emit('close')"
        >
          Cerrar
        </button>
      </header>

      <div class="flex-1 space-y-6 px-5 py-4">
        <p v-if="error" class="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {{ error }}
        </p>
        <p v-if="notice" class="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {{ notice }}
        </p>

        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt class="text-slate-500">Correo</dt>
          <dd class="text-slate-900">{{ person.email }}</dd>
          <dt class="text-slate-500">Rol de empresa</dt>
          <dd class="text-slate-900">{{ person.company_role_label }}</dd>
          <dt class="text-slate-500">Tipo de contrato</dt>
          <dd class="text-slate-900">{{ person.employment_type_label }}</dd>
          <dt class="text-slate-500">Factor de disponibilidad</dt>
          <dd class="text-slate-900">
            {{ person.schedule ? `${person.schedule.availability_factor} %` : '—' }}
          </dd>
          <dt class="text-slate-500">Capacidad de la semana</dt>
          <dd class="text-slate-900">
            {{ person.capacity === null ? 'Sin definir' : `${person.capacity} h` }}
          </dd>
          <dt class="text-slate-500">Carga de la semana</dt>
          <dd class="text-slate-900">
            {{ person.hours === null ? 'No visible' : `${person.hours} h` }}
          </dd>
        </dl>

        <section>
          <h3 class="mb-2 text-sm font-semibold text-slate-900">Historial de horarios</h3>
          <div v-if="loading" class="text-sm text-slate-500">Cargando...</div>
          <div v-else-if="!history.length" class="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            No hay horario vigente. Su capacidad se desconoce, así que no se marca como sobrecargada:
            el motor no inventa un límite que nadie ha definido.
          </div>
          <table v-else class="w-full text-sm">
            <thead class="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th class="py-1 font-medium">Vigente desde</th>
                <th class="py-1 font-medium">Días</th>
                <th class="py-1 text-right font-medium">Factor</th>
                <th class="py-1 pl-4 font-medium">Nota</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="entry in history" :key="entry.id" data-testid="schedule-history-row">
                <td class="py-2 text-slate-900">{{ entry.valid_from }}</td>
                <td class="py-2">
                  <span class="flex gap-1">
                    <span
                      v-for="day in dayChips(entry)"
                      :key="day.label"
                      class="flex h-6 w-6 items-center justify-center rounded text-xs"
                      :class="day.active ? 'bg-slate-200 text-siemens-900' : 'bg-slate-50 text-slate-400'"
                      :title="`${day.label}: ${day.hours} h`"
                    >
                      {{ day.label }}
                    </span>
                  </span>
                </td>
                <td class="py-2 text-right whitespace-nowrap text-slate-600">{{ entry.availability_factor }} %</td>
                <td class="py-2 pl-4 text-slate-500">{{ entry.note ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h3 class="mb-2 text-sm font-semibold text-slate-900">Habilidades</h3>
          <div v-if="personSkills.length" class="flex flex-wrap gap-2">
            <span
              v-for="skill in personSkills"
              :key="skill.skill_id"
              class="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
            >
              {{ skill.name }} · {{ skill.level }}/3
            </span>
          </div>
          <p v-else class="text-sm text-slate-500">Sin competencias asignadas.</p>
        </section>

        <template v-if="isManager">
          <section class="rounded-lg border border-slate-200 p-4">
            <h3 class="mb-3 text-sm font-semibold text-slate-900">Nueva versión de horario</h3>
            <div class="grid grid-cols-7 gap-2">
              <label v-for="(label, index) in DAY_LABELS" :key="label" class="text-xs text-slate-500">
                {{ label }}
                <input
                  v-model.number="scheduleForm.hours[index]"
                  type="number"
                  min="0"
                  max="24"
                  step="0.25"
                  class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  :data-testid="`schedule-day-${index}`"
                />
              </label>
            </div>
            <div class="mt-3 grid grid-cols-3 gap-3">
              <label class="text-xs text-slate-500">
                Vigente desde
                <input
                  v-model="scheduleForm.valid_from"
                  type="date"
                  class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  data-testid="schedule-valid-from"
                />
              </label>
              <label class="text-xs text-slate-500">
                Factor (%)
                <input
                  v-model.number="scheduleForm.availability_factor"
                  type="number"
                  min="0"
                  max="100"
                  class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  data-testid="schedule-factor"
                />
              </label>
              <label class="text-xs text-slate-500">
                Nota
                <input
                  v-model="scheduleForm.note"
                  type="text"
                  maxlength="255"
                  class="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  data-testid="schedule-note"
                />
              </label>
            </div>
            <button
              type="button"
              class="mt-3 rounded bg-siemens-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              :disabled="!scheduleForm.valid_from"
              data-testid="save-schedule"
              @click="addSchedule"
            >
              Guardar horario
            </button>
          </section>

          <section class="rounded-lg border border-slate-200 p-4">
            <h3 class="mb-3 text-sm font-semibold text-slate-900">Competencias</h3>
            <div class="grid grid-cols-2 gap-2">
              <label v-for="skill in skills" :key="skill.id" class="flex items-center justify-between text-sm">
                <span class="text-slate-700">{{ skill.name }}</span>
                <select
                  v-model.number="skillLevels[skill.id]"
                  class="rounded border border-slate-300 px-2 py-1 text-sm"
                  :data-testid="`skill-level-${skill.id}`"
                >
                  <option :value="0">—</option>
                  <option :value="1">1</option>
                  <option :value="2">2</option>
                  <option :value="3">3</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              class="mt-3 rounded bg-siemens-900 px-3 py-1.5 text-sm font-medium text-white"
              data-testid="save-skills"
              @click="saveSkills"
            >
              Guardar competencias
            </button>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>
