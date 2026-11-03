<script setup>
import { onMounted, ref } from 'vue'

import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'

const error = ref(null)
const loading = ref(true)

const auth = useAuthStore()
const store = useProjectsStore()

onMounted(async () => {
  try {
    const token = await auth.ensureSession()
    await store.ensureProjects(token)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto max-w-5xl">
    <header class="mb-6 flex items-center justify-between">
      <h1 class="text-lg font-semibold text-siemens-900">Proyectos</h1>
    </header>

    <p v-if="loading" class="text-sm text-slate-500">Cargando...</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>

    <ul v-else class="space-y-2">
      <li
        v-for="project in store.projects"
        :key="project.id"
        class="flex items-center justify-between rounded border border-slate-200 bg-white p-4"
      >
        <div>
          <p class="font-medium">{{ project.name }}</p>
          <p class="text-xs text-slate-500">{{ project.status }}</p>
        </div>
        <div class="flex gap-2 text-sm">
          <RouterLink
            :to="{ name: 'capacity', params: { id: project.id } }"
            class="rounded border border-slate-300 px-3 py-1.5"
          >
            Capacidad
          </RouterLink>
          <RouterLink
            :to="{ name: 'gantt', params: { id: project.id } }"
            class="rounded bg-siemens-900 px-3 py-1.5 text-white"
          >
            Gantt
          </RouterLink>
          <RouterLink
            :to="{ name: 'kanban', params: { id: project.id } }"
            class="rounded border border-siemens-900 px-3 py-1.5 text-siemens-900"
          >
            Kanban
          </RouterLink>
        </div>
      </li>
    </ul>
  </div>
</template>
