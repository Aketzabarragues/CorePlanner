<script setup>
/**
 * Diagrama de Gantt.
 *
 * Las barras llegan del backend ya con el formato que espera la libreria:
 * una por tarea, con la persona asignada en la etiqueta y su color.
 *
 * El diagrama es de toda la organizacion y se puede acotar con los filtros
 * de departamento, proyecto y persona, que viven en la URL (`?department=`,
 * `?project=`, `?assigned_to=`): con filtro, solo salen las barras que
 * cumplen. El backend acota lo que ya es visible, nunca lo amplía.
 *
 * Las barras se pueden agrupar por proyecto, por departamento o por persona.
 * Cada bloque lleva una franja divisoria con el nombre del grupo, pintada
 * sobre el SVG de la libreria.
 *
 * Al mover o redimensionar una barra se guardan las fechas nuevas con un
 * PATCH de la tarea, de modo que el diagrama y la matriz de ocupacion
 * cuentan lo mismo.
 */
import Gantt from 'frappe-gantt'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { overviewApi, peopleApi, tasksApi } from '../api/client'
import { useTaskReload } from '../composables/useTaskReload'
import AlertBanner from '../components/common/AlertBanner.vue'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'
import { GANTT_VIEW_MODES, dateChangePayload } from '../utils/gantt'

const container = ref(null)
const error = ref(null)
const notice = ref(null)
const loading = ref(true)
const saving = ref(false)
const viewMode = ref('Week')
const members = ref([])
const undatedTaskIds = ref([])
const personas = ref([])
const feed = ref(null)

let gantt = null

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const store = useProjectsStore()

/** Medidas de la libreria: la franja divisoria se coloca con las mismas. */
const MEDIDAS = { bar_height: 24, padding: 16, header_height: 50 }

const GRUPOS = [
  { id: 'proyecto', label: 'Proyecto' },
  { id: 'departamento', label: 'Departamento' },
  { id: 'persona', label: 'Persona' },
  { id: 'sin', label: 'Sin agrupar' },
]

const departmentFilter = computed(() => route.query.department ?? '')
const projectFilter = computed(() => route.query.project ?? '')
const personFilter = computed(() => route.query.assigned_to ?? '')
const groupBy = computed(() => route.query.group ?? 'proyecto')

const proyectos = computed(() => (Array.isArray(store.projects) ? store.projects : []))
const departamentos = computed(() =>
  Array.isArray(store.departments) ? store.departments : [],
)

/** Lo que se lee encima del diagrama: con filtros, solo sale lo filtrado. */
const subtitle = computed(() => {
  const filtros = []
  if (departmentFilter.value) {
    filtros.push(`departamento ${nombreDepartamento(departmentFilter.value)}`)
  }
  if (projectFilter.value) {
    filtros.push(`proyecto ${nombreProyecto(projectFilter.value)}`)
  }
  if (personFilter.value) {
    filtros.push(`persona ${nombrePersona(personFilter.value)}`)
  }
  if (!filtros.length) {
    return 'Las barras de todos los proyectos visibles, agrupadas por proyecto.'
  }
  return `Las barras filtradas por ${filtros.join(', ')}.`
})

function nombreDepartamento(id) {
  const departamento = departamentos.value.find(
    (item) => String(item.id) === String(id),
  )
  return departamento?.name ?? 'desconocido'
}

function nombreProyecto(id) {
  const proyecto = proyectos.value.find((item) => String(item.id) === String(id))
  return proyecto?.name ?? 'desconocido'
}

function nombrePersona(id) {
  const persona = personas.value.find((item) => String(item.id) === String(id))
  return persona?.name ?? 'desconocida'
}

/** Departamento que gestiona el proyecto de una barra. */
function departamentoDe(task) {
  const proyecto = proyectos.value.find(
    (item) => String(item.id) === String(task.project_id),
  )
  const id = proyecto?.department_id
  if (id === null || id === undefined) return 'Sin departamento'
  return nombreDepartamento(id)
}

/** Clave de agrupacion de una barra, segun el grupo elegido. */
function claveDe(task) {
  if (groupBy.value === 'departamento') return departamentoDe(task)
  if (groupBy.value === 'persona') return task.assigned_name ?? 'Sin asignar'
  if (groupBy.value === 'sin') return ''
  return task.project_name ?? 'Sin proyecto'
}

/** Barras ordenadas por grupo y, dentro del grupo, por fecha de inicio. */
const barras = computed(() => {
  const tareas = feed.value?.tasks ?? []
  const ordenadas = [...tareas].sort((a, b) => {
    const grupoA = claveDe(a)
    const grupoB = claveDe(b)
    if (grupoA !== grupoB) return grupoA.localeCompare(grupoB, 'es')
    const inicioA = a.start ?? ''
    const inicioB = b.start ?? ''
    if (inicioA !== inicioB) return inicioA.localeCompare(inicioB)
    return a.id - b.id
  })
  return ordenadas.map((task) => ({ task, grupo: claveDe(task) }))
})

