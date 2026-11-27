<script setup>
/**
 * Bitacora de cambios.
 *
 * Es el registro de lo que ha pasado en los proyectos: quien lo hizo, que hizo
 * y cuando. La misma vista sirve para toda la organizacion y para un proyecto
 * concreto, que es un filtro (la ruta del proyecto o `?project=`), igual que
 * la capacidad o el Gantt.
 *
 * Los filtros de la cabecera viajan en la URL (`?persona=`, `?tipo=` y
 * `?project=`): el estado de la vista es la URL, igual que en las demas vistas.
 *
 * El timeline va agrupado por dia: cada dia es una cabecera y sus eventos.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { activityApi, departmentsApi, peopleApi, projectsApi } from '../api/client'
import AsyncState from '../components/common/AsyncState.vue'
import FilterField from '../components/common/FilterField.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useProyectoFiltro } from '../composables/useProyectoFiltro'
import { useAuthStore } from '../stores/auth'
import { useTaskStatusesStore } from '../stores/taskStatuses'
import {
  actionLabel,
  diaRelativo,
  fullDate,
  proyectoCortado,
  relativeTime,
  repeticionesConsecutivas,
  tipoDeAccion,
} from '../utils/activity'
import { DEFAULT_TASK_STATUSES } from '../utils/kanban'
import { luminancia } from '../utils/statusColor'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const statusStore = useTaskStatusesStore()

/** Entradas que trae una pagina de la bitacora. */
const PAGE_SIZE = 50

/**
 * Tipos de evento que se eligen en la cabecera.
 *
 * El valor es el prefijo de la accion de la bitacora: el checklist son cuatro
 * acciones distintas que comparten `task.checklist_item`, y el prefijo las trae
 * a las cuatro de una.
 */
const OPCIONES_TIPO = [
  { value: 'task.created', label: 'Alta' },
  { value: 'task.updated', label: 'Edición' },
  { value: 'task.moved', label: 'Cambio de estado' },
  { value: 'task.checklist_item', label: 'Checklist' },
  { value: 'task.commented', label: 'Comentario' },
]

const entries = ref([])
const total = ref(0)
const error = ref(null)
const loading = ref(true)

/** Personas y departamentos, solo para el color de cada avatar. */
const personas = ref([])
const departamentos = ref([])

/** Proyectos visibles: las opciones del filtro de proyecto. */
const projects = ref([])

/**
 * Proyecto que filtra la bitacora: la ruta o `?project=`.
 *
 * En el espacio del proyecto el proyecto viene de la ruta y el desplegable
 * no se pinta: cambiar de proyecto es navegar, no filtrar.
 */
const projectFilter = useProyectoFiltro()

/** Espacio de proyecto: el proyecto viene de la ruta y el desplegable no se pinta. */
const enProyecto = computed(() => Boolean(route.params.id))

/** Persona que hizo el cambio y tipo de evento, de la URL. */
const personaFilter = computed(() => route.query.persona ?? '')
const tipoFilter = computed(() => route.query.tipo ?? '')

/** Quedan entradas por pedir. */
const quedan = computed(() => entries.value.length < total.value)

/**
 * Entradas agrupadas por dia local, de lo mas reciente a lo mas antiguo.
 *
 * El dia se etiqueta con el mismo formato que el title de la entrada
 * (dd/mm/aaaa): la cabecera y el globo dicen la misma fecha.
 */
const dias = computed(() => {
  const repetidos = repeticionesConsecutivas(entries.value)
  const porDia = new Map()
  entries.value.forEach((entrada, indice) => {
    const clave = claveDeDia(entrada.created_at)
    const grupo = porDia.get(clave) ?? { clave, etiqueta: etiquetaDeDia(entrada.created_at), items: [] }
    grupo.items.push({ ...entrada, repetidas: repetidos[indice] })
    porDia.set(clave, grupo)
  })
  return [...porDia.values()]
})

/** Clave local del dia de una fecha, para agrupar sin tocar el texto. */
function claveDeDia(fecha) {
  const momento = new Date(fecha)
  return `${momento.getFullYear()}-${momento.getMonth()}-${momento.getDate()}`
}

/** Etiqueta del dia: el relativo delante cuando toca, y la fecha detras. */
function etiquetaDeDia(fecha) {
  const momento = new Date(fecha)
  const dia = String(momento.getDate()).padStart(2, '0')
  const mes = String(momento.getMonth() + 1).padStart(2, '0')
  const fechaCorta = `${dia}/${mes}/${momento.getFullYear()}`
  const relativo = diaRelativo(fecha)
  return relativo ? `${relativo} · ${fechaCorta}` : fechaCorta
}



/**
 * Color de cada actor: el color de su departamento (dato del backend),
 * resuelto por nombre de departamento contra la lista de departamentos.
 */
