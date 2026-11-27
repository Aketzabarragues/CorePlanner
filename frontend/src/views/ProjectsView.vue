<script setup>
/**
 * Listado global de proyectos.
 *
 * Los proyectos van agrupados por el departamento que los gestiona. Cada
 * seccion de area es una cabecera con el titulo, su responsable, su recuento
 * y las horas planificadas de la semana, y debajo una rejilla de cards:
 * `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`.
 *
 * La card es un proyecto: su franja de color (dato del backend), su nombre y
 * estado, su responsable, el equipo, el avance de tareas y la carga de la
 * semana. La card entera es pulsable y con teclado, y lleva al resumen del
 * proyecto.
 *
 * Los filtros son de presentacion: acotan lo que ya esta cargado, no lo que
 * la persona puede ver. El ambito de proyectos y de departamentos lo decide el
 * backend, y aqui no se toca.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { projectsApi } from '../api/client'
import AppIcon from '../components/AppIcon.vue'
import AsyncState from '../components/common/AsyncState.vue'
import FilterField from '../components/common/FilterField.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { PROJECT_STATUSES, projectStatus } from '../utils/navigation'
import { luminancia } from '../utils/statusColor'

/** Cuantos avatares se apilan antes de resumir el resto con un "+N". */
const MAX_AVATARES = 4

const error = ref(null)
const loading = ref(true)

/** Filtros de presentacion sobre la lista ya cargada. */
const buscador = ref('')
const filtroDepartamento = ref('')
const filtroEstado = ref('')

/**
 * Codigo del proyecto, si el nombre empieza por "123 - ...": el codigo y el
 * resto del nombre. Sin el patron, null: se pinta el nombre completo.
 */
function codigoDe(name) {
  const match = /^(\d+)\s*[-–—]\s*/.exec(String(name ?? ''))
  if (!match) return null
  return { codigo: match[1], resto: String(name).slice(match[0].length) }
}

/** Resumen de cada proyecto: equipo, avance de tareas y carga de la semana. */
const resumenes = ref([])

const auth = useAuthStore()
const store = useProjectsStore()
const router = useRouter()

