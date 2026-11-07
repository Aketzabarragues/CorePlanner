<script setup>
/**
 * Mi trabajo.
 *
 * Vista personal: las tareas propias y las horas de cada semana del periodo de
 * planificacion. El periodo es el mismo que muestra la matriz de capacidad
 * global, de modo que las dos vistas hablan de las mismas semanas.
 *
 * Es de lectura: las tareas se editan en el tablero o en el desglose de una
 * celda de la matriz.
 */
import { computed, onMounted, ref } from 'vue'

import { myWorkApi } from '../api/client'
import { useAuthStore } from '../stores/auth'
import { columnLabel, formatHours } from '../utils/kanban'

const auth = useAuthStore()

const report = ref(null)
const error = ref(null)
const loading = ref(true)

const weeks = computed(() => report.value?.weeks ?? [])
const tasks = computed(() => report.value?.tasks ?? [])
const totalHours = computed(() => report.value?.total_hours ?? 0)

async function load() {
  try {
    const token = await auth.ensureSession()
    report.value = await myWorkApi.list(token)
    error.value = null
  } catch (err) {
    error.value = err.message
  }
}

onMounted(async () => {
  await load()
  loading.value = false
})
</script>

<template>
  <div>
    <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold text-siemens-900">Mi trabajo</h1>
        <p class="mt-1 text-sm text-slate-500">
          Tareas propias y carga por semana en el periodo de planificacion.
        </p>
      </div>

      <p v-if="!loading && !error" class="text-sm text-slate-600">
        {{ tasks.length }} tarea(s) · {{ formatHours(totalHours) }} en el periodo
      </p>
    </header>

    <p v-if="loading" class="text-sm text-slate-500">Cargando...</p>

    <p
      v-else-if="error"
      class="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
      data-testid="my-work-error"
    >
      {{ error }}
    </p>

    <template v-else>
      <p
        v-if="report?.has_overload"
        class="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        data-testid="my-work-overload"
      >
        En rojo, las semanas en las que superas tu capacidad. Reparte el trabajo o
        avisa al responsable del proyecto.
      </p>

      <section class="mb-6">
        <h2 class="mb-2 text-sm font-semibold text-slate-700">Carga por semana</h2>
        <div class="overflow-x-auto rounded border border-slate-200 bg-white">
          <table class="w-full border-collapse text-sm" data-testid="my-work-weeks">
            <thead>
              <tr class="bg-slate-100">
                <th class="border border-slate-200 px-3 py-2 text-left">Semana</th>
                <th class="border border-slate-200 px-3 py-2 text-right">Horas</th>
                <th class="border border-slate-200 px-3 py-2 text-right">Capacidad</th>
                <th class="border border-slate-200 px-3 py-2 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cell in weeks" :key="cell.week" data-testid="my-work-week">
                <th class="border border-slate-200 bg-white px-3 py-2 text-left font-medium">
                  {{ cell.week }}
                </th>
                <td
                  class="border border-slate-200 px-3 py-2 text-right tabular-nums"
                  :class="cell.is_overloaded
                    ? 'bg-red-200 font-semibold text-red-900'
                    : 'text-slate-700'"
                >
                  {{ formatHours(cell.hours) }}
                </td>
                <td class="border border-slate-200 px-3 py-2 text-right tabular-nums text-slate-600">
                  {{ cell.capacity === null ? 'sin definir' : formatHours(cell.capacity) }}
                </td>
                <td class="border border-slate-200 px-3 py-2">
                  <span
                    v-if="cell.is_overloaded"
                    class="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                  >
                    Sobrecargado
                  </span>
                  <span
                    v-else
                    class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                  >
                    En su capacidad
                  </span>
                </td>
              </tr>
              <tr v-if="!weeks.length">
                <td colspan="4" class="px-3 py-4 text-center text-sm text-slate-500">
                  No hay actividad planificada en los proyectos visibles.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 class="mb-2 text-sm font-semibold text-slate-700">Tareas</h2>
        <div class="overflow-x-auto rounded border border-slate-200 bg-white">
          <table class="w-full border-collapse text-sm" data-testid="my-work-tasks">
            <thead>
              <tr class="bg-slate-100">
                <th class="border border-slate-200 px-3 py-2 text-left">Tarea</th>
                <th class="border border-slate-200 px-3 py-2 text-left">Proyecto</th>
                <th class="border border-slate-200 px-3 py-2 text-left">Estado</th>
                <th class="border border-slate-200 px-3 py-2 text-left">Fechas</th>
                <th class="border border-slate-200 px-3 py-2 text-right">Horas</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in tasks" :key="task.id" data-testid="my-work-task">
                <th class="border border-slate-200 bg-white px-3 py-2 text-left font-medium">
                  {{ task.title }}
                </th>
                <td class="border border-slate-200 px-3 py-2 text-slate-600">
                  {{ task.project_name }}
                </td>
                <td class="border border-slate-200 px-3 py-2 text-slate-600">
                  {{ columnLabel(task.status) }}
                </td>
                <td class="border border-slate-200 px-3 py-2 text-slate-600 tabular-nums">
                  {{ task.start_date }} → {{ task.end_date }}
                </td>
                <td class="border border-slate-200 px-3 py-2 text-right tabular-nums">
                  {{ formatHours(task.hours) }}
                </td>
              </tr>
              <tr v-if="!tasks.length">
                <td colspan="5" class="px-3 py-4 text-center text-sm text-slate-500">
                  No tienes tareas asignadas en este periodo.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
