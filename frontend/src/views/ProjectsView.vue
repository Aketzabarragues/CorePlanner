<script setup>
/**
 * Listado global de proyectos.
 *
 * Cada proyecto muestra su departamento y su estado. Desde aqui se entra al
 * resumen del proyecto y a sus vistas.
 */
import { computed, onMounted, ref } from 'vue'

import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { projectStatus } from '../utils/navigation'

const error = ref(null)
const loading = ref(true)

const auth = useAuthStore()
const store = useProjectsStore()

/** Proyectos agrupados por el departamento que los gestiona. */
const groups = computed(() => {
  const byDepartment = new Map()
  for (const department of store.departments) {
    byDepartment.set(String(department.id), { name: department.name, items: [] })
  }

  const loose = []
  for (const project of store.projects) {
    const key =
      project.department_id === null || project.department_id === undefined
        ? null
        : String(project.department_id)
    const group = key === null ? null : byDepartment.get(key)
    if (group) group.items.push(project)
    else loose.push(project)
  }

  const result = [...byDepartment.values()].filter((group) => group.items.length)
  if (loose.length) result.push({ name: 'Sin departamento', items: loose })
  return result
})

function departmentName(departmentId) {
  return (
    store.departments.find((department) => String(department.id) === String(departmentId))
      ?.name ?? 'Sin departamento'
  )
}

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
    <header class="mb-6">
      <h1 class="text-lg font-semibold text-siemens-900">Proyectos</h1>
      <p class="mt-1 text-sm text-slate-500">
        Proyectos visibles, agrupados por el departamento que los gestiona.
      </p>
    </header>

    <p v-if="loading" class="text-sm text-slate-500">Cargando...</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>

    <div v-else class="space-y-6">
      <section v-for="group in groups" :key="group.name">
        <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {{ group.name }}
        </h2>
        <ul class="space-y-2">
          <li
            v-for="project in group.items"
            :key="project.id"
            class="flex items-center justify-between gap-3 rounded border border-slate-200 bg-white p-4"
          >
            <div class="min-w-0">
              <RouterLink
                :to="{ name: 'project', params: { id: String(project.id) } }"
                class="block truncate font-medium text-siemens-900 hover:underline"
              >
                {{ project.name }}
              </RouterLink>
              <p class="text-xs text-slate-500">
                {{ departmentName(project.department_id) }} ·
                {{ projectStatus(project.status).label }}
              </p>
            </div>
            <div class="flex shrink-0 gap-2 text-sm">
              <RouterLink
                :to="{ name: 'capacity', params: { id: String(project.id) } }"
                class="rounded border border-slate-300 px-3 py-1.5"
              >
                Capacidad
              </RouterLink>
              <RouterLink
                :to="{ name: 'gantt', params: { id: String(project.id) } }"
                class="rounded bg-siemens-900 px-3 py-1.5 text-white"
              >
                Gantt
              </RouterLink>
              <RouterLink
                :to="{ name: 'kanban', params: { id: String(project.id) } }"
                class="rounded border border-siemens-900 px-3 py-1.5 text-siemens-900"
              >
                Kanban
              </RouterLink>
            </div>
          </li>
        </ul>
      </section>

      <p
        v-if="!store.projects.length"
        class="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500"
      >
        No hay proyectos visibles. Ejecuta python backend/seed.py para cargar datos.
      </p>
    </div>
  </div>
</template>
