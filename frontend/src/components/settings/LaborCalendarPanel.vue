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
import { useToastStore } from '../../stores/toast'
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
const toast = useToastStore()
const route = useRoute()
const router = useRouter()

const month = ref(
  typeof route.query.month === 'string' && route.query.month ? route.query.month : currentMonthKey(),
)
const days = ref([])
const impact = ref([])
const selectedDate = ref('')
const error = ref(null)
const saving = ref(false)
const deleting = ref(null)
const formOpen = ref(false)
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
  if (scope === 'person') return 'bg-info-fondo text-info-texto'
  if (scope === 'department') return 'bg-aviso-fondo text-aviso-texto'
  return 'bg-neutro-fondo text-neutro-texto'
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

/** Prepara el alta de un dia no laborable en la fecha elegida y abre el dialogo. */
function startNewDay() {
  form.value = {
    date: selectedDate.value,
    name: '',
    scope: 'global',
    department_id: '',
    user_id: '',
    half_day: false,
  }
  formOpen.value = true
}

async function addDay() {
  error.value = null
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
    formOpen.value = false
    toast.success('Día no laborable añadido.')
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
    toast.success('Día no laborable eliminado.')
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

    <div class="grid gap-4 lg:grid-cols-3">
      <section
        aria-label="Calendario de días no laborables"
        class="rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta lg:col-span-2"
      >
        <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-borde-suave px-4 py-3">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="flex h-10 w-10 items-center justify-center rounded-control border border-borde-fuerte bg-tarjeta text-cp-sm text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              aria-label="Mes anterior"
              data-testid="labor-prev"
              @click="step(-1)"
            >
              ‹
            </button>
            <h2 class="min-w-36 text-center font-titulo text-cp-base font-semibold text-texto-marca" data-testid="labor-month">
              {{ monthLabel(month) }}
            </h2>
            <button
              type="button"
              class="flex h-10 w-10 items-center justify-center rounded-control border border-borde-fuerte bg-tarjeta text-cp-sm text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              aria-label="Mes siguiente"
              data-testid="labor-next"
              @click="step(1)"
            >
              ›
            </button>
            <button
              type="button"
              class="inline-flex min-h-10 items-center rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="labor-today"
              @click="setMonth(currentMonthKey())"
            >
              Hoy
            </button>
          </div>
          <p class="text-cp-xs text-texto-tenue">
            Pulsa un día para ver a quién afecta y cuántas horas de capacidad se pierden.
          </p>
        </header>

        <div class="p-4">
          <LaborMonthGrid
            :month="month"
            :days="days"
            selectable
            :selected="selectedDate"
            @select="selectDate"
          />
        </div>
      </section>

      <aside
        aria-label="Detalle del día"
        class="rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta"
        data-testid="labor-detail"
      >
        <div class="p-4">
          <template v-if="!selectedDate">
            <p class="text-cp-sm text-texto-suave">Selecciona un día del mes.</p>
          </template>

          <template v-else-if="!selectedDays.length">
            <div class="flex flex-col gap-2 py-4 text-center">
              <span class="font-titulo text-cp-base font-semibold text-texto-marca">
                {{ longDateLabel(selectedDate) }}
              </span>
              <p class="text-cp-sm text-texto-suave">
                <template v-if="editable">
                  Día laborable normal. Puedes marcarlo como no laborable para todos, para un
                  departamento o para una persona.
                </template>
                <template v-else>Día laborable normal.</template>
              </p>
              <button
                v-if="editable"
                type="button"
                class="mx-auto inline-flex min-h-10 items-center rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                data-testid="labor-add-day"
                @click="startNewDay"
              >
                Añadir día no laborable
              </button>
            </div>
          </template>

          <template v-else>
            <div class="flex flex-col gap-1">
              <span class="text-cp-xs text-texto-tenue">{{ longDateLabel(selectedDate) }}</span>
              <span
                v-for="day in selectedDays"
                :key="day.id"
                class="font-titulo text-cp-titulo font-semibold text-texto-marca"
                data-testid="labor-day-name"
              >
                {{ day.name }}
              </span>
              <span
                v-for="day in selectedDays"
                :key="`scope-${day.id}`"
                class="mt-1 inline-block self-start rounded-pastilla px-2 py-0.5 text-cp-xs font-medium"
                :class="scopePill(day.scope)"
                data-testid="labor-day-scope"
              >
                {{ scopeText(day) }} · {{ jornadaLabel(day.half_day) }}
              </span>
            </div>

            <div class="mt-3 border-t border-borde-suave pt-3">
              <span class="text-cp-micro font-semibold uppercase tracking-wider text-texto-tenue">
                Impacto en la capacidad semanal
              </span>
              <div role="list" class="mt-1 flex flex-col">
                <div
                  v-for="row in weekImpact"
                  :key="`${row.user_id}-${row.week}`"
                  role="listitem"
                  class="flex items-center gap-2 border-t border-borde-suave py-1.5 first:border-t-0"
                  data-testid="labor-impact-row"
                >
                  <span class="flex-1 text-cp-sm text-texto">{{ row.user_name }}</span>
                  <span class="text-cp-xs tabular-nums text-texto-suave">
                    {{ hoursText(row.capacity_without) }} h →
                    {{ hoursText(row.capacity_effective) }} h
                  </span>
                  <span
                    class="rounded-pastilla bg-tarjeta-suave px-2 py-0.5 text-cp-xs font-medium tabular-nums text-texto"
                  >
                    −{{ hoursText(row.difference) }} h
                  </span>
                </div>
                <p v-if="!weekImpact.length" class="py-1.5 text-cp-xs text-texto-tenue">
                  Este festivo no le quita horas a nadie.
                </p>
              </div>
            </div>

            <div
              v-if="affectedTasks"
              class="mt-3 flex items-start gap-2 rounded-control border border-aviso-borde bg-aviso-fondo p-2.5 text-cp-xs text-aviso-texto"
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
                class="inline-flex min-h-10 items-center rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                data-testid="labor-edit-day"
                @click="startNewDay"
              >
                Añadir otro
              </button>
              <button
                type="button"
                class="inline-flex min-h-10 items-center rounded-control border border-peligro-borde bg-tarjeta px-3 py-1.5 text-cp-sm font-semibold text-peligro-texto transition-colors hover:bg-peligro-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                data-testid="labor-delete-day"
                @click="deleting = selectedDays[0]"
              >
                Eliminar…
              </button>
            </div>
          </template>
        </div>
      </aside>
    </div>

    <ModalDialog
      :open="formOpen"
      title="Añadir día no laborable"
      size="md"
      @close="formOpen = false"
    >
      <form id="form-dia-no-laborable" data-testid="non-working-form" @submit.prevent="addDay">
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block text-cp-xs font-medium text-texto">
            Fecha
            <input
              v-model="form.date"
              type="date"
              required
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="day-date"
            />
          </label>
          <label class="block text-cp-xs font-medium text-texto">
            Motivo
            <input
              v-model="form.name"
              type="text"
              required
              maxlength="255"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="day-name"
            />
          </label>
          <label class="block text-cp-xs font-medium text-texto">
            Alcance
            <select
              v-model="form.scope"
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="day-scope"
            >
              <option value="global">Global</option>
              <option value="department">Departamento</option>
              <option value="person">Persona</option>
            </select>
          </label>
          <label v-if="form.scope === 'department'" class="block text-cp-xs font-medium text-texto">
            Departamento
            <select
              v-model="form.department_id"
              required
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="day-department"
            >
              <option value="" disabled>Selecciona...</option>
              <option v-for="department in departments" :key="department.id" :value="department.id">
                {{ department.name }}
              </option>
            </select>
          </label>
          <label v-else-if="form.scope === 'person'" class="block text-cp-xs font-medium text-texto">
            Persona
            <select
              v-model="form.user_id"
              required
              class="mt-1 w-full rounded-control border border-borde-fuerte bg-tarjeta-suave px-3 py-2 text-cp-sm text-texto transition-colors hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="day-user"
            >
              <option value="" disabled>Selecciona...</option>
              <option v-for="person in people" :key="person.id" :value="person.id">
                {{ person.name }}
              </option>
            </select>
          </label>
        </div>
        <label class="mt-3 flex items-center gap-2 text-cp-sm font-medium text-texto">
          <input v-model="form.half_day" type="checkbox" class="h-4 w-4 rounded" data-testid="day-half" />
          Medio día laborable
        </label>
      </form>

      <template #footer="{ submit }">
        <button
          type="button"
          @click="submit"
          :disabled="saving"
          class="inline-flex min-h-10 items-center gap-1.5 rounded-control bg-primario-fuerte px-3 py-1.5 text-cp-sm font-semibold text-sobre-primario shadow-primaria transition-colors hover:bg-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:opacity-60"
          data-testid="save-day"
        >
          Añadir al calendario
        </button>
      </template>
    </ModalDialog>

    <section class="mt-4 rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta">
      <header class="border-b border-borde-suave px-4 py-3">
        <h2 class="font-titulo text-cp-titulo font-bold text-texto-marca">Impacto en la capacidad del mes</h2>
        <p class="mt-0.5 text-cp-xs text-texto-tenue">
          Solo las semanas en las que un día no laborable quita horas.
        </p>
      </header>
      <div class="p-4">
        <div class="overflow-x-auto rounded-control border border-borde bg-tarjeta" data-testid="labor-impact">
          <table class="w-full text-cp-sm">
            <thead class="bg-tarjeta-suave text-left text-cp-micro uppercase tracking-wider text-texto-tenue">
              <tr>
                <th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Persona</th>
                <th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Semana</th>
                <th class="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Motivo</th>
                <th class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Capacidad sin festivo</th>
                <th class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Capacidad efectiva</th>
                <th class="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Diferencia</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-borde-suave">
              <tr
                v-for="row in impact"
                :key="`${row.user_id}-${row.week}`"
                data-testid="labor-impact-month-row"
              >
                <td class="px-3 py-2 text-texto">{{ row.user_name }}</td>
                <td class="px-3 py-2 text-texto-suave">{{ row.week }}</td>
                <td class="px-3 py-2 text-texto-suave">{{ row.reasons.join(', ') }}</td>
                <td class="px-3 py-2 text-right text-texto-suave">{{ hoursText(row.capacity_without) }}</td>
                <td class="px-3 py-2 text-right text-texto-suave">{{ hoursText(row.capacity_effective) }}</td>
                <td class="px-3 py-2 text-right font-medium text-peligro-texto">
                  -{{ hoursText(row.difference) }}
                </td>
              </tr>
              <tr v-if="!impact.length">
                <td colspan="6" class="px-3 py-4 text-center text-cp-sm text-texto-tenue" data-testid="labor-impact-empty">
                  Ningún día no laborable quita horas en este mes.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <ModalDialog
      :open="Boolean(deleting)"
      title="Eliminar día no laborable"
      size="sm"
      @close="deleting = null"
    >
      <p class="text-cp-sm text-texto">
        Se va a eliminar «{{ deleting?.name }}» del {{ deleting?.date }}. Las horas de
        capacidad se recuperan.
      </p>

      <template #footer>
        <button
          type="button"
          class="inline-flex min-h-10 items-center rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          data-testid="labor-cancel-delete"
          @click="deleting = null"
        >
          Cancelar
        </button>
        <button
          type="button"
          :disabled="saving"
          class="inline-flex min-h-10 items-center rounded-control border border-peligro-borde bg-tarjeta px-3 py-1.5 text-cp-sm font-semibold text-peligro-texto transition-colors hover:bg-peligro-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco disabled:opacity-60"
          data-testid="labor-confirm-delete"
          @click="removeDay"
        >
          Eliminar
        </button>
      </template>
    </ModalDialog>
  </div>
</template>
