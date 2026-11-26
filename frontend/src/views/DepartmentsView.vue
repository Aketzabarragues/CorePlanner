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

/**
 * Estilo en linea del icono del departamento: el color del departamento
 * (dato del backend) sobre un tinte claro del mismo color. Sin color,
 * tarjeta suave con texto suave.
 */
function estiloDepartamento(department) {
  const color = department.color ?? null
  if (!color) {
    return {
      backgroundColor: 'rgb(var(--cp-tarjeta-suave))',
      color: 'rgb(var(--cp-texto-suave))',
    }
  }
  return { backgroundColor: conBlanco(color, 0.15), color: conNegro(color, 0.35) }
}

function canalDe(hex) {
  const limpio = String(hex ?? '').trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) return null
  return parseInt(limpio, 16)
}

/** Mezcla un hex con blanco: `fraccion` del color y el resto blanco. */
function conBlanco(hex, fraccion) {
  const color = canalDe(hex)
  if (color === null) return hex
  const canal = (n) =>
    Math.round(((color >> n) & 0xff) * fraccion + 0xff * (1 - fraccion))
      .toString(16)
      .padStart(2, '0')
  return `#${canal(16)}${canal(8)}${canal(0)}`
}

/** Mezcla un hex con negro: `fraccion` de negro y el resto del color. */
function conNegro(hex, fraccion) {
  const color = canalDe(hex)
  if (color === null) return hex
  const canal = (n) =>
    Math.round(((color >> n) & 0xff) * (1 - fraccion))
      .toString(16)
      .padStart(2, '0')
  return `#${canal(16)}${canal(8)}${canal(0)}`
}

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
          class="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta"
        >
          <div class="flex items-start gap-3">
            <span
              class="flex h-9 w-9 flex-none items-center justify-center rounded-control"
              :style="estiloDepartamento(department)"
              aria-hidden="true"
            >
              <span class="inline-flex h-4 w-4"><AppIcon name="building" /></span>
            </span>

            <div class="min-w-0 flex-1">
              <h2 class="font-titulo text-cp-titulo font-bold text-texto-marca">
                {{ department.name }}
              </h2>
              <p class="text-cp-xs text-texto-tenue">
                Responsable: {{ department.manager_name ?? 'Sin responsable' }}
              </p>

              <ul v-if="department.projects.length" class="mt-3 space-y-1">
                <li
                  v-for="project in department.projects"
                  :key="project.id"
                  class="flex items-center justify-between gap-3 text-cp-sm"
                >
                  <RouterLink
                    :to="{ name: 'project', params: { id: String(project.id) } }"
                    class="truncate text-texto transition-colors hover:text-primario-medio hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                  >
                    {{ project.name }}
                  </RouterLink>
                  <span class="shrink-0 text-cp-xs text-texto-tenue">
                    {{ projectStatus(project.status).label }}
                  </span>
                </li>
              </ul>
              <p v-else class="mt-3 text-cp-sm text-texto-tenue">Sin proyectos asignados.</p>
            </div>
          </div>
        </section>

        <section
          v-if="looseProjects.length"
          class="rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta"
        >
          <h2 class="font-titulo text-cp-titulo font-bold text-texto-marca">Sin departamento</h2>
          <ul class="mt-3 space-y-1">
            <li
              v-for="project in looseProjects"
              :key="project.id"
              class="flex items-center justify-between gap-3 text-cp-sm"
            >
              <RouterLink
                :to="{ name: 'project', params: { id: String(project.id) } }"
                class="truncate text-texto transition-colors hover:text-primario-medio hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              >
                {{ project.name }}
              </RouterLink>
              <span class="shrink-0 text-cp-xs text-texto-tenue">
                {{ projectStatus(project.status).label }}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </AsyncState>
  </div>
</template>