const colorPorActor = computed(() => {
  const colorPorNombre = new Map(
    departamentos.value
      .filter((departamento) => departamento.name && departamento.color)
      .map((departamento) => [departamento.name, departamento.color]),
  )
  const mapa = new Map()
  for (const persona of personas.value) {
    const color = persona.department_name ? colorPorNombre.get(persona.department_name) : null
    if (color) mapa.set(String(persona.id), color)
  }
  return mapa
})

/**
 * Estilo en linea del avatar del actor: el color de su departamento con el
 * texto calculado para el contraste. Sin color resuelto, el primario de la
 * marca, como antes.
 */
function estiloAvatar(entrada) {
  const color = colorPorActor.value.get(String(entrada.actor_id)) ?? null
  if (!color) {
    return {
      backgroundColor: 'rgb(var(--cp-primario))',
      color: 'rgb(var(--cp-sobre-primario))',
    }
  }
  return { backgroundColor: color, color: contrasteSobre(color) }
}

/** Texto legible sobre un hex de fondo: oscuro o claro por luminancia. */
function contrasteSobre(hex) {
  const brillo = luminancia(hex) ?? 0
  return brillo >= 0.5 ? 'rgb(var(--cp-texto))' : 'rgb(var(--cp-sobre-primario))'
}

/** Estados del proyecto de la entrada, o los por defecto si no hay. */
function estadosDe(projectId) {
  const lista = statusStore.statesOf(projectId)
  return lista.length ? lista : DEFAULT_TASK_STATUSES
}

/** Iniciales de quien ha hecho el cambio. */
function iniciales(nombre) {
  const palabras = String(nombre ?? '').split(/\s+/).filter(Boolean)
  if (!palabras.length) return '?'
  if (palabras.length === 1) return palabras[0][0].toUpperCase()
  return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase()
}

/** Opciones del filtro de persona: todas, mas cada persona cargada. */
const opcionesPersona = computed(() => [
  { value: '', label: 'Todas las personas' },
  ...personas.value.map((persona) => ({ value: String(persona.id), label: persona.name })),
])

/** Opciones del filtro de proyecto: todos, mas cada proyecto visible. */
const opcionesProyecto = computed(() => [
  { value: '', label: 'Todos los proyectos' },
  ...projects.value.map((project) => ({ value: String(project.id), label: project.name })),
])

/** Opciones del filtro de tipo de evento. */
const opcionesTipo = computed(() => [
  { value: '', label: 'Todos los tipos' },
  ...OPCIONES_TIPO,
])

/**
 * Escribe los filtros que cambian en la URL.
 *
 * El proyecto ya vive en la URL o en la ruta, no se repite: lo escribe quien
 * mueve la vista. Los valores vacios se quitan de la consulta.
 */
function cambiarFiltro(valores) {
  const query = { ...route.query }
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor) query[clave] = String(valor)
    else delete query[clave]
  }
  router.replace({ path: route.path, query })
}

/**
 * Pide la bitacora.
 *
 * Con mas false reemplaza la lista: es el cambio de filtro o la primera
 * carga. Con mas true anade la pagina siguiente a lo que ya hay.
 */
