<script setup>
/**
 * Bitacora de cambios.
 *
 * Es el registro de lo que ha pasado en los proyectos: quien lo hizo, que hizo
 * y cuando. La misma vista sirve para toda la organizacion y para un proyecto
 * concreto, que es un filtro (`?project=`), igual que la capacidad o el Gantt.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { activityApi } from '../api/client'
import AsyncState from '../components/common/AsyncState.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'
import { actionLabel, fullDate, relativeTime } from '../utils/activity'

const auth = useAuthStore()
const route = useRoute()

/** Entradas que trae una pagina de la bitacora. */
const PAGE_SIZE = 50

const entries = ref([])
const total = ref(0)
const error = ref(null)
const loading = ref(true)

/** Proyecto que filtra la bitacora. */
const projectFilter = computed(() => route.query.project ?? '')

const subtitle = computed(() =>
  projectFilter.value
    ? 'Lo que ha pasado en el proyecto que filtra.'
    : 'Lo que ha pasado en los proyectos visibles.',
)

/** Quedan entradas por pedir. */
const quedan = computed(() => entries.value.length < total.value)

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
    const page = await activityApi.list(token, params)
    const items = page?.items ?? []
    entries.value = mas ? [...entries.value, ...items] : items
    total.value = page?.total ?? 0
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

watch(
  () => route.query.project,
  async () => {
    loading.value = true
    await load()
  },
)
</script>

<template>
  <div>
    <PageHeader title="Actividad" :subtitle="subtitle" />

    <AsyncState
      :loading="loading"
      :error="error"
      error-test-id="activity-error"
      loading-label="Cargando la bitácora"
      @retry="reintentar"
    >
      <p
        v-if="!entries.length"
        class="rounded border border-slate-200 bg-white p-6 text-center text-sm text-slate-500"
        data-testid="activity-empty"
      >
        Todavía no hay nada registrado.
      </p>

      <ul
        v-else
        class="divide-y rounded border border-slate-200 bg-white"
        data-testid="activity-list"
      >
        <li
          v-for="entrada in entries"
          :key="entrada.id"
          class="flex items-start gap-3 p-3"
          data-testid="activity-entry"
        >
          <span
            class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-siemens-500 text-xs font-semibold text-white"
          >
            {{ iniciales(entrada.actor_name) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm">
              <span class="font-medium text-slate-900">{{ entrada.actor_name }}</span>
              <span class="text-slate-600">{{ actionLabel(entrada) }}</span>
            </p>
            <p v-if="!projectFilter" class="text-xs text-slate-500">
              {{ entrada.project_name }}
            </p>
          </div>
          <span
            class="shrink-0 text-xs text-slate-400"
            :title="fullDate(entrada.created_at)"
            data-testid="activity-time"
          >
            {{ relativeTime(entrada.created_at) }}
          </span>
        </li>
      </ul>

      <div v-if="quedan" class="mt-3 flex justify-center">
        <button
          type="button"
          class="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700"
          data-testid="activity-more"
          @click="pedirMas"
        >
          Ver más
        </button>
      </div>
    </AsyncState>
  </div>
</template>
