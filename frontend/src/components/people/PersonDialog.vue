<script setup>
/**
 * Ficha de una persona.
 *
 * Muestra su identidad profesional, el horario que tiene vigente y el
 * historial de horarios, que es donde se ve como ha cambiado su capacidad.
 * El gerente puede anadir una version de horario y fijar sus competencias.
 *
 * Usa ModalDialog (size="xl") como contenedor unificado de overlays.
 */
import { computed, ref, watch } from 'vue'

import { peopleApi } from '../../api/client'
import AlertBanner from '../common/AlertBanner.vue'
import AsyncState from '../common/AsyncState.vue'
import ModalDialog from '../ModalDialog.vue'
import { useAuthStore } from '../../stores/auth'
import { useToastStore } from '../../stores/toast'
import { NIVEL_COMPETENCIA } from '../../utils/people'
import PersonAvatar from '../common/PersonAvatar.vue'

const props = defineProps({
  person: { type: Object, required: true },
  skills: { type: Array, required: true },
  isManager: { type: Boolean, default: false },
  week: { type: String, required: true },
  /** Departamentos (id, nombre, color): para el avatar del perfil. */
  departments: { type: Array, default: () => [] },
})

const emit = defineEmits(['close', 'saved'])

const auth = useAuthStore()
const toast = useToastStore()
const profile = ref(null)
const loading = ref(false)
const error = ref(null)

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

/** Version de horario que se esta corrigiendo; null significa una nueva. */
const editingScheduleId = ref(null)

const skillLevels = ref({})

const history = computed(() => profile.value?.schedule_history ?? [])

/** Competencias de la persona con su nivel, en el orden del catalogo. */
const personSkills = computed(() => {
  const levels = skillLevels.value
  return props.skills
    .map((skill) => ({ ...skill, level: levels[skill.id] ?? 0 }))
    .filter((skill) => skill.level > 0)
})

/** Color del departamento del perfil para su avatar; vacio, el neutro. */
function colorAvatar() {
  const dep = props.person.department_id
    ? props.departments.find((item) => String(item.id) === String(props.person.department_id))
    : null
  return dep?.color ?? ''
}

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
  try {
    const token = await auth.ensureSession()
    const days = scheduleForm.value.hours.map((hours) => Math.round(Number(hours) * 100))
    const payload = {
      days,
      availability_factor: Number(scheduleForm.value.availability_factor),
      note: scheduleForm.value.note || null,
    }
    if (editingScheduleId.value === null) {
      await peopleApi.addSchedule(token, props.person.id, {
        ...payload,
        valid_from: scheduleForm.value.valid_from,
      })
      toast.success('Horario guardado.')
    } else {
      await peopleApi.updateSchedule(token, props.person.id, editingScheduleId.value, payload)
      toast.success('Horario corregido.')
    }
    editingScheduleId.value = null
    await loadProfile()
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}

/** Carga una version de horario en el formulario para corregirla. */
function startEditSchedule(entry) {
  editingScheduleId.value = entry.id
  scheduleForm.value = {
    valid_from: entry.valid_from,
    hours: entry.hours,
    availability_factor: entry.availability_factor,
    note: entry.note ?? '',
  }
}

function cancelEditSchedule() {
  editingScheduleId.value = null
  scheduleForm.value = {
    valid_from: '',
    hours: [8, 8, 8, 8, 8, 0, 0],
    availability_factor: 100,
    note: '',
  }
}

