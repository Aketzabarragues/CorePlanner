<script setup>
import { computed, onMounted, ref, watch } from 'vue'

import { workCalendarApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import LaborMonthGrid from '../components/LaborMonthGrid.vue'
import AlertBanner from '../components/common/AlertBanner.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { hoursText, jornadaLabel, scopeText, shortDate } from '../utils/labor'
import { currentMonthKey, monthGrid, monthLabel, shiftMonth } from '../utils/month'

const auth = useAuthStore()

const month = ref(currentMonthKey())
const days = ref([])
const impact = ref([])
const error = ref(null)
const loading = ref(true)

/**
 * Rango que se pide al servidor.
 *
 * Va del lunes de la primera semana del mes al domingo de la ultima, de modo
 * que las semanas del cuadro de impacto salen completas.
 */
const range = computed(() => {
  const weeks = monthGrid(month.value)
  return {
    from: weeks[0][0].date,
    to: weeks[weeks.length - 1][6].date,
  }
})

async function load() {
  loading.value = true
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
  } finally {
    loading.value = false
  }
}

function step(delta) {
  month.value = shiftMonth(month.value, delta)
}

function goToday() {
  month.value = currentMonthKey()
}

watch(month, load)
onMounted(load)
useTaskReload(load)
</script>

<template>
  <div>
    <PageHeader
      title="Calendario laboral"
      subtitle="Los días no laborables, a quién afectan y qué capacidad quitan."
    >
      <template #actions>
          <button
            type="button"
            class="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700"
            title="Mes anterior"
            data-testid="labor-prev"
            @click="step(-1)"
          >
            ‹
          </button>
          <span class="w-40 text-center text-sm font-medium text-slate-800" data-testid="labor-month">
            {{ monthLabel(month) }}
          </span>
          <button
            type="button"
            class="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700"
            title="Mes siguiente"
            data-testid="labor-next"
            @click="step(1)"
          >
            ›
          </button>
          <button
            type="button"
            class="rounded border border-siemens-900 bg-siemens-900 px-3 py-1.5 text-sm text-white"
            data-testid="labor-today"
            @click="goToday"
          >
            Hoy
          </button>

      </template>
    </PageHeader>

    <AlertBanner v-if="error" variant="error" class="mt-3" data-testid="labor-error">
      {{ error }}
    </AlertBanner>

    <div class="mt-4 grid gap-4 lg:grid-cols-3">
      <section class="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-4">
        <h2 class="text-sm font-semibold text-slate-800">Días no laborables</h2>
        <p class="mt-0.5 text-xs text-slate-500">
          El alcance dice a quién aplica: a todo el mundo, a un departamento o a
          una persona.
        </p>
        <table class="mt-3 w-full text-sm" data-testid="labor-days">
          <thead>
            <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th class="whitespace-nowrap py-1.5 pr-2 font-medium">Fecha</th>
              <th class="whitespace-nowrap py-1.5 pr-2 font-medium">Festivo</th>
              <th class="whitespace-nowrap py-1.5 pr-2 font-medium">Alcance</th>
              <th class="whitespace-nowrap py-1.5 pr-2 font-medium">Jornada</th>
              <th class="whitespace-nowrap py-1.5 text-right font-medium">Tareas afectadas</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="day in days"
              :key="day.id"
              class="border-b border-slate-100"
              data-testid="labor-day"
            >
              <td class="py-1.5 pr-2 text-slate-700">{{ shortDate(day.date) }}</td>
              <td class="py-1.5 pr-2 text-slate-900">{{ day.name }}</td>
              <td class="py-1.5 pr-2 text-slate-700">{{ scopeText(day) }}</td>
              <td class="py-1.5 pr-2">
                <span
                  v-if="day.half_day"
                  class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                >
                  {{ jornadaLabel(day.half_day) }}
                </span>
                <span v-else class="text-slate-700">{{ jornadaLabel(day.half_day) }}</span>
              </td>
              <td class="py-1.5 text-right text-slate-700">{{ day.affected_task_count }}</td>
            </tr>
            <tr v-if="!days.length">
              <td colspan="5" class="py-4 text-center text-slate-500" data-testid="labor-empty">
                No hay días no laborables en este mes.
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="rounded-lg border border-slate-200 bg-white p-4">
        <h2 class="text-sm font-semibold text-slate-800">{{ monthLabel(month) }}</h2>
        <div class="mt-3">
          <LaborMonthGrid :month="month" :days="days" />
        </div>
      </section>
    </div>

    <section class="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 class="text-sm font-semibold text-slate-800">Impacto en la capacidad semanal</h2>
      <p class="mt-0.5 text-xs text-slate-500">
        Solo las semanas en las que un día no laborable quita horas.
      </p>
      <table class="mt-3 w-full text-sm" data-testid="labor-impact">
        <thead>
          <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th class="py-1.5 pr-2 font-medium">Persona</th>
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
            data-testid="labor-impact-row"
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
  </div>
</template>