/** Texto en minusculas y sin acentos, para buscar sin tildes. */
function sinAcentos(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Un proyecto se queda si cumple los tres filtros. */
function coincide(project) {
  if (filtroEstado.value && project.status !== filtroEstado.value) return false
  if (filtroDepartamento.value) {
    const id =
      project.department_id === null || project.department_id === undefined
        ? ''
        : String(project.department_id)
    if (id !== filtroDepartamento.value) return false
  }
  const texto = sinAcentos(buscador.value.trim())
  if (texto && !sinAcentos(project.name).includes(texto)) return false
  return true
}

/** Proyectos agrupados por el departamento que los gestiona. */
const groups = computed(() => {
  const visibles = store.projects.filter(coincide)

  const byDepartment = new Map()
  for (const department of store.departments) {
    byDepartment.set(String(department.id), {
      key: String(department.id),
      name: department.name,
      manager: department.manager_name ?? null,
      color: department.color ?? null,
      items: [],
    })
  }

  const loose = []
  for (const project of visibles) {
    const key =
      project.department_id === null || project.department_id === undefined
        ? null
        : String(project.department_id)
    const group = key === null ? null : byDepartment.get(key)
    if (group) group.items.push(project)
    else loose.push(project)
  }

  const result = [...byDepartment.values()].filter((group) => group.items.length)
  if (loose.length) {
    result.push({
      key: 'sin-departamento',
      name: 'Sin departamento',
      manager: null,
      color: null,
      items: loose,
    })
  }
  return result
})

/** Horas planificadas en la semana del grupo, para el recuento de la cabecera. */
function horasDe(group) {
  return group.items.reduce((suma, project) => suma + (resumenDe(project)?.load?.planned_hours ?? 0), 0)
}

/** Si hay filtros puestos: distingue "no hay nada" de "no coincide nada". */
const hayFiltros = computed(
  () => Boolean(buscador.value.trim() || filtroDepartamento.value || filtroEstado.value),
)

/** Opciones del filtro de departamento, para el desplegable. */
const opcionesDepartamento = computed(() => [
  { value: '', label: 'Todos los departamentos' },
  ...store.departments.map((department) => ({
    value: String(department.id),
    label: department.name,
  })),
])

/** Opciones del filtro de estado, para el desplegable. */
const opcionesEstado = computed(() => [
  { value: '', label: 'Cualquier estado' },
  ...PROJECT_STATUSES.map((estado) => ({ value: estado.value, label: estado.label })),
])

/** Resumen de un proyecto, o null si no llego. */
function resumenDe(project) {
  return resumenes.value.find((item) => item.id === project.id) ?? null
}

/** Avatares que se apilan: como mucho cuatro. */
function avataresDe(project) {
  const resumen = resumenDe(project)
  return (resumen?.members ?? []).slice(0, MAX_AVATARES)
}

/** Cuantas personas del equipo se quedan fuera de los avatares. */
function restoDe(project) {
  const resumen = resumenDe(project)
  return Math.max(0, (resumen?.members ?? []).length - MAX_AVATARES)
}

/** Porcentaje de tareas completadas del proyecto. */
function avanceDe(project) {
  const resumen = resumenDe(project)
  if (!resumen || !resumen.tasks_total) return 0
  return Math.round((resumen.tasks_done / resumen.tasks_total) * 100)
}

/**
 * Lo que se pinta en la columna de carga: el aviso de sobrecarga, el
 * porcentaje de uso, la falta de capacidad o nada, segun lo que diga el
 * resumen de la semana.
 */
function cargaDe(project) {
  const resumen = resumenDe(project)
  if (!resumen || !resumen.load) return { tipo: 'sin-datos', texto: '—' }
  if (resumen.load.overloaded) return { tipo: 'sobrecarga', texto: 'Sobrecargado' }
  const utilization = resumen.load.utilization
  if (utilization === null || utilization === undefined) {
    return { tipo: 'sin-capacidad', texto: 'Sin capacidad' }
  }
  return { tipo: 'porcentaje', texto: `${utilization} %` }
}

/**
 * Estilo en linea del avatar del equipo: el color del departamento que
 * gestiona el proyecto (dato del backend) con el texto calculado para el
 * contraste. Sin color, tarjeta suave con texto suave.
 */
function estiloAvatarEquipo(group) {
  const color = group?.color ?? null
  if (!color) {
    return {
      backgroundColor: 'rgb(var(--cp-tarjeta-suave))',
      color: 'rgb(var(--cp-texto-suave))',
    }
  }
  return { backgroundColor: color, color: contrasteSobre(color) }
}

/**
 * Texto legible sobre un hex de fondo: oscuro o claro por luminancia.
 *
 * Con la luminancia de WCAG de `statusColor`: sobre fondo claro el texto
 * oscuro, sobre fondo oscuro el texto claro.
 */
function contrasteSobre(hex) {
  const brillo = luminancia(hex) ?? 0
  return brillo >= 0.5 ? 'rgb(var(--cp-texto))' : 'rgb(var(--cp-sobre-primario))'
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

/** Lleva al resumen del proyecto. Toda la fila es clicable. */
function irAlProyecto(project) {
  router.push({ name: 'project', params: { id: String(project.id) } })
}

/** Quita los filtros y deja la lista entera a la vista. */
function limpiarFiltros() {
  buscador.value = ''
  filtroDepartamento.value = ''
  filtroEstado.value = ''
}

/** Carga los proyectos visibles y su resumen. */
async function load() {
  try {
    const token = await auth.ensureSession()
    await store.ensureProjects(token)
    // El resumen es una capa encima del listado: si no llega, el listado
    // sigue en pie y las columnas nuevas se quedan a "—".
    resumenes.value = await projectsApi.summary(token).catch(() => [])
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

/** Lleva a la pantalla donde se crean los proyectos. */
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
      title="Proyectos"
      ayuda="Los proyectos visibles agrupados por el departamento que los gestiona, con el avance de tareas y la carga de la semana."
    >
      <template #actions>
        <span
          class="inline-flex items-center gap-1.5 rounded-control border border-borde bg-tarjeta-suave px-3 py-1.5 text-cp-sm font-medium text-texto-suave"
          data-testid="projects-count"
        >
          <span class="font-mono text-texto-marca">{{ store.projects.length }}</span>
          {{ store.projects.length === 1 ? 'proyecto visible' : 'proyectos visibles' }}
        </span>
      </template>
      <template #filters>
        <!-- Buscador: el primero del grupo, con la lupa a la izquierda. -->
        <label class="inline-flex min-w-0 items-center gap-1.5">
          <span class="sr-only">Buscar</span>
          <span class="relative inline-flex min-w-0 items-center">
            <span class="pointer-events-none absolute left-2.5 inline-flex h-3.5 w-3.5 text-texto-tenue">
              <AppIcon name="search" />
            </span>
            <input
              v-model="buscador"
              type="search"
              placeholder="Nombre del proyecto"
              class="min-h-10 w-64 rounded-control border border-borde-fuerte bg-tarjeta-suave py-1.5 pl-8 pr-3 text-cp-sm text-texto transition-colors placeholder:text-texto-tenue hover:border-foco hover:bg-tarjeta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              data-testid="filter-search"
            />
          </span>
        </label>

        <FilterField
          label="Departamento"
          ancho="max-w-[190px]"
          :options="opcionesDepartamento"
          :model-value="filtroDepartamento"
          testid="filter-department"
          @update:model-value="filtroDepartamento = $event"
        />

        <FilterField
          label="Estado"
          ancho="max-w-[144px]"
          :options="opcionesEstado"
          :model-value="filtroEstado"
          testid="filter-status"
          @update:model-value="filtroEstado = $event"
        />

        <button
          v-if="hayFiltros"
          type="button"
          class="inline-flex min-h-10 items-center rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-texto-marca transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          data-testid="clear-filters"
          @click="limpiarFiltros"
        >
          Quitar filtros
        </button>
      </template>
    </PageHeader>

    <AsyncState
      :loading="loading"
      :error="error"
      :empty="!store.projects.length"
      empty-title="Todavía no hay proyectos visibles"
      empty-text="Crea el primero en Configuración para empezar a repartir la carga."
      empty-action="Ir a Configuración"
      loading-label="Cargando los proyectos"
      @retry="reintentar"
      @empty-action="irAConfiguracion"
    >
      <p
        v-if="!groups.length"
        class="rounded-tarjeta border border-dashed border-borde-fuerte bg-tarjeta p-6 text-center text-cp-base text-texto-tenue"
        data-testid="projects-no-match"
      >
        Ningún proyecto coincide con los filtros.
      </p>

      <div v-else>
        <section
          v-for="group in groups"
          :key="group.key"
          class="mb-6"
          data-testid="projects-group"
        >
          <header class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div class="flex min-w-0 items-center gap-2">
              <span
                v-if="group.color"
                class="h-4 w-1 shrink-0 rounded-pastilla"
                :style="{ backgroundColor: group.color }"
                aria-hidden="true"
              ></span>
              <h2 class="font-titulo text-cp-titulo font-bold text-texto-marca">{{ group.name }}</h2>
              <span class="text-cp-xs text-texto-tenue" data-testid="projects-group-summary">
                {{ group.items.length }}
                {{ group.items.length === 1 ? 'proyecto' : 'proyectos' }} · responsable
                {{ group.manager ?? 'sin responsable' }}
              </span>
            </div>

            <span
              class="inline-flex items-center gap-1.5 rounded-control border border-borde bg-tarjeta-suave px-2.5 py-1 text-cp-xs font-medium text-texto-suave"
              data-testid="projects-group-hours"
            >
              <strong class="font-mono text-texto-marca">{{ horasDe(group) }}</strong>
              h planificadas
            </span>
          </header>

          <!-- Rejilla de cards: una por proyecto. -->
          <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="project in group.items"
              :key="project.id"
              class="group flex cursor-pointer flex-col rounded-tarjeta border border-borde bg-tarjeta p-4 shadow-tarjeta transition-colors hover:border-primario/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
              role="button"
              tabindex="0"
              data-testid="project-card"
              @click="irAlProyecto(project)"
              @keydown.enter.prevent="irAlProyecto(project)"
              @keydown.space.prevent="irAlProyecto(project)"
            >
              <!-- Franja de color del departamento: dato del backend, en estilo en linea. -->
              <span
                class="mb-3 block h-1 w-10 rounded-pastilla"
                :style="{ backgroundColor: group.color ?? 'rgb(var(--cp-borde))' }"
                aria-hidden="true"
              ></span>

              <!-- Nombre + estado -->
              <div class="flex items-start justify-between gap-2">
                <h3 class="min-w-0 text-cp-sm font-bold text-texto-marca">
                  <span v-if="codigoDe(project.name)" class="font-mono">
                    {{ codigoDe(project.name).codigo }}
                  </span>
                  <span class="block truncate text-texto">
                    {{ codigoDe(project.name)?.resto ?? project.name }}
                  </span>
                </h3>

                <span
                  class="inline-flex flex-none items-center gap-1.5 rounded-pastilla px-2 py-0.5 text-cp-micro font-semibold"
                  :class="pildoraEstadoProyecto(project.status)"
                >
                  <span
                    class="h-1.5 w-1.5 flex-none rounded-full"
                    :class="puntoEstadoProyecto(project.status)"
                    aria-hidden="true"
                  ></span>
                  {{ projectStatus(project.status).label }}
                </span>
              </div>

              <!-- Responsable y equipo -->
              <div class="mt-3 flex items-center justify-between gap-3">
                <span class="min-w-0 truncate text-cp-xs text-texto-suave">
                  {{ project.owner_name ?? 'Sin responsable' }}
                </span>

                <span v-if="avataresDe(project).length" class="flex flex-none items-center">
                  <span
                    v-for="(member, index) in avataresDe(project)"
                    :key="member.user_id"
                    class="flex h-6 w-6 flex-none items-center justify-center rounded-avatar text-cp-micro font-bold ring-2 ring-tarjeta"
                    :class="index > 0 ? '-ml-1.5' : ''"
                    :style="estiloAvatarEquipo(group)"
                    :title="member.name"
                    data-testid="project-member"
                  >
                    {{ member.name.slice(0, 1) }}
                  </span>
                  <span
                    v-if="restoDe(project)"
                    class="ml-1 text-cp-xs text-texto-tenue"
                    data-testid="project-members-rest"
                  >
                    +{{ restoDe(project) }}
                  </span>
                </span>
              </div>

              <!-- Avance de tareas -->
              <div class="mt-3">
                <div class="flex items-center justify-between gap-2 text-cp-xs">
                  <span class="font-mono tabular-nums text-texto-suave" data-testid="project-tasks">
                    {{ resumenDe(project)?.tasks_done ?? 0 }}/{{ resumenDe(project)?.tasks_total ?? 0 }}
                    tareas
                  </span>
                  <span class="font-mono tabular-nums text-texto-tenue">
                    {{ avanceDe(project) }} %
                  </span>
                </div>
                <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-pastilla bg-tarjeta-suave">
                  <div
                    class="h-full rounded-pastilla bg-primario"
                    :style="{ width: `${avanceDe(project)}%` }"
                    data-testid="project-tasks-bar"
                  ></div>
                </div>
              </div>

              <!-- Carga de la semana -->
              <div class="mt-3 flex items-center justify-between gap-2 border-t border-borde-suave pt-3">
                <span class="text-cp-xs text-texto-tenue">Carga esta semana</span>

                <!-- la sobrecarga lleva triangulo, que el color no es el unico medio -->
                <span
                  v-if="cargaDe(project).tipo === 'sobrecarga'"
                  class="inline-flex items-center gap-1 rounded-pastilla bg-peligro-fondo px-2 py-0.5 text-cp-xs font-semibold text-peligro-texto"
                  data-testid="project-overloaded"
                >
                  <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3 L22 20 H2 Z" />
                  </svg>
                  {{ cargaDe(project).texto }}
                </span>

                <span
                  v-else-if="cargaDe(project).tipo === 'porcentaje'"
                  class="rounded-control bg-carga-optimo-fondo px-2 py-0.5 font-mono text-cp-xs font-semibold tabular-nums text-carga-optimo-texto"
                  data-testid="project-load"
                >
                  {{ cargaDe(project).texto }}
                </span>

                <span
                  v-else-if="cargaDe(project).tipo === 'sin-capacidad'"
                  class="rounded-control bg-carga-capacidad-desconocida-fondo px-2 py-0.5 font-mono text-cp-xs font-semibold tabular-nums text-carga-capacidad-desconocida-texto"
                  data-testid="project-load-unknown"
                >
                  {{ cargaDe(project).texto }}
                </span>

                <span v-else class="text-cp-xs text-texto-tenue">—</span>
              </div>
            </article>
          </div>
        </section>
      </div>
    </AsyncState>
  </div>
</template>
