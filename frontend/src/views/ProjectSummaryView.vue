<script setup>
/**
 * Resumen del proyecto.
 *
 * Reune lo basico del proyecto: quien lo gestiona, que estado tiene, quien
 * participa y como se reparte la carga. Es el punto de entrada al proyecto,
 * al que se llega desde el listado y el menu global.
 */
import { computed, onMounted, ref, watch } from 'vue'

import { projectsApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import AsyncState from '../components/common/AsyncState.vue'
import AppIcon from '../components/AppIcon.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { PROJECT_VIEWS, projectRoute, projectStatus } from '../utils/navigation'

const props = defineProps({
  id: { type: [String, Number], required: true },
})

const auth = useAuthStore()
const store = useProjectsStore()

const error = ref(null)
const loading = ref(true)
const capacity = ref(null)

const project = computed(
  () => store.projects.find((item) => String(item.id) === String(props.id)) ?? null,
)

const department = computed(
  () =>
    store.departments.find((item) => item.id === project.value?.department_id) ?? null,
)

const status = computed(() => projectStatus(project.value?.status))

const rows = computed(() => capacity.value?.rows ?? [])

/** Personas con mas carga, que es lo que se mira de un vistazo. */
const busiest = computed(() =>
  [...rows.value].sort((a, b) => b.total_hours - a.total_hours).slice(0, 5),
)

const totalHours = computed(() =>
  rows.value.reduce((sum, row) => sum + Number(row.total_hours ?? 0), 0),
)

const views = computed(() => PROJECT_VIEWS)

async function load() {
  try {
    const token = await auth.ensureSession()
    await store.ensureProjects(token)
    await store.ensureMembers(token, props.id)
    capacity.value = await projectsApi.capacity(token, props.id)
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
watch(() => props.id, load)
useTaskReload(load)
</script>

<template>
  <div>
    <AsyncState
      :loading="loading"
      :error="error"
      loading-label="Cargando el proyecto"
      @retry="reintentar"
    >
      <template v-if="project">
        <PageHeader
          :title="project.name"
          :subtitle="department?.name ?? 'Sin departamento'"
        >
        </PageHeader>

        <div class="grid gap-4 sm:grid-cols-3">
          <div class="rounded border border-slate-200 bg-white p-4">
            <p class="text-xs uppercase tracking-wide text-slate-400">Estado</p>
            <p class="mt-1 text-base font-medium text-siemens-900">{{ status.label }}</p>
          </div>
          <div class="rounded border border-slate-200 bg-white p-4">
            <p class="text-xs uppercase tracking-wide text-slate-400">Personas</p>
            <p class="mt-1 text-base font-medium text-siemens-900">{{ store.members.length }}</p>
          </div>
          <div class="rounded border border-slate-200 bg-white p-4">
            <p class="text-xs uppercase tracking-wide text-slate-400">Horas cargadas</p>
            <p class="mt-1 text-base font-medium text-siemens-900">{{ totalHours }} h</p>
          </div>
        </div>

        <section class="mt-4 rounded border border-slate-200 bg-white p-4">
          <h2 class="text-base font-semibold text-siemens-900">Reparto de carga</h2>
          <ul v-if="busiest.length" class="mt-3 space-y-2">
            <li
              v-for="row in busiest"
              :key="row.user_id"
              class="flex items-center justify-between gap-3 text-sm"
            >
              <span class="truncate text-slate-700">{{ row.name }}</span>
              <span class="shrink-0 tabular-nums text-slate-600">
                {{ row.total_hours }} h de {{ row.weekly_base_hours }} h base
              </span>
            </li>
          </ul>
          <p v-else class="mt-3 text-sm text-slate-500">Todavía no hay tareas asignadas.</p>
        </section>

        <nav class="mt-4 flex flex-wrap gap-2">
          <RouterLink
            v-for="view in views"
            :key="view.name"
            :to="projectRoute(view.name, props.id)"
            class="flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <span class="inline-flex h-4 w-4 text-siemens-700">
              <AppIcon :name="view.icon" />
            </span>
            {{ view.label }}
          </RouterLink>
        </nav>
      </template>

      <p v-else class="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        No se ha encontrado el proyecto.
      </p>
    </AsyncState>
  </div>
</template>
