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

import { peopleApi } from '../api/client'
import AppIcon from '../components/AppIcon.vue'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { projectStatus } from '../utils/navigation'
import { plural } from '../utils/plural'
import { textoSobre } from '../utils/statusColor'

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

const MAX_AVATARES = 4

/** Personas de la organizacion, para el pie de cada tarjeta de area. */
const people = ref([])

/** Insignia de contexto: areas operativas y proyectos activos visibles. */
const contexto = computed(() => ({
  texto: `${plural(store.departments.length, 'área operativa', 'áreas operativas')} · ${plural(
    store.projects.filter((project) => project.status === 'active').length,
    'proyecto activo',
    'proyectos activos',
  )}`,
}))

/** Miembros del area: las personas asignadas a ese departamento. */
function miembrosDe(department) {
  return people.value.filter(
    (person) =>
      person.department_id !== null &&
      person.department_id !== undefined &&
      String(person.department_id) === String(department.id),
  )
}

/** Avatares que se apilan en el pie: como cuatro. */
function avataresDe(department) {
  return miembrosDe(department).slice(0, MAX_AVATARES)
}

/** Cuantos miembros se quedan fuera de los avatares apilados. */
function restoDe(department) {
  return Math.max(0, miembrosDe(department).length - MAX_AVATARES)
}

/** Codigo del proyecto, si el nombre empieza por "123 - ...". */
function codigoDe(name) {
  const match = /^(\d+)\s*[-–—]\s*/.exec(String(name ?? ''))
  if (!match) return null
  return { codigo: match[1], resto: String(name).slice(match[0].length) }
}

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

/**
 * Estilo en linea del avatar del responsable o de los miembros: el color del
 * departamento (dato del backend) con el texto calculado para el contraste.
 * Sin color, tarjeta suave con texto suave.
 */
function estiloAvatar(department) {
  const color = department.color ?? null
  if (!color) {
    return {
      backgroundColor: 'rgb(var(--cp-tarjeta-suave))',
      color: 'rgb(var(--cp-texto-suave))',
    }
  }
  return { backgroundColor: color, color: textoSobre(color) }
}

/** Clases de la pastilla del estado del proyecto, por estado. */
function pildoraEstadoProyecto(status) {
  switch (status) {
    case 'active':
      return 'bg-ok-fondo text-ok-texto'
    case 'on_hold':
      return 'bg-aviso-fondo text-aviso-texto'
    case 'planning':
      return 'bg-info-fondo text-info-texto'
    default:
      return 'bg-neutro-fondo text-neutro-texto'
  }
}

/** Punto de la pastilla del estado: el punto de color del estado. */
function puntoEstadoProyecto(status) {
  switch (status) {
    case 'active':
      return 'bg-ok-punto'
    case 'on_hold':
      return 'bg-aviso-punto'
    default:
      return 'bg-neutro-punto'
  }
}

/**
 * Carga los departamentos, los proyectos que gestiona cada uno y las personas
 * (para el pie de cada area). Si el listado de personas no llega, la tarjeta
 * se queda sin pie: el resto de la vista no depende de el.
 */