/** Filas donde empieza un grupo, para pintar la franja divisoria. */
const iniciosDeGrupo = computed(() => {
  const items = barras.value
  const inicios = []
  items.forEach((item, indice) => {
    if (!item.grupo) return
    if (indice === 0 || item.grupo !== items[indice - 1].grupo) {
      inicios.push({ indice, grupo: item.grupo })
    }
  })
  return inicios
})

/**
 * Etiqueta de una barra.
 *
 * El nombre del grupo encabeza la barra. El proyecto y la persona se mantienen
 * porque son datos distintos del grupo, salvo que ya sean el grupo o la
 * persona, en cuyo caso no se repiten.
 */
function etiqueta(task, grupo) {
  const partes = []
  if (grupo) partes.push(grupo)
  if (task.project_name && groupBy.value !== 'proyecto') {
    partes.push(task.project_name)
  }
  partes.push(task.title ?? task.name ?? '')
  if (task.assigned_name && groupBy.value !== 'persona') {
    partes.push(task.assigned_name)
  }
  return partes.filter(Boolean).join(' · ')
}

/**
 * Prepara las tareas para la libreria.
 *
 * La libreria busca la barra que se esta moviendo comparando con
 * igualdad estricta el identificador de la tarea, que es un numero, con el
 * que lee del DOM, que es texto. Con identificadores como texto las dos
 * cosas coinciden y el arrastre encuentra su barra.
 */
function toBarTasks(items) {
  return items.map(({ task, grupo }) => ({
    ...task,
    id: String(task.id),
    name: etiqueta(task, grupo),
  }))
}

/**
 * Pinta la franja divisoria de cada grupo.
 *
 * La libreria solo dibuja barras, asi que la franja se anade al SVG como una
 * linea horizontal en el borde superior de la primera fila de cada grupo. La
 * fila es la que la libreria calcula con las mismas medidas que se le pasan.
 */
function pintarFranjas() {
  const svg = container.value?.querySelector('svg.gantt')
  const capaRejilla = svg?.querySelector('g.grid')
  if (!svg || !capaRejilla) return

  svg.querySelector('g.grupos')?.remove()
  const documento = svg.ownerDocument
  const capa = documento.createElementNS('http://www.w3.org/2000/svg', 'g')
  capa.setAttribute('class', 'grupos')

  const fila = svg.querySelector('.grid .grid-row')
  const ancho = Number(fila?.getAttribute('width') ?? svg.getAttribute('width') ?? 0)
  const alto = MEDIDAS.bar_height + MEDIDAS.padding

  for (const inicio of iniciosDeGrupo.value) {
    const y = MEDIDAS.header_height + MEDIDAS.padding + inicio.indice * alto - 4
    const linea = documento.createElementNS('http://www.w3.org/2000/svg', 'line')
    linea.setAttribute('x1', '0')
    linea.setAttribute('x2', String(ancho))
    linea.setAttribute('y1', String(y))
    linea.setAttribute('y2', String(y))
    linea.setAttribute('class', 'grupo-linea')
    capa.appendChild(linea)
  }
  capaRejilla.after(capa)
}

function render(datos) {
  if (!container.value) return
  container.value.innerHTML = ''
  gantt = new Gantt(container.value, toBarTasks(barras.value), {
    view_mode: viewMode.value,
    bar_height: MEDIDAS.bar_height,
    padding: MEDIDAS.padding,
    header_height: MEDIDAS.header_height,
    on_date_change: handleDateChange,
  })
  members.value = datos.members ?? []
  undatedTaskIds.value = datos.undated_task_ids ?? []
  pintarFranjas()
}

