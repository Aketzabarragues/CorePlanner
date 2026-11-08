<script setup>
/**
 * Departamentos de la organizacion.
 *
 * Cada departamento muestra su responsable y los proyectos que gestiona.
 * Los proyectos que no tienen departamento aparecen al final, en su propio
 * bloque.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppIcon from '../components/AppIcon.vue'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { projectStatus } from '../utils/navigation'

const auth = useAuthStore()
const store = useProjectsStore()
const router = useRouter()

const error = ref(null)
const loading = ref(true)

const departments = computed(() =>
  store.departments.map((department) => ({
    ...department,
    projects: store.projects.filter(
      (project) => String(project.department_id) === String(department.id),
    ),
  })),
)

const looseProjects = computed(() =>
  store.projects.filter(
    (project) =>
      project.department_id === null ||
      project.department_id === undefined ||
      !store.departments.some(
        (department) => String(department.id) === String(project.department_id),
      ),
  ),
)

/** Carga los departamentos y los proyectos que gestiona cada uno. */
async function load() {
  try {
    const token = await auth.ensureSession()
    await store.ensureProjects(token)
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

/** Lleva a la pantalla donde se crean los departamentos. */
function irAConfiguracion() {
  router.push({ name: 'configuration' })
}

/** Vuelve a pedir los datos y enseña el esqueleto mientras llegan. */
async function reintentar() {
  loading.value = true
  await load()
}

onMounted(load)
</script>

<template>
  <div>
    <PageHeader
      title="Departamentos"
      subtitle="Cada departamento gestiona sus proyectos y tiene una persona responsable."
    />

    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!departments.length && !looseProjects.length"
      empty-title="Todavía no hay departamentos"
      empty-text="Crea el primero en Configuración para empezar a repartir la carga."
      empty-action="Ir a Configuración"
      loading-label="Cargando los departamentos"
      @retry="reintentar"
      @empty-action="irAConfiguracion"
    >
      <div class="space-y-4">
        <section
          v-for="department in departments"
          :key="department.id"
          class="rounded border border-slate-200 bg-white p-4"
        >
          <div class="flex items-start gap-3">
            <span class="inline-flex h-9 w-9 shrink-0 rounded bg-slate-100 text-siemens-700">
              <AppIcon name="building" />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="text-base font-semibold text-siemens-900">{{ department.name }}</h2>
              <p class="text-sm text-slate-500">
                Responsable: {{ department.manager_name ?? 'Sin responsable' }}
              </p>

              <ul v-if="department.projects.length" class="mt-3 space-y-1">
                <li
                  v-for="project in department.projects"
                  :key="project.id"
                  class="flex items-center justify-between gap-3 text-sm"
                >
                  <RouterLink
                    :to="{ name: 'project', params: { id: String(project.id) } }"
                    class="truncate text-slate-700 hover:text-siemens-700 hover:underline"
                  >
                    {{ project.name }}
                  </RouterLink>
                  <span class="shrink-0 text-xs text-slate-500">
                    {{ projectStatus(project.status).label }}
                  </span>
                </li>
              </ul>
              <p v-else class="mt-3 text-sm text-slate-400">Sin proyectos asignados.</p>
            </div>
          </div>
        </section>

        <section
          v-if="looseProjects.length"
          class="rounded border border-slate-200 bg-white p-4"
        >
          <h2 class="text-base font-semibold text-siemens-900">Sin departamento</h2>
          <ul class="mt-3 space-y-1">
            <li
              v-for="project in looseProjects"
              :key="project.id"
              class="flex items-center justify-between gap-3 text-sm"
            >
              <RouterLink
                :to="{ name: 'project', params: { id: String(project.id) } }"
                class="truncate text-slate-700 hover:text-siemens-700 hover:underline"
              >
                {{ project.name }}
              </RouterLink>
              <span class="shrink-0 text-xs text-slate-500">
                {{ projectStatus(project.status).label }}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </AsyncState>
  </div>
</template>
