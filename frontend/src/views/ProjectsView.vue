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
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { PROJECT_STATUSES, projectStatus } from '../utils/navigation'

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
      items: loose,
    })
  }
  return result
})

/** Si hay filtros puestos: distingue "no hay nada" de "no coincide nada". */
const hayFiltros = computed(
  () => Boolean(buscador.value.trim() || filtroDepartamento.value || filtroEstado.value),
)

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

/** Color de la pastilla del estado del proyecto. */
function projectStatusPill(tone) {
  if (tone === 'active') return 'bg-emerald-100 text-emerald-700'
  if (tone === 'paused') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
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
      subtitle="Proyectos visibles, agrupados por el departamento que los gestiona."
    />

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
      <div class="mb-4 flex flex-wrap items-end gap-3">
        <label class="text-xs font-medium text-slate-600">
          <span class="mb-1 block">Buscar</span>
          <input
            v-model="buscador"
            type="search"
            placeholder="Nombre del proyecto"
            class="w-64 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            data-testid="filter-search"
          />
        </label>

        <label class="text-xs font-medium text-slate-600">
          <span class="mb-1 block">Departamento</span>
          <select
            v-model="filtroDepartamento"
            class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            data-testid="filter-department"
          >
            <option value="">Todos los departamentos</option>
            <option
              v-for="department in store.departments"
              :key="department.id"
              :value="String(department.id)"
            >
              {{ department.name }}
            </option>
          </select>
        </label>

        <label class="text-xs font-medium text-slate-600">
          <span class="mb-1 block">Estado</span>
          <select
            v-model="filtroEstado"
            class="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            data-testid="filter-status"
          >
            <option value="">Cualquier estado</option>
            <option v-for="estado in PROJECT_STATUSES" :key="estado.value" :value="estado.value">
              {{ estado.label }}
            </option>
          </select>
        </label>

        <button
          v-if="hayFiltros"
          type="button"
          class="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-siemens-900"
          data-testid="clear-filters"
          @click="limpiarFiltros"
        >
          Quitar filtros
        </button>
      </div>

      <p
        v-if="!groups.length"
        class="rounded border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500"
        data-testid="projects-no-match"
      >
        Ningún proyecto coincide con los filtros.
      </p>

      <div v-else class="overflow-x-auto rounded border border-slate-200 bg-white">
        <table class="w-full text-left text-sm" data-testid="projects-table">
          <thead>
            <tr
              class="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"
            >
              <th scope="col" class="px-3 py-2 font-medium">Proyecto</th>
              <th scope="col" class="px-3 py-2 font-medium">Responsable</th>
              <th scope="col" class="px-3 py-2 font-medium">Equipo</th>
              <th scope="col" class="px-3 py-2 font-medium">Tareas</th>
              <th scope="col" class="px-3 py-2 font-medium">Carga esta semana</th>
              <th scope="col" class="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in groups" :key="group.key">
              <tr class="border-b border-slate-200 bg-slate-50" data-testid="projects-group">
                <th colspan="6" scope="colgroup" class="px-3 py-2 text-left">
                  <span class="text-sm font-semibold text-siemens-900">{{ group.name }}</span>
                  <span class="ml-2 text-xs text-slate-500" data-testid="projects-group-summary">
                    {{ group.items.length }}
                    {{ group.items.length === 1 ? 'proyecto' : 'proyectos' }} · responsable
                    {{ group.manager ?? 'sin responsable' }}
                  </span>
                </th>
              </tr>

              <tr
                v-for="project in group.items"
                :key="project.id"
                role="button"
                tabindex="0"
                class="cursor-pointer border-t border-slate-100 hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50"
                data-testid="project-row"
                @click="irAlProyecto(project)"
                @keydown.enter.prevent="irAlProyecto(project)"
                @keydown.space.prevent="irAlProyecto(project)"
              >
                <td class="px-3 py-2">
                  <RouterLink
                    :to="{ name: 'project', params: { id: String(project.id) } }"
                    class="font-medium text-siemens-900 hover:underline"
                    @click.stop
                  >
                    {{ project.name }}
                  </RouterLink>
                </td>
                <td class="px-3 py-2 text-slate-600">{{ project.owner_name ?? '—' }}</td>
                <td class="px-3 py-2">
                  <div v-if="avataresDe(project).length" class="flex items-center">
                    <span
                      v-for="(member, index) in avataresDe(project)"
                      :key="member.user_id"
                      class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 ring-2 ring-white"
                      :class="index > 0 ? '-ml-1.5' : ''"
                      :title="member.name"
                      data-testid="project-member"
                    >
                      {{ member.name.slice(0, 1) }}
                    </span>
                    <span
                      v-if="restoDe(project)"
                      class="ml-1 text-xs text-slate-500"
                      data-testid="project-members-rest"
                    >
                      +{{ restoDe(project) }}
                    </span>
                  </div>
                  <span v-else class="text-xs text-slate-400">—</span>
                </td>
                <td class="px-3 py-2">
                  <template v-if="resumenDe(project) && resumenDe(project).tasks_total">
                    <span class="text-xs text-slate-600" data-testid="project-tasks">
                      {{ resumenDe(project).tasks_done }}/{{ resumenDe(project).tasks_total }}
                    </span>
                    <div class="mt-1 h-1.5 w-24 rounded-full bg-slate-100">
                      <div
                        class="h-1.5 rounded-full bg-siemens-900"
                        :style="{ width: `${avanceDe(project)}%` }"
                        data-testid="project-tasks-bar"
                      ></div>
                    </div>
                  </template>
                  <span v-else class="text-xs text-slate-400">—</span>
                </td>
                <td class="px-3 py-2">
                  <span
                    v-if="cargaDe(project).tipo === 'sobrecarga'"
                    class="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                    data-testid="project-overloaded"
                  >
                    Sobrecargado
                  </span>
                  <span
                    v-else-if="cargaDe(project).tipo === 'porcentaje'"
                    class="text-xs text-slate-600"
                    data-testid="project-load"
                  >
                    {{ cargaDe(project).texto }}
                  </span>
                  <span
                    v-else-if="cargaDe(project).tipo === 'sin-capacidad'"
                    class="text-xs text-slate-400"
                    data-testid="project-load-unknown"
                  >
                    Sin capacidad
                  </span>
                  <span v-else class="text-xs text-slate-400">—</span>
                </td>
                <td class="px-3 py-2">
                  <span
                    class="rounded-full px-2 py-0.5 text-xs font-medium"
                    :class="projectStatusPill(projectStatus(project.status).tone)"
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
