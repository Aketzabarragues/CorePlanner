<script setup>
/**
 * Listado global de proyectos.
 *
 * Los proyectos van agrupados por el departamento que los gestiona. Dentro de
 * cada grupo, cada proyecto es una fila con su nombre, su responsable, su
 * equipo, el avance de sus tareas, la carga de la semana y su estado. La fila
 * entera es clicable y lleva al resumen del proyecto.
 *
 * Todas las secciones se dibujan en una sola tabla: asi el limite de cada
 * columna cae en el mismo pixel en todos los grupos, cosa que con una tabla
 * por seccion no se puede garantizar.
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

      <div v-else class="overflow-x-auto rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta">
        <table class="w-full text-left text-cp-sm" data-testid="projects-table">
          <thead>
            <tr class="border-b border-borde bg-tarjeta-suave text-cp-micro uppercase tracking-wider text-texto-tenue">
              <th scope="col" class="px-3 py-2.5 font-semibold">Proyecto</th>
              <th scope="col" class="px-3 py-2.5 font-semibold">Responsable</th>
              <th scope="col" class="px-3 py-2.5 font-semibold">Equipo</th>
              <th scope="col" class="px-3 py-2.5 font-semibold">Tareas</th>
              <th scope="col" class="px-3 py-2.5 font-semibold">Carga esta semana</th>
              <th scope="col" class="px-3 py-2.5 font-semibold">Estado</th>
            </tr>
          </thead>

          <tbody>
            <template v-for="group in groups" :key="group.key">
              <!-- fila de grupo: la franja de color del departamento -->
              <tr class="border-b border-borde bg-tarjeta-suave" data-testid="projects-group">
                <th colspan="6" scope="colgroup" class="px-3 py-2 text-left">
                  <span class="flex items-center gap-2">
                    <span
                      v-if="group.color"
                      class="h-4 w-1 shrink-0 rounded-pastilla"
                      :style="{ backgroundColor: group.color }"
                      aria-hidden="true"
                    ></span>
                    <span class="text-cp-sm font-bold text-texto-marca">{{ group.name }}</span>
                    <span
                      class="text-cp-xs font-normal text-texto-tenue"
                      data-testid="projects-group-summary"
                    >
                      {{ group.items.length }}
                      {{ group.items.length === 1 ? 'proyecto' : 'proyectos' }} · responsable
                      {{ group.manager ?? 'sin responsable' }}
                    </span>
                  </span>
                </th>
              </tr>

              <tr
                v-for="project in group.items"
                :key="project.id"
                role="button"
                tabindex="0"
                class="cursor-pointer border-t border-borde-suave transition-colors hover:bg-tarjeta-suave/60 focus:outline-none focus-visible:bg-tarjeta-suave focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foco"
                data-testid="project-row"
                @click="irAlProyecto(project)"
                @keydown.enter.prevent="irAlProyecto(project)"
                @keydown.space.prevent="irAlProyecto(project)"
              >
                <td class="px-3 py-2">
                  <RouterLink
                    :to="{ name: 'project', params: { id: String(project.id) } }"
                    class="font-semibold text-texto-marca hover:underline"
                    @click.stop
                  >
                    {{ project.name }}
                  </RouterLink>
                </td>

                <td class="px-3 py-2 text-texto-suave">{{ project.owner_name ?? '—' }}</td>

                <td class="px-3 py-2">
                  <div v-if="avataresDe(project).length" class="flex items-center">
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
                    <span v-if="restoDe(project)" data-testid="project-members-rest"
                          class="ml-1 text-cp-xs text-texto-tenue">
                      +{{ restoDe(project) }}
                    </span>
                  </div>
                  <span v-else class="text-cp-xs text-texto-tenue">—</span>
                </td>

                <td class="px-3 py-2">
                  <template v-if="resumenDe(project) && resumenDe(project).tasks_total">
                    <span class="font-mono text-cp-xs text-texto-suave" data-testid="project-tasks">
                      {{ resumenDe(project).tasks_done }}/{{ resumenDe(project).tasks_total }}
                    </span>
                    <span class="mt-1 block h-1.5 w-24 overflow-hidden rounded-pastilla bg-tarjeta-suave">
                      <span
                        class="block h-1.5 rounded-pastilla bg-primario"
                        :style="{ width: `${avanceDe(project)}%` }"
                        data-testid="project-tasks-bar"
                      ></span>
                    </span>
                  </template>
                  <span v-else class="text-cp-xs text-texto-tenue">—</span>
                </td>

                <td class="px-3 py-2">
                  <!-- la sobrecarga lleva triangulo, que el color no es el unico medio -->
                  <span
                    v-if="cargaDe(project).tipo === 'sobrecarga'"
                    class="inline-flex items-center gap-1 whitespace-nowrap rounded-pastilla bg-peligro-fondo px-2 py-0.5 text-cp-xs font-semibold text-peligro-texto"
                    data-testid="project-overloaded"
                  >
                    <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 3 L22 20 H2 Z" />
                    </svg>
                    Sobrecargado
                  </span>
                  <span
                    v-else-if="cargaDe(project).tipo === 'porcentaje'"
                    class="font-mono text-cp-xs text-texto-suave"
                    data-testid="project-load"
                  >
                    {{ cargaDe(project).texto }}
                  </span>
                  <span
                    v-else-if="cargaDe(project).tipo === 'sin-capacidad'"
                    class="text-cp-xs text-texto-tenue"
                    data-testid="project-load-unknown"
                  >
                    Sin capacidad
                  </span>
                  <span v-else class="text-cp-xs text-texto-tenue">—</span>
                </td>

                <td class="px-3 py-2">
                  <span
                    class="rounded-pastilla px-2 py-0.5 text-cp-xs font-semibold"
                    :class="pildoraEstadoProyecto(project.status)"
                  >
                    {{ projectStatus(project.status).label }}
                  </span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </AsyncState>
  </div>
</template>