async function removeSchedule(entry) {
  error.value = null
  try {
    const token = await auth.ensureSession()
    await peopleApi.removeSchedule(token, props.person.id, entry.id)
    if (editingScheduleId.value === entry.id) cancelEditSchedule()
    toast.success('Versión de horario quitada.')
    await loadProfile()
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}

async function saveSkills() {
  error.value = null
  try {
    const token = await auth.ensureSession()
    const skills = Object.entries(skillLevels.value)
      .filter(([, level]) => Number(level) > 0)
      .map(([skillId, level]) => ({ skill_id: Number(skillId), level: Number(level) }))
    await peopleApi.setSkills(token, props.person.id, skills)
    toast.success('Competencias guardadas.')
    await loadProfile()
    emit('saved')
  } catch (err) {
    error.value = err.message
  }
}
</script>

<template>
  <ModalDialog
    :open="true"
    :title="person.name"
    :subtitle="[person.job_title, person.department_name, person.seniority_label].filter(Boolean).join(' · ')"
    size="xl"
    data-testid="person-drawer"
    @close="$emit('close')"
  >
      <div class="space-y-6">
        <AlertBanner v-if="error" variant="error">
          {{ error }}
        </AlertBanner>

        <div class="flex items-center gap-3">
          <PersonAvatar :nombre="person.name" :color="colorAvatar()" tamano="lg" />
          <div class="min-w-0">
            <p class="truncate text-cp-base font-semibold text-texto">{{ person.name }}</p>
            <p class="truncate text-cp-xs text-texto-tenue">
              {{ [person.job_title, person.department_name, person.seniority_label].filter(Boolean).join(' · ') }}
            </p>
          </div>
        </div>

        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt class="text-texto-tenue">Correo</dt>
          <dd class="text-texto">{{ person.email }}</dd>
          <dt class="text-texto-tenue">Rol de empresa</dt>
          <dd class="text-texto">{{ person.company_role_label }}</dd>
          <dt class="text-texto-tenue">Tipo de contrato</dt>
          <dd class="text-texto">{{ person.employment_type_label }}</dd>
          <dt class="text-texto-tenue">Factor de disponibilidad</dt>
          <dd class="text-texto">
            {{ person.schedule ? `${person.schedule.availability_factor} %` : '—' }}
          </dd>
          <dt class="text-texto-tenue">Capacidad de la semana</dt>
          <dd class="text-texto">
            {{ person.capacity === null ? 'Sin definir' : `${person.capacity} h` }}
          </dd>
          <dt class="text-texto-tenue">Carga de la semana</dt>
          <dd class="text-texto">
            {{ person.hours === null ? 'No visible' : `${person.hours} h` }}
          </dd>
        </dl>

        <section>
          <h3 class="mb-2 text-sm font-semibold text-texto">Historial de horarios</h3>
          <AsyncState
            :loading="loading"
            :empty="!history.length"
            empty-title="No hay horario vigente"
            empty-text="Su capacidad se desconoce, así que no se marca como sobrecargada: el motor no inventa un límite que nadie ha definido."
            loading-label="Cargando el historial de horarios"
          >
            <table class="w-full text-sm">
              <thead class="text-left text-xs uppercase tracking-wide text-texto-tenue">
                <tr>
                  <th class="py-1 font-medium">Vigente desde</th>
                  <th class="py-1 font-medium">Días</th>
                  <th class="py-1 text-right font-medium">Factor</th>
                  <th class="py-1 pl-4 font-medium">Nota</th>
                  <th v-if="isManager" class="py-1 pl-4 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-borde-suave">
                <tr v-for="entry in history" :key="entry.id" data-testid="schedule-history-row">
                  <td class="py-2 text-texto">{{ entry.valid_from }}</td>
                  <td class="py-2">
                    <span class="flex gap-1">
                      <span
                        v-for="day in dayChips(entry)"
                        :key="day.label"
                        class="flex h-6 w-6 items-center justify-center rounded text-xs"
                        :class="day.active ? 'bg-borde text-primario-fuerte' : 'bg-tarjeta-suave text-texto-tenue'"
                        :title="`${day.label}: ${day.hours} h`"
                      >
                        {{ day.label }}
                      </span>
                    </span>
                  </td>
                  <td class="py-2 text-right whitespace-nowrap text-texto-suave">{{ entry.availability_factor }} %</td>
                  <td class="py-2 pl-4 text-texto-tenue">{{ entry.note ?? '—' }}</td>
                  <td v-if="isManager" class="py-2 pl-4">
                    <span class="flex gap-3 whitespace-nowrap">
                      <button
                        type="button"
                        class="text-sm font-medium text-primario-medio hover:underline"
                        :data-testid="`edit-schedule-${entry.id}`"
                        @click="startEditSchedule(entry)"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        class="text-sm font-medium text-peligro-texto hover:underline"
                        :data-testid="`remove-schedule-${entry.id}`"
                        @click="removeSchedule(entry)"
                      >
                        Quitar
                      </button>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </AsyncState>
        </section>

        <!-- Mismo formato que el directorio: nombre, puntos y nivel en texto. -->
        <section>
          <h3 class="mb-2 text-sm font-semibold text-texto">Habilidades</h3>
          <div v-if="personSkills.length" class="flex flex-wrap gap-2">
            <span
              v-for="skill in personSkills"
              :key="skill.skill_id"
              class="inline-flex items-center gap-2 rounded-pastilla border border-borde bg-tarjeta-suave px-2.5 py-1 text-cp-xs text-texto-suave"
              data-testid="profile-skill"
            >
              <span class="font-medium text-texto">{{ skill.name }}</span>

              <span class="flex gap-0.5" aria-hidden="true">
                <span
                  v-for="dot in 3"
                  :key="dot"
                  class="h-1.5 w-1.5 rounded-full"
                  :class="dot <= skill.level ? 'bg-primario-medio' : 'bg-borde'"
                ></span>
              </span>

              <span class="font-mono font-semibold tabular-nums text-texto">
                {{ skill.level }} · {{ NIVEL_COMPETENCIA[skill.level] }}
              </span>
            </span>
          </div>
          <p v-else class="text-sm text-texto-tenue">Sin competencias asignadas.</p>
        </section>

        <template v-if="isManager">
          <section class="rounded-tarjeta border border-borde p-4">
            <h3 class="mb-3 text-sm font-semibold text-texto">
              {{ editingScheduleId === null ? 'Nueva versión de horario' : 'Corregir versión de horario' }}
            </h3>
            <div class="grid grid-cols-7 gap-2">
              <label v-for="(label, index) in DAY_LABELS" :key="label" class="text-xs text-texto-tenue">
                {{ label }}
                <input
                  v-model.number="scheduleForm.hours[index]"
                  type="number"
                  min="0"
                  max="24"
                  step="0.25"
                  class="mt-1 w-full rounded-control border border-borde-fuerte px-2 py-1 text-sm"
                  :data-testid="`schedule-day-${index}`"
                />
              </label>
            </div>
            <div class="mt-3 grid grid-cols-3 gap-3">
              <label class="text-xs text-texto-tenue">
                Vigente desde
                <input
                  v-model="scheduleForm.valid_from"
                  type="date"
                  :disabled="editingScheduleId !== null"
                  class="mt-1 w-full rounded-control border border-borde-fuerte px-2 py-1 text-sm disabled:bg-neutro-fondo"
                  data-testid="schedule-valid-from"
                />
              </label>
              <label class="text-xs text-texto-tenue">
                Factor (%)
                <input
                  v-model.number="scheduleForm.availability_factor"
                  type="number"
                  min="0"
                  max="100"
                  class="mt-1 w-full rounded-control border border-borde-fuerte px-2 py-1 text-sm"
                  data-testid="schedule-factor"
                />
              </label>
              <label class="text-xs text-texto-tenue">
                Nota
                <input
                  v-model="scheduleForm.note"
                  type="text"
                  maxlength="255"
                  class="mt-1 w-full rounded-control border border-borde-fuerte px-2 py-1 text-sm"
                  data-testid="schedule-note"
                />
              </label>
            </div>
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                class="rounded-control bg-primario-fuerte px-3 py-1.5 text-sm font-medium text-texto-inverso disabled:opacity-50"
                :disabled="!scheduleForm.valid_from"
                data-testid="save-schedule"
                @click="addSchedule"
              >
                {{ editingScheduleId === null ? 'Guardar horario' : 'Guardar cambios' }}
              </button>
              <button
                v-if="editingScheduleId !== null"
                type="button"
                class="rounded-control border border-borde-fuerte px-3 py-1.5 text-sm text-texto-suave"
                data-testid="cancel-schedule"
                @click="cancelEditSchedule"
              >
                Cancelar
              </button>
            </div>
          </section>

          <section class="rounded-tarjeta border border-borde p-4">
            <h3 class="mb-3 text-sm font-semibold text-texto">Competencias</h3>
            <div class="grid grid-cols-2 gap-2">
              <label v-for="skill in skills" :key="skill.id" class="flex items-center justify-between text-sm">
                <span class="text-texto-suave">{{ skill.name }}</span>
                <select
                  v-model.number="skillLevels[skill.id]"
                  class="rounded-control border border-borde-fuerte px-2 py-1 text-sm"
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
              class="mt-3 rounded-control bg-primario-fuerte px-3 py-1.5 text-sm font-medium text-texto-inverso"
              data-testid="save-skills"
              @click="saveSkills"
            >
              Guardar competencias
            </button>
          </section>
        </template>
      </div>
  </ModalDialog>
</template>