async function load() {
  try {
    const token = await auth.ensureSession()
    const params = {}
    if (departmentFilter.value) params.department_id = departmentFilter.value
    if (projectFilter.value) params.project_id = projectFilter.value
    if (personFilter.value) params.assigned_to = personFilter.value

    const [respuesta, directorio] = await Promise.all([
      overviewApi.gantt(token, params),
      peopleApi.list(token).catch(() => []),
    ])
    personas.value = Array.isArray(directorio) ? directorio : []
    await store.ensureProjects(token).catch(() => null)

    feed.value = respuesta
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
  // El diagrama se pinta cuando su contenedor ya esta en la pagina: mientras
  // se carga, la pantalla muestra el esqueleto en su lugar.
  await nextTick()
  if (feed.value) render(feed.value)
}

/** Escribe un filtro en la URL, que es donde vive el estado de la vista. */
function cambiarFiltro(clave, valor) {
  const query = { ...route.query }
  if (valor === '' || valor === null || valor === undefined) {
    delete query[clave]
  } else {
    query[clave] = String(valor)
  }
  router.replace({ path: route.path, query })
}

/** Guarda las fechas nuevas cuando se mueve o redimensiona una barra. */
async function handleDateChange(task, start, end) {
  saving.value = true
  const payload = dateChangePayload(start, end)
  try {
    await tasksApi.update(auth.token, task.id, payload)
    notice.value = `Fechas actualizadas: ${payload.start_date} a ${payload.end_date}.`
    error.value = null
  } catch (err) {
    error.value = err.message
    await load()
  } finally {
    saving.value = false
  }
}

function changeViewMode(mode) {
  viewMode.value = mode
  if (gantt) {
    gantt.change_view_mode(mode)
    pintarFranjas()
  }
}

/** Vuelve a pedir el diagrama y enseña el esqueleto mientras llega. */
async function reintentar() {
  loading.value = true
  await load()
}

onMounted(load)
watch(
  () =>
    [departmentFilter.value, projectFilter.value, personFilter.value].join('|'),
  (nuevo, viejo) => {
    if (nuevo !== viejo) load()
  },
)
watch(groupBy, () => {
  if (feed.value) render(feed.value)
})
useTaskReload(load)
onBeforeUnmount(() => {
  gantt = null
})
</script>

<template>
  <div>
    <PageHeader title="Gantt" :subtitle="subtitle">
      <template #actions>
          <button
            v-for="mode in GANTT_VIEW_MODES"
            :key="mode.id"
            type="button"
            class="rounded border px-3 py-1.5 text-sm"
            :class="
              viewMode === mode.id
                ? 'border-siemens-900 bg-siemens-900 text-white'
                : 'border-slate-300 bg-white text-slate-700'
            "
            @click="changeViewMode(mode.id)"
          >
            {{ mode.label }}
          </button>

      </template>
    </PageHeader>

    <AlertBanner v-if="notice" variant="success" class="mb-2">
      {{ notice }}
    </AlertBanner>

    <div class="mb-3 flex flex-wrap items-end gap-2" data-testid="gantt-filters">
      <label
        class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5"
      >
        <span class="text-xs uppercase tracking-wide text-slate-500">Departamento</span>
        <select
          data-testid="gantt-filter-department"
          class="border-0 bg-transparent text-sm font-medium text-slate-700 focus:ring-0"
          :value="departmentFilter"
          @change="cambiarFiltro('department', $event.target.value)"
        >
          <option value="">Todos los departamentos</option>
          <option v-for="item in departamentos" :key="item.id" :value="String(item.id)">
            {{ item.name }}
          </option>
        </select>
      </label>

      <label
        class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5"
      >
        <span class="text-xs uppercase tracking-wide text-slate-500">Proyecto</span>
        <select
          data-testid="gantt-filter-project"
          class="border-0 bg-transparent text-sm font-medium text-slate-700 focus:ring-0"
          :value="projectFilter"
          @change="cambiarFiltro('project', $event.target.value)"
        >
          <option value="">Todos los proyectos</option>
          <option v-for="item in proyectos" :key="item.id" :value="String(item.id)">
            {{ item.name }}
          </option>
        </select>
      </label>

      <label
        class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5"
      >
        <span class="text-xs uppercase tracking-wide text-slate-500">Persona</span>
        <select
          data-testid="gantt-filter-person"
          class="border-0 bg-transparent text-sm font-medium text-slate-700 focus:ring-0"
          :value="personFilter"
          @change="cambiarFiltro('assigned_to', $event.target.value)"
        >
          <option value="">Todas las personas</option>
          <option v-for="item in personas" :key="item.id" :value="String(item.id)">
            {{ item.name }}
          </option>
        </select>
      </label>

      <label
        class="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5"
      >
        <span class="text-xs uppercase tracking-wide text-slate-500">Agrupar por</span>
        <select
          data-testid="gantt-group-by"
          class="border-0 bg-transparent text-sm font-medium text-slate-700 focus:ring-0"
          :value="groupBy"
          @change="cambiarFiltro('group', $event.target.value)"
        >
          <option v-for="grupo in GRUPOS" :key="grupo.id" :value="grupo.id">
            {{ grupo.label }}
          </option>
        </select>
      </label>
    </div>

    <AsyncState
      :loading="loading"
      :error="error"
      loading-label="Cargando el diagrama"
      @retry="reintentar"
    >
      <p v-if="saving" class="text-sm text-slate-500">Guardando fechas...</p>

      <ul v-if="members.length" class="mb-3 flex flex-wrap gap-3 text-xs text-slate-600">
        <li v-for="member in members" :key="member.user_id" class="flex items-center gap-1.5">
          <span :class="['inline-block h-3 w-3 rounded-sm', member.css_class]" />
          {{ member.name }}
        </li>
      </ul>

      <p v-if="undatedTaskIds.length" class="mb-3 text-xs text-amber-700">
        {{ undatedTaskIds.length }} tarea(s) sin fechas no aparecen en el diagrama.
      </p>

      <div ref="container" class="overflow-x-auto rounded border border-slate-200 bg-white p-2" />
    </AsyncState>
  </div>
</template>
