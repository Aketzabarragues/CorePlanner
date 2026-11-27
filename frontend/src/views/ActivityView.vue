<script setup>
/**
 * Bitacora de cambios.
 *
 * Es el registro de lo que ha pasado en los proyectos: quien lo hizo, que hizo
 * y cuando. La misma vista sirve para toda la organizacion y para un proyecto
 * concreto, que es un filtro (la ruta del proyecto o `?project=`), igual que
 * la capacidad o el Gantt.
 *
 * El timeline va agrupado por dia: cada dia es una cabecera y sus eventos.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { activityApi, departmentsApi, peopleApi } from '../api/client'
import { useProyectoFiltro } from '../composables/useProyectoFiltro'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { useTaskStatusesStore } from '../stores/taskStatuses'
import { actionLabel, fullDate, relativeTime } from '../utils/activity'
import { DEFAULT_TASK_STATUSES } from '../utils/kanban'
import { luminancia } from '../utils/statusColor'

const auth = useAuthStore()
const route = useRoute()
const statusStore = useTaskStatusesStore()

/** Entradas que trae una pagina de la bitacora. */
const PAGE_SIZE = 50

const entries = ref([])
const total = ref(0)
const error = ref(null)
const loading = ref(true)

/** Personas y departamentos, solo para el color de cada avatar. */
const personas = ref([])
const departamentos = ref([])

/** Proyecto que filtra la bitacora. */
const projectFilter = useProyectoFiltro()

/** Quedan entradas por pedir. */
const quedan = computed(() => entries.value.length < total.value)

/**
 * Entradas agrupadas por dia local, de lo mas reciente a lo mas antiguo.
 *
 * El dia se etiqueta con el mismo formato que el title de la entrada
 * (dd/mm/aaaa): la cabecera y el globo dicen la misma fecha.
 */
const dias = computed(() => {
  const porDia = new Map()
  for (const entrada of entries.value) {
    const clave = claveDeDia(entrada.created_at)
    const grupo = porDia.get(clave) ?? { clave, etiqueta: etiquetaDeDia(entrada.created_at), items: [] }
    grupo.items.push(entrada)
    porDia.set(clave, grupo)
  }
  return [...porDia.values()]
})

/** Clave local del dia de una fecha, para agrupar sin tocar el texto. */
function claveDeDia(fecha) {
  const momento = new Date(fecha)
  return `${momento.getFullYear()}-${momento.getMonth()}-${momento.getDate()}`
}

/** Etiqueta del dia: dd/mm/aaaa, como el inicio del title de la entrada. */
function etiquetaDeDia(fecha) {
  const momento = new Date(fecha)
  const dia = String(momento.getDate()).padStart(2, '0')
  const mes = String(momento.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${momento.getFullYear()}`
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
    const [page, , personasCargadas, departamentosCargados] = await Promise.all([
      activityApi.list(token, params),
      // Los movimientos de tarea llevan el estado: la etiqueta sale de los
      // estados del proyecto, que no tumben la bitacora si fallan.
      statusStore.loadAll(token).catch(() => null),
      // Personas y departamentos solo visten los avatares: que no lleguen
      // no tumba la bitacora, el avatar cae al color de la marca.
      mas ? Promise.resolve(personas.value) : peopleApi.list(token).catch(() => []),
      mas ? Promise.resolve(departamentos.value) : departmentsApi.list(token).catch(() => []),
    ])
    const items = page?.items ?? []
    entries.value = mas ? [...entries.value, ...items] : items
    total.value = page?.total ?? 0
    personas.value = personasCargadas
    departamentos.value = departamentosCargados
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

// El filtro cambia con el proyecto de la ruta o con el de la URL.
watch(
  () => projectFilter.value,
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
    />

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
                  <span class="font-semibold text-texto">{{ entrada.actor_name }}</span>
                  <span class="text-texto-suave">
                    {{ actionLabel(entrada, estadosDe(entrada.project_id)) }}
                  </span>
                </p>
                <p v-if="!projectFilter" class="text-cp-xs text-texto-tenue">
                  {{ entrada.project_name }}
                </p>
              </div>

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
