<script setup>
/**
 * Calendario laboral de la organizacion.
 *
 * Los dias no laborables se dan de alta y se consultan en el mismo sitio: a la
 * izquierda el mes, a la derecha el detalle del dia que se elige. El detalle
 * dice a quien aplica el festivo, cuanta jornada quita y cuanto le cuesta a
 * cada persona.
 *
 * El mes vive en la URL, de modo que recargar la pagina no lo cambia.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { calendarApi, workCalendarApi } from '../../api/client'
import { useAuthStore } from '../../stores/auth'
import { hoursText, jornadaLabel, scopeText } from '../../utils/labor'
import {
  currentMonthKey,
  longDateLabel,
  monthGrid,
  monthLabel,
  shiftMonth,
} from '../../utils/month'
import { isoWeekKey } from '../../utils/weeks'
import AlertBanner from '../common/AlertBanner.vue'
import LaborMonthGrid from '../LaborMonthGrid.vue'
import ModalDialog from '../ModalDialog.vue'

const props = defineProps({
  departments: { type: Array, default: () => [] },
  people: { type: Array, default: () => [] },
  /** Solo el gerente da de alta y quita dias no laborables. */
  editable: { type: Boolean, default: true },
})

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const month = ref(
  typeof route.query.month === 'string' && route.query.month ? route.query.month : currentMonthKey(),
)
const days = ref([])
const impact = ref([])
const selectedDate = ref('')
const error = ref(null)
const notice = ref(null)
const saving = ref(false)
const deleting = ref(null)
const form = ref({
  date: '',
  name: '',
  scope: 'global',
  department_id: '',
  user_id: '',
  half_day: false,
})

/**
 * Rango que se pide al servidor.
 *
 * Va del primer dia de la primera semana del mes al ultimo de la ultima, de
 * modo que las semanas del cuadro de impacto salen completas.
 */
const range = computed(() => {
  const weeks = monthGrid(month.value)
  return {
    from: weeks[0][0].date,
    to: weeks[weeks.length - 1][6].date,
  }
})

/** Dias no laborables del dia elegido. */
const selectedDays = computed(() => days.value.filter((day) => day.date === selectedDate.value))

/** Semana a la que pertenece el dia elegido. */
const selectedWeek = computed(() => {
  if (!selectedDate.value) return null
  return isoWeekKey(new Date(`${selectedDate.value}T00:00:00Z`))
})

/** Cuanta capacidad le quita a cada persona el festivo de esa semana. */
const weekImpact = computed(() =>
  impact.value.filter((row) => row.week === selectedWeek.value),
)

/** Color de la pila del alcance de un dia no laborable. */
function scopePill(scope) {
  if (scope === 'person') return 'bg-violet-100 text-violet-800'
  if (scope === 'department') return 'bg-amber-100 text-amber-800'
  return 'bg-slate-200 text-slate-700'
}

/** Tareas que cruzan el dia elegido. */
const affectedTasks = computed(() =>
  selectedDays.value.reduce((sum, day) => sum + Number(day.affected_task_count ?? 0), 0),
)

async function load() {
  try {
    const token = await auth.ensureSession()
    const report = await workCalendarApi.report(token, {
      from: range.value.from,
      to: range.value.to,
    })
    days.value = report.days ?? []
    impact.value = report.impact ?? []
    error.value = null
  } catch (err) {
    error.value = err.message
  }
}

/** Cambia de mes y lo deja en la URL. */
function setMonth(value) {
  month.value = value
  router.replace({ query: { ...route.query, month: value } })
}

function step(delta) {
  setMonth(shiftMonth(month.value, delta))
}

/** Elige el dia y lo deja seleccionado. */
function selectDate(date) {
  selectedDate.value = date
  if (!form.value.date) form.value.date = date
}

/** Prepara el alta de un dia no laborable en la fecha elegida. */
function startNewDay() {
  form.value = {
    date: selectedDate.value,
    name: '',
    scope: 'global',
    department_id: '',
    user_id: '',
    half_day: false,
  }
}