async function load() {
  try {
    const token = await auth.ensureSession()
    await store.ensureProjects(token)
    people.value = await peopleApi.list(token).catch(() => [])
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
      ayuda="Cada departamento gestiona sus proyectos y tiene una persona responsable."
    >
      <template #contexto>
        <span data-testid="departments-context">{{ contexto.texto }}</span>
      </template>
      <template #actions>
        <RouterLink
          to="/projects"
          class="inline-flex min-h-10 items-center rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-semibold text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
        >
          Ver tabla de proyectos →
        </RouterLink>
      </template>
    </PageHeader>

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
              <div class="flex items-start justify-between gap-3">
                <h2 class="font-titulo text-cp-titulo font-bold text-texto-marca">
                  {{ department.name }}
                </h2>
                <span
                  class="rounded-control bg-tarjeta-suave px-2 py-1 font-mono text-cp-xs font-semibold text-texto-suave"
                  data-testid="department-projects-count"
                >
                  {{ department.projects.length }} proy.
                </span>
              </div>
              <p class="flex items-center gap-1.5 text-cp-xs text-texto-tenue">
                <span
                  v-if="department.manager_name"
                  class="flex h-4 w-4 flex-none items-center justify-center rounded-avatar text-[9px] font-bold"
                  :style="estiloAvatar(department)"
                  aria-hidden="true"
                >
                  {{ department.manager_name.slice(0, 1) }}
                </span>
                Responsable: {{ department.manager_name ?? 'Sin responsable' }}
              </p>

              <p
                v-if="department.projects.length"
                class="mt-3 text-cp-micro font-semibold uppercase tracking-wider text-texto-tenue"
              >
                Proyectos gestionados
              </p>
              <ul v-if="department.projects.length" class="mt-1 space-y-1">
                <li
                  v-for="project in department.projects"
                  :key="project.id"
                  class="flex items-center justify-between gap-3 rounded-control border border-borde bg-tarjeta-suave px-3 py-2"
                >
                  <RouterLink
                    :to="{ name: 'project', params: { id: String(project.id) } }"
                    class="flex min-w-0 items-center gap-2 text-cp-sm transition-colors hover:text-primario-medio focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
                  >
                    <span
                      class="h-4 w-1 flex-none rounded-pastilla"
                      :style="{ backgroundColor: project.color ?? 'rgb(var(--cp-neutro-punto))' }"
                      aria-hidden="true"
                    ></span>
                    <span v-if="codigoDe(project.name)" class="font-mono text-cp-sm font-bold text-texto-marca">
                      {{ codigoDe(project.name).codigo }}
                    </span>
                    <span
                      class="truncate text-texto hover:underline"
                      :class="codigoDe(project.name) ? 'font-semibold' : ''"
                    >
                      {{ codigoDe(project.name)?.resto ?? project.name }}
                    </span>
                  </RouterLink>
                  <span
                    class="inline-flex flex-none items-center gap-1.5 rounded-pastilla px-2 py-0.5 text-cp-xs font-semibold"
                    :class="pildoraEstadoProyecto(project.status)"
                  >
                    <span
                      class="h-1.5 w-1.5 flex-none rounded-full"
                      :class="puntoEstadoProyecto(project.status)"
                      aria-hidden="true"
                    ></span>
                    {{ projectStatus(project.status).label }}
                  </span>
                </li>
              </ul>
              <p v-else class="mt-3 text-cp-sm text-texto-tenue">Sin proyectos asignados.</p>

              <div
                v-if="miembrosDe(department).length"
                class="mt-3 flex items-center justify-between gap-3 border-t border-borde-suave pt-3"
              >
                <span class="text-cp-xs text-texto-tenue" data-testid="department-members">
                  {{ plural(miembrosDe(department).length, 'miembro en el area', 'miembros en el area') }}
                </span>
                <span class="flex items-center">
                  <span
                    v-for="(member, index) in avataresDe(department)"
                    :key="member.id"
                    class="flex h-6 w-6 flex-none items-center justify-center rounded-avatar text-cp-micro font-bold ring-2 ring-tarjeta"
                    :class="index > 0 ? '-ml-1.5' : ''"
                    :style="estiloAvatar(department)"
                    :title="member.name"
                    data-testid="department-member"
                  >
                    {{ member.name.slice(0, 1) }}
                  </span>
                  <span
                    v-if="restoDe(department)"
                    class="ml-1.5 text-cp-xs text-texto-tenue"
                    data-testid="department-members-rest"
                  >
                    +{{ restoDe(department) }}
                  </span>
                </span>
              </div>
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
              <span
                class="inline-flex shrink-0 items-center gap-1.5 rounded-pastilla px-2 py-0.5 text-cp-xs font-semibold"
                :class="pildoraEstadoProyecto(project.status)"
              >
                <span
                  class="h-1.5 w-1.5 flex-none rounded-full"
                  :class="puntoEstadoProyecto(project.status)"
                  aria-hidden="true"
                ></span>
                {{ projectStatus(project.status).label }}
              </span>
            </li>
          </ul>
        </section>
      </div>
    </AsyncState>
  </div>
</template>
