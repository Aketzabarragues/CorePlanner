<script setup>
/**
 * Matriz de ocupacion del proyecto.
 *
 * Hace un login automatico con el usuario administrador de demostracion y
 * guarda el token en localStorage, de modo que al abrir la aplicacion ya
 * hay datos que ver.
 */
import { computed, onMounted, ref } from 'vue'

import { authApi, projectsApi } from '../api/client'
import { useAuthStore } from '../stores/auth'

const DEMO_CREDENTIALS = {
  email: 'admin@example.com',
  password: 'coreplanner',
}

const auth = useAuthStore()

const report = ref(null)
const project = ref(null)
const error = ref(null)
const loading = ref(true)

const weeks = computed(() => report.value?.weeks ?? [])

const rows = computed(() => report.value?.rows ?? [])

function cellOf(row, week) {
  return row.cells.find((cell) => cell.week === week) ?? { hours: 0, is_overloaded: false }
}

async function loginDemo() {
  const data = await authApi.login(DEMO_CREDENTIALS.email, DEMO_CREDENTIALS.password)
  auth.setSession(data.access_token, data.user)
  return data.access_token
}

onMounted(async () => {
  try {
    let token = auth.token
    if (!token) {
      token = await loginDemo()
    }

    const projects = await projectsApi.list(token)
    if (projects.length === 0) {
      error.value = 'No hay proyectos visibles. Ejecuta python backend/seed.py para cargar datos.'
      return
    }

    project.value = projects[0]
    report.value = await projectsApi.capacity(token, project.value.id)
  } catch (err) {
    error.value = err.message
    auth.clear()
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <main class="mx-auto max-w-6xl p-6">
    <header class="mb-6">
      <h1 class="text-xl font-semibold text-siemens-900">
        Matriz de ocupacion
      </h1>
      <p v-if="project" class="mt-1 text-sm text-slate-500">
        {{ project.name }}
      </p>
    </header>

    <p v-if="loading" class="text-sm text-slate-500">Cargando...</p>

    <p
      v-else-if="error"
      class="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
    >
      {{ error }}
    </p>

    <div v-else class="overflow-x-auto rounded border border-slate-200 bg-white">
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="bg-slate-100">
            <th
              class="sticky left-0 border border-slate-200 bg-slate-100 px-3 py-2 text-left"
            >
              Persona
            </th>
            <th
              v-for="week in weeks"
              :key="week"
              class="border border-slate-200 px-3 py-2 text-center"
            >
              {{ week }}
            </th>
            <th class="border border-slate-200 px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.user_id">
            <th
              class="sticky left-0 border border-slate-200 bg-white px-3 py-2 text-left font-medium"
            >
              {{ row.name }}
              <span class="block text-xs font-normal text-slate-400">
                {{ row.weekly_base_hours }} h/semana
              </span>
            </th>
            <td
              v-for="week in weeks"
              :key="week"
              class="border border-slate-200 px-3 py-2 text-center tabular-nums"
              :class="cellOf(row, week).is_overloaded
                ? 'bg-red-200 font-semibold text-red-900'
                : 'text-slate-700'"
            >
              {{ cellOf(row, week).hours }}
            </td>
            <td class="border border-slate-200 px-3 py-2 text-right tabular-nums">
              {{ row.total_hours }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p
      v-if="!loading && !error && rows.some((r) => r.has_overload)"
      class="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
    >
      En rojo, las semanas que superan las horas base de la persona.
    </p>
  </main>
</template>