async function load(mas = false) {
  try {
    const token = await auth.ensureSession()
    const offset = mas ? entries.value.length : 0
    const params = { limit: PAGE_SIZE, offset }
    if (projectFilter.value) params.project_id = projectFilter.value
    if (personaFilter.value) params.actor_id = personaFilter.value
    if (tipoFilter.value) params.action = tipoFilter.value
    const [page, , personasCargadas, departamentosCargados, projectsCargados] = await Promise.all([
      activityApi.list(token, params),
      // Los movimientos de tarea llevan el estado: la etiqueta sale de los
      // estados del proyecto, que no tumben la bitacora si fallan.
      statusStore.loadAll(token).catch(() => null),
      // Personas y departamentos solo visten los avatares: que no lleguen
      // no tumba la bitacora, el avatar cae al color de la marca.
      mas ? Promise.resolve(personas.value) : peopleApi.list(token).catch(() => []),
      mas ? Promise.resolve(departamentos.value) : departmentsApi.list(token).catch(() => []),
      // Los proyectos solo llenan el desplegable: que no lleguen no tumba
      // la bitacora, el filtro queda sin opciones propias.
      mas ? Promise.resolve(projects.value) : projectsApi.list(token).catch(() => []),
    ])
    const items = page?.items ?? []
    entries.value = mas ? [...entries.value, ...items] : items
    total.value = page?.total ?? 0
    personas.value = personasCargadas
    departamentos.value = departamentosCargados
    projects.value = projectsCargados
    error.value = null
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

/** Pide la pagina siguiente. */
async function pedirMas() {
  loading.value = true
  await load(true)
}

/** Vuelve a pedir los datos y enseña el esqueleto mientras llegan. */
async function reintentar() {
  loading.value = true
  await load()
}

onMounted(load)

// Los tres filtros cambian con la URL: recarga la bitacora con ellos.
watch(
  () => [projectFilter.value, personaFilter.value, tipoFilter.value],
  async () => {
    loading.value = true
    await load()
  },
)
</script>

<template>
  <div>
    <PageHeader
      title="Actividad"
      ayuda="Registro cronológico de cambios en tareas, checklists y estados. Sin filtro, los proyectos visibles; con filtro, el que filtra."
    >
      <template #filters>
        <FilterField
          label="Persona"
          ancho="max-w-[190px]"
          :options="opcionesPersona"
          :model-value="personaFilter"
          testid="filter-person"
          @update:model-value="cambiarFiltro({ persona: $event })"
        />

        <FilterField
          v-if="!enProyecto"
          label="Proyecto"
          ancho="max-w-[190px]"
          :options="opcionesProyecto"
          :model-value="projectFilter"
          testid="filter-project"
          @update:model-value="cambiarFiltro({ project: $event })"
        />

        <FilterField
          label="Tipo de evento"
          ancho="max-w-[150px]"
          :options="opcionesTipo"
          :model-value="tipoFilter"
          testid="filter-type"
          @update:model-value="cambiarFiltro({ tipo: $event })"
        />
      </template>
    </PageHeader>

    <AsyncState
      :loading="loading"
      :error="error"
      error-test-id="activity-error"
      loading-label="Cargando la bitácora"
      @retry="reintentar"
    >
      <p
        v-if="!entries.length"
        class="rounded-tarjeta border border-dashed border-borde-fuerte bg-tarjeta p-6 text-center text-cp-base text-texto-tenue"
        data-testid="activity-empty"
      >
        Todavía no hay nada registrado.
      </p>

      <div
        v-else
        class="divide-y divide-borde rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta"
        data-testid="activity-list"
      >
        <template v-for="dia in dias" :key="dia.clave">
          <!-- cabecera de dia -->
          <div class="flex items-center gap-3 border-b border-borde bg-tarjeta-suave px-4 py-2.5">
            <h2 class="font-titulo text-cp-sm font-bold text-texto-marca">{{ dia.etiqueta }}</h2>
            <span class="text-cp-xs text-texto-tenue">
              {{ dia.items.length }} {{ dia.items.length === 1 ? 'evento' : 'eventos' }}
            </span>
          </div>

          <ul class="divide-y divide-borde-suave">
            <li
              v-for="entrada in dia.items"
              :key="entrada.id"
              class="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-tarjeta-suave/60"
              data-testid="activity-entry"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-avatar text-cp-micro font-bold"
                :style="estiloAvatar(entrada)"
                aria-hidden="true"
              >
                {{ iniciales(entrada.actor_name) }}
              </span>

              <div class="min-w-0 flex-1">
                <p class="text-cp-sm">
                  <span class="font-semibold text-texto">{{ entrada.actor_name }}</span
                  ><span class="text-texto-suave"
                    >{{ actionLabel(entrada, estadosDe(entrada.project_id)) }}</span
                  ><span
                    v-if="entrada.repetidas > 1"
                    class="ml-1.5 inline-flex rounded-control border border-borde bg-tarjeta-suave px-1.5 py-px font-mono text-cp-micro font-semibold text-texto-suave"
                    title="Cambios consecutivos agrupados"
                    data-testid="activity-repeat"
                    >x{{ entrada.repetidas }}</span
                  >
                </p>
                <p v-if="!projectFilter" class="flex items-center gap-1.5 text-cp-xs text-texto-tenue">
                  <span
                    v-if="proyectoCortado(entrada.project_name).codigo"
                    class="rounded-control bg-tarjeta-suave px-1.5 py-0.5 font-mono text-texto-suave"
                    data-testid="activity-project-code"
                    >{{ proyectoCortado(entrada.project_name).codigo }}</span
                  >
                  <span>{{ proyectoCortado(entrada.project_name).nombre }}</span>
                </p>
              </div>

              <span
                class="shrink-0 rounded-control border px-2 py-0.5 text-cp-micro font-semibold"
                :class="tipoDeAccion(entrada).clases"
                data-testid="activity-type"
              >
                {{ tipoDeAccion(entrada).label }}
              </span>
              <span
                class="shrink-0 font-mono text-cp-xs text-texto-tenue"
                :title="fullDate(entrada.created_at)"
                data-testid="activity-time"
              >
                {{ relativeTime(entrada.created_at) }}
              </span>
            </li>
          </ul>
        </template>
      </div>

      <div v-if="quedan" class="mt-3 flex justify-center">
        <button
          type="button"
          class="inline-flex min-h-10 items-center rounded-control border border-borde-fuerte bg-tarjeta px-3 py-1.5 text-cp-sm font-medium text-texto transition-colors hover:bg-tarjeta-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          data-testid="activity-more"
          @click="pedirMas"
        >
          Ver más
        </button>
      </div>
    </AsyncState>
  </div>
</template>
