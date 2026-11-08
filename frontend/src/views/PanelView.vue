<script setup>
/**
 * Panel global.
 *
 * Resumen de la organizacion: utilizacion de la semana de referencia, quien se
 * pasa de capacidad, como estan repartidos los proyectos y las tareas, y que
 * proyectos concentran mas trabajo.
 *
 * Todo viene de /api/panel, que se apoya en la matriz de capacidad y en el
 * listado de tareas, de modo que el panel no puede discrepar de la matriz.
 */
import { computed, onMounted, ref } from 'vue'

import { panelApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { columnLabel, formatHours } from '../utils/kanban'
import { projectStatus } from '../utils/navigation'

const auth = useAuthStore()

const panel = ref(null)
const error = ref(null)
const loading = ref(true)

const overloaded = computed(() => panel.value?.overloaded ?? [])
const projects = computed(() => panel.value?.projects ?? [])
const projectStatuses = computed(() =>
  Object.entries(panel.value?.projects_by_status ?? {}),
)
const taskStatuses = computed(() => Object.entries(panel.value?.tasks_by_status ?? {}))

async function load() {
  try {
    const token = await auth.ensureSession()
    panel.value = await panelApi.list(token)
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

/** Vuelve a pedir los datos y enseña el esqueleto mientras llegan. */
async function reintentar() {
  loading.value = true
  await load()
}

onMounted(load)
useTaskReload(load)
</script>

<template>
  <div>
    <PageHeader
      title="Panel"
      subtitle="Estado de la organizacion en el periodo de planificacion."
    />

    <AsyncState
      :loading="loading"
      :error="error"
      error-test-id="panel-error"
      loading-label="Cargando el panel"
      @retry="reintentar"
    >
      <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded border border-slate-200 bg-white p-4">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
            Utilización
          </p>
          <p
            v-if="panel.utilization === null"
            class="mt-1 text-2xl font-semibold text-slate-400"
            data-testid="panel-utilization"
          >
            sin capacidad
          </p>
          <p
            v-else-if="panel.utilization >= 100"
            class="mt-1 text-2xl font-semibold tabular-nums text-red-700"
            data-testid="panel-utilization"
          >
            {{ panel.utilization }} %
          </p>
          <p
            v-else
            class="mt-1 text-2xl font-semibold tabular-nums text-siemens-900"
            data-testid="panel-utilization"
          >
            {{ panel.utilization }} %
          </p>
          <p class="mt-1 text-xs text-slate-500">
            {{ formatHours(panel.planned_hours) }} planificadas de
            {{ formatHours(panel.capacity_hours) }} de capacidad
          </p>
          <p class="mt-1 text-xs text-slate-400">
            Semana {{ panel.week ?? 'sin actividad' }}
          </p>
        </div>

        <div class="rounded border border-slate-200 bg-white p-4">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
            Sobrecargados
          </p>
          <p
            class="mt-1 text-2xl font-semibold tabular-nums"
            :class="overloaded.length ? 'text-red-700' : 'text-siemens-900'"
            data-testid="panel-overloaded-count"
          >
            {{ overloaded.length }}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            {{ overloaded.length === 1 ? 'persona se pasa' : 'personas se pasan' }} de
            su capacidad
          </p>
        </div>

        <div class="rounded border border-slate-200 bg-white p-4">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
            Personas con carga
          </p>
          <p class="mt-1 text-2xl font-semibold tabular-nums text-siemens-900">
            {{ panel.total_people }}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            con tareas o horas en el periodo
          </p>
        </div>

        <div class="rounded border border-slate-200 bg-white p-4">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
            Tareas del periodo
          </p>
          <p class="mt-1 text-2xl font-semibold tabular-nums text-siemens-900">
            {{ panel.total_tasks }}
          </p>
          <p class="mt-1 text-xs text-slate-500">
            en los proyectos visibles
          </p>
        </div>
      </div>

      <div class="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 class="mb-2 text-sm font-semibold text-slate-700">
            Personas sobrecargadas
          </h2>
          <div class="overflow-x-auto rounded border border-slate-200 bg-white">
            <table class="w-full border-collapse text-sm" data-testid="panel-overloaded">
              <thead>
                <tr class="bg-slate-100">
                  <th class="border border-slate-200 px-3 py-2 text-left">Persona</th>
                  <th class="border border-slate-200 px-3 py-2 text-left">Semana</th>
                  <th class="border border-slate-200 px-3 py-2 text-right">Horas</th>
                  <th class="border border-slate-200 px-3 py-2 text-right">Exceso</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in overloaded"
                  :key="`${item.user_id}-${item.week}`"
                  data-testid="panel-overloaded-row"
                >
                  <th class="border border-slate-200 bg-white px-3 py-2 text-left font-medium">
                    {{ item.name }}
                  </th>
                  <td class="border border-slate-200 px-3 py-2 text-slate-600">
                    {{ item.week }}
                  </td>
                  <td class="border border-slate-200 px-3 py-2 text-right tabular-nums">
                    {{ formatHours(item.hours) }} / {{ formatHours(item.capacity) }}
                  </td>
                  <td
                    class="border border-slate-200 px-3 py-2 text-right font-semibold tabular-nums text-red-700"
                  >
                    {{ formatHours(item.excess_hours) }}
                  </td>
                </tr>
                <tr v-if="!overloaded.length">
                  <td colspan="4" class="px-3 py-4 text-center text-sm text-slate-500">
                    Nadie supera su capacidad en el periodo.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 class="mb-2 text-sm font-semibold text-slate-700">
            Proyectos con más carga
          </h2>
          <div class="overflow-x-auto rounded border border-slate-200 bg-white">
            <table class="w-full border-collapse text-sm" data-testid="panel-projects">
              <thead>
                <tr class="bg-slate-100">
                  <th class="border border-slate-200 px-3 py-2 text-left">Proyecto</th>
                  <th class="border border-slate-200 px-3 py-2 text-left">Estado</th>
                  <th class="border border-slate-200 px-3 py-2 text-right">Tareas</th>
                  <th class="border border-slate-200 px-3 py-2 text-right">Personas</th>
                  <th class="border border-slate-200 px-3 py-2 text-right">Horas</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="project in projects"
                  :key="project.id"
                  data-testid="panel-project-row"
                >
                  <th class="border border-slate-200 bg-white px-3 py-2 text-left font-medium">
                    {{ project.name }}
                  </th>
                  <td class="border border-slate-200 px-3 py-2">
                    <span
                      v-if="projectStatus(project.status).tone === 'active'"
                      class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                    >
                      {{ projectStatus(project.status).label }}
                    </span>
                    <span
                      v-else-if="projectStatus(project.status).tone === 'paused'"
                      class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                    >
                      {{ projectStatus(project.status).label }}
                    </span>
                    <span
                      v-else
                      class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                    >
                      {{ projectStatus(project.status).label }}
                    </span>
                  </td>
                  <td class="border border-slate-200 px-3 py-2 text-right tabular-nums">
                    {{ project.task_count }}
                  </td>
                  <td class="border border-slate-200 px-3 py-2 text-right tabular-nums">
                    {{ project.people_count }}
                  </td>
                  <td class="border border-slate-200 px-3 py-2 text-right tabular-nums">
                    {{ formatHours(project.estimated_hours) }}
                  </td>
                </tr>
                <tr v-if="!projects.length">
                  <td colspan="5" class="px-3 py-4 text-center text-sm text-slate-500">
                    No hay proyectos visibles.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 class="mb-2 text-sm font-semibold text-slate-700">Proyectos por estado</h2>
          <ul
            class="rounded border border-slate-200 bg-white p-4 text-sm"
            data-testid="panel-projects-status"
          >
            <li
              v-for="[status, count] in projectStatuses"
              :key="status"
              class="flex items-center justify-between py-1"
            >
              <span class="text-slate-600">{{ projectStatus(status).label }}</span>
              <span class="font-medium tabular-nums text-siemens-900">{{ count }}</span>
            </li>
            <li v-if="!projectStatuses.length" class="py-1 text-slate-500">
              No hay proyectos visibles.
            </li>
          </ul>
        </section>

        <section>
          <h2 class="mb-2 text-sm font-semibold text-slate-700">Tareas por estado</h2>
          <ul
            class="rounded border border-slate-200 bg-white p-4 text-sm"
            data-testid="panel-tasks-status"
          >
            <li
              v-for="[status, count] in taskStatuses"
              :key="status"
              class="flex items-center justify-between py-1"
            >
              <span class="text-slate-600">{{ columnLabel(status) }}</span>
              <span class="font-medium tabular-nums text-siemens-900">{{ count }}</span>
            </li>
            <li v-if="!taskStatuses.length" class="py-1 text-slate-500">
              No hay tareas en el periodo.
            </li>
          </ul>
        </section>
      </div>
    </AsyncState>
  </div>
</template>