async function addDay() {
  error.value = null
  notice.value = null
  saving.value = true
  try {
    const token = await auth.ensureSession()
    await calendarApi.create(token, {
      date: form.value.date,
      name: form.value.name,
      scope: form.value.scope,
      department_id:
        form.value.scope === 'department' ? Number(form.value.department_id) : null,
      user_id: form.value.scope === 'person' ? Number(form.value.user_id) : null,
      half_day: form.value.half_day,
    })
    form.value = {
      date: selectedDate.value,
      name: '',
      scope: 'global',
      department_id: '',
      user_id: '',
      half_day: false,
    }
    notice.value = 'Día no laborable añadido.'
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

/** Quita un dia no laborable, previa confirmacion. */
async function removeDay() {
  if (!deleting.value) return
  error.value = null
  saving.value = true
  try {
    const token = await auth.ensureSession()
    await calendarApi.remove(token, deleting.value.id)
    notice.value = 'Día no laborable eliminado.'
    deleting.value = null
    await load()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}

watch(month, load)
onMounted(load)
</script>

<template>
  <div>
    <AlertBanner v-if="error" variant="error" class="mb-3" data-testid="labor-error">
      {{ error }}
    </AlertBanner>
    <AlertBanner v-if="notice" variant="success" class="mb-3" data-testid="labor-notice">
      {{ notice }}
    </AlertBanner>

    <div class="grid gap-4 lg:grid-cols-3">
      <section
        aria-label="Calendario de días no laborables"
        class="rounded border border-slate-200 bg-white p-4 lg:col-span-2"
      >
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex h-10 w-10 items-center justify-center rounded border border-slate-300 bg-white text-slate-700"
              aria-label="Mes anterior"
              data-testid="labor-prev"
              @click="step(-1)"
            >
              ‹
            </button>
            <h2 class="min-w-36 text-center text-sm font-semibold text-siemens-900" data-testid="labor-month">
              {{ monthLabel(month) }}
            </h2>
            <button
              type="button"
              class="flex h-10 w-10 items-center justify-center rounded border border-slate-300 bg-white text-slate-700"
              aria-label="Mes siguiente"
              data-testid="labor-next"
              @click="step(1)"
            >
              ›
            </button>
            <button
              type="button"
              class="h-10 rounded border border-siemens-900 bg-siemens-900 px-3 text-sm text-white"
              data-testid="labor-today"
              @click="setMonth(currentMonthKey())"
            >
              Hoy
            </button>
          </div>
          <p class="text-xs text-slate-500">
            Pulsa un día para ver a quién afecta y cuántas horas de capacidad se pierden.
          </p>
        </div>

        <LaborMonthGrid
          :month="month"
          :days="days"
          selectable
          :selected="selectedDate"
          @select="selectDate"
        />
      </section>

      <aside
        aria-label="Detalle del día"
        class="rounded border border-slate-200 bg-white p-4"
        data-testid="labor-detail"
      >
        <template v-if="!selectedDate">
          <p class="text-sm text-slate-500">Selecciona un día del mes.</p>
        </template>

        <template v-else-if="!selectedDays.length">
          <div class="flex flex-col gap-2 py-4 text-center">
            <span class="text-base font-semibold text-siemens-900">
              {{ longDateLabel(selectedDate) }}
            </span>
            <p class="text-sm text-slate-500">
              <template v-if="editable">
                Día laborable normal. Puedes marcarlo como no laborable para todos, para un
                departamento o para una persona.
              </template>
              <template v-else>Día laborable normal.</template>
            </p>
            <button
              v-if="editable"
              type="button"
              class="mx-auto h-10 rounded bg-siemens-900 px-4 text-sm font-semibold text-white"
              data-testid="labor-add-day"
              @click="startNewDay"
            >
              Añadir día no laborable
            </button>
          </div>
        </template>

        <template v-else>
          <div class="flex flex-col gap-1">
            <span class="text-xs text-slate-500">{{ longDateLabel(selectedDate) }}</span>
            <span
              v-for="day in selectedDays"
              :key="day.id"
              class="text-lg font-semibold text-siemens-900"
              data-testid="labor-day-name"
            >
              {{ day.name }}
            </span>
            <span
              v-for="day in selectedDays"
              :key="`scope-${day.id}`"
              class="mt-1 inline-block self-start rounded-full px-2 py-0.5 text-xs font-semibold"
              :class="scopePill(day.scope)"
              data-testid="labor-day-scope"
            >
              {{ scopeText(day) }} · {{ jornadaLabel(day.half_day) }}
            </span>
          </div>

          <div class="mt-3 border-t border-slate-200 pt-3">
            <span class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Impacto en la capacidad semanal
            </span>
            <div role="list" class="mt-1 flex flex-col">
              <div
                v-for="row in weekImpact"
                :key="`${row.user_id}-${row.week}`"
                role="listitem"
                class="flex items-center gap-2 border-t border-slate-100 py-1.5 first:border-t-0"
                data-testid="labor-impact-row"
              >
                <span class="flex-1 text-sm text-slate-700">{{ row.user_name }}</span>
                <span class="text-xs tabular-nums text-slate-600">
                  {{ hoursText(row.capacity_without) }} h →
                  {{ hoursText(row.capacity_effective) }} h
                </span>
                <span
                  class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700"
                >
                  −{{ hoursText(row.difference) }} h
                </span>
              </div>
              <p v-if="!weekImpact.length" class="py-1.5 text-xs text-slate-500">
                Este festivo no le quita horas a nadie.
              </p>
            </div>
          </div>

          <div
            v-if="affectedTasks"
            class="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800"
            data-testid="labor-warning"
          >
            <span>
              Hay {{ affectedTasks }} tarea(s) cuyas fechas cruzan este día. Sus horas se
              repartirán entre los días que quedan.
            </span>
          </div>

          <div v-if="editable" class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="h-10 rounded border border-slate-300 bg-white px-3 text-sm text-slate-700"
              data-testid="labor-edit-day"
              @click="startNewDay"
            >
              Añadir otro
            </button>
            <button
              type="button"
              class="h-10 rounded border border-red-300 bg-white px-3 text-sm font-semibold text-red-700"
              data-testid="labor-delete-day"
              @click="deleting = selectedDays[0]"
            >
              Eliminar…
            </button>
          </div>
        </template>
      </aside>
    </div>

    <form
      v-if="editable"
      class="mt-4 rounded border border-slate-200 bg-white p-4"
      data-testid="non-working-form"
      @submit.prevent="addDay"
    >
      <h3 class="mb-3 text-sm font-semibold text-siemens-900">Añadir día no laborable</h3>
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label class="text-xs text-slate-500">
          Fecha
          <input
            v-model="form.date"
            type="date"
            required
            class="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
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
            class="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            data-testid="day-name"
          />
        </label>
        <label class="text-xs text-slate-500">
          Alcance
          <select
            v-model="form.scope"
            class="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            data-testid="day-scope"
          >
            <option value="global">Global</option>
            <option value="department">Departamento</option>
            <option value="person">Persona</option>
          </select>
        </label>
        <label v-if="form.scope === 'department'" class="text-xs text-slate-500">
          Departamento
          <select
            v-model="form.department_id"
            required
            class="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            data-testid="day-department"
          >
            <option value="" disabled>Selecciona...</option>
            <option v-for="department in departments" :key="department.id" :value="department.id">
              {{ department.name }}
            </option>
          </select>
        </label>
        <label v-else-if="form.scope === 'person'" class="text-xs text-slate-500">
          Persona
          <select
            v-model="form.user_id"
            required
            class="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            data-testid="day-user"
          >
            <option value="" disabled>Selecciona...</option>
            <option v-for="person in people" :key="person.id" :value="person.id">
              {{ person.name }}
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
        :disabled="saving"
        class="mt-3 h-10 rounded bg-siemens-900 px-4 text-sm font-medium text-white disabled:opacity-60"
        data-testid="save-day"
      >
        Añadir al calendario
      </button>
    </form>

    <section class="mt-4 rounded border border-slate-200 bg-white p-4">
      <h2 class="text-sm font-semibold text-siemens-900">Impacto en la capacidad del mes</h2>
      <p class="mt-0.5 text-xs text-slate-500">
        Solo las semanas en las que un día no laborable quita horas.
      </p>
      <table class="mt-3 w-full text-sm" data-testid="labor-impact">
        <thead>
          <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th class="whitespace-nowrap py-1.5 pr-2 font-medium">Persona</th>
            <th class="whitespace-nowrap py-1.5 pr-2 font-medium">Semana</th>
            <th class="whitespace-nowrap py-1.5 pr-2 font-medium">Motivo</th>
            <th class="whitespace-nowrap py-1.5 pr-2 text-right font-medium">Capacidad sin festivo</th>
            <th class="whitespace-nowrap py-1.5 pr-2 text-right font-medium">Capacidad efectiva</th>
            <th class="whitespace-nowrap py-1.5 text-right font-medium">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in impact"
            :key="`${row.user_id}-${row.week}`"
            class="border-b border-slate-100"
            data-testid="labor-impact-month-row"
          >
            <td class="py-1.5 pr-2 text-slate-900">{{ row.user_name }}</td>
            <td class="py-1.5 pr-2 text-slate-700">{{ row.week }}</td>
            <td class="py-1.5 pr-2 text-slate-700">{{ row.reasons.join(', ') }}</td>
            <td class="py-1.5 pr-2 text-right text-slate-700">{{ hoursText(row.capacity_without) }}</td>
            <td class="py-1.5 pr-2 text-right text-slate-700">{{ hoursText(row.capacity_effective) }}</td>
            <td class="py-1.5 text-right font-medium text-red-600">
              -{{ hoursText(row.difference) }}
            </td>
          </tr>
          <tr v-if="!impact.length">
            <td colspan="6" class="py-4 text-center text-slate-500" data-testid="labor-impact-empty">
              Ningún día no laborable quita horas en este mes.
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <ModalDialog
      :open="Boolean(deleting)"
      title="Eliminar día no laborable"
      @close="deleting = null"
    >
      <p class="text-sm text-slate-700">
        Se va a eliminar «{{ deleting?.name }}» del {{ deleting?.date }}. Las horas de
        capacidad se recuperan.
      </p>
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="h-10 rounded border border-slate-300 bg-white px-3 text-sm text-slate-700"
          data-testid="labor-cancel-delete"
          @click="deleting = null"
        >
          Cancelar
        </button>
        <button
          type="button"
          :disabled="saving"
          class="h-10 rounded border border-red-300 bg-white px-3 text-sm font-semibold text-red-700 disabled:opacity-60"
          data-testid="labor-confirm-delete"
          @click="removeDay"
        >
          Eliminar
        </button>
      </div>
    </ModalDialog>
  </div>
</template>
