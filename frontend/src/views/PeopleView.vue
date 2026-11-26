<script setup>
/**
 * Personas y competencias.
 *
 * La persona es mas que un usuario: tiene puesto, tipo de contrato, horario
 * versionado y competencias. La pantalla tiene dos pestanas: el directorio con
 * el horario vigente de cada persona y la matriz de competencias.
 *
 * Los dias no laborables se mantienen en Configuracion, en la pestana del
 * calendario laboral.
 */
import { computed, onMounted, ref } from 'vue'

import { departmentsApi, meApi, peopleApi, skillsApi } from '../api/client'
import AppIcon from '../components/AppIcon.vue'
import AsyncState from '../components/common/AsyncState.vue'
import FilterField from '../components/common/FilterField.vue'
import PageHeader from '../components/common/PageHeader.vue'
import PeopleDirectory from '../components/people/PeopleDirectory.vue'
import PersonDialog from '../components/people/PersonDialog.vue'
import SkillsMatrix from '../components/people/SkillsMatrix.vue'
import { useAuthStore } from '../stores/auth'
import { currentWeekKey, shiftWeek, weekLabel } from '../utils/weeks'

const TABS = [
  { name: 'directory', label: 'Directorio' },
  { name: 'skills', label: 'Competencias' },
]

const auth = useAuthStore()
const tab = ref('directory')
const week = ref(currentWeekKey())
const error = ref(null)
const loading = ref(true)
const isManager = ref(false)

const people = ref([])
const skills = ref([])
const departments = ref([])
const selectedId = ref(null)

/** Filtro de presentacion del directorio: acota lo ya cargado. */
const filtroDepartamento = ref('')

const currentTab = computed(() => TABS.find((item) => item.name === tab.value) ?? TABS[0])
const selected = computed(() => people.value.find((item) => item.id === selectedId.value) ?? null)

/** Opciones del filtro de departamento: todo, mas cada departamento cargado. */
const opcionesDepartamento = computed(() => [
  { value: '', label: 'Todos los departamentos' },
  ...departments.value.map((department) => ({
    value: String(department.id),
    label: department.name,
  })),
])

/** Etiqueta central del navegador de semana: "S46 · 2026-W46". */
const etiquetaSemana = computed(() => `${weekLabel(week.value)} · ${week.value}`)

/** Personas del directorio que quedan con el filtro de departamento. */
const personasVisibles = computed(() => {
  if (!filtroDepartamento.value) return people.value
  return people.value.filter(
    (person) => String(person.department_id ?? '') === filtroDepartamento.value,
  )
})

async function load() {
  error.value = null
  try {
    const token = await auth.ensureSession()
    const scope = await meApi.get(token)
    isManager.value = scope.is_manager === true
    const [peopleData, skillsData, departmentsData] = await Promise.all([
      peopleApi.list(token, { week: week.value }),
      skillsApi.catalog(token),
      departmentsApi.list(token),
    ])
    people.value = peopleData
    skills.value = skillsData
    departments.value = departmentsData
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function moveWeek(delta) {
  week.value = shiftWeek(week.value, delta)
  await load()
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
      title="Personas y Competencias"
      subtitle="Perfiles, horarios versionados y habilidades del equipo."
      ayuda="Perfiles, horarios vigentes y competencias técnicas del equipo para la semana seleccionada."
    >
      <template #filters>
        <FilterField
          v-if="departments.length > 1"
          label="Departamento"
          ancho="max-w-[144px]"
          :options="opcionesDepartamento"
          :model-value="filtroDepartamento"
          testid="filter-department"
          @update:model-value="filtroDepartamento = $event"
        />
      </template>

      <template #actions>
        <div class="inline-flex items-center gap-0.5 rounded-control border border-borde bg-tarjeta p-0.5 shadow-control">
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-control text-texto-tenue transition-colors hover:bg-tarjeta-suave hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            aria-label="Semana anterior"
            data-testid="week-previous"
            @click="moveWeek(-1)"
          >
            <span class="inline-flex h-3.5 w-3.5"><AppIcon name="chevronLeft" /></span>
          </button>
          <span
            class="min-w-[116px] px-2 text-center font-mono text-cp-sm font-semibold text-texto-marca"
            data-testid="week-label"
          >
            {{ etiquetaSemana }}
          </span>
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-control text-texto-tenue transition-colors hover:bg-tarjeta-suave hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            aria-label="Semana siguiente"
            data-testid="week-next"
            @click="moveWeek(1)"
          >
            <span class="inline-flex h-3.5 w-3.5"><AppIcon name="chevronRight" /></span>
          </button>
        </div>
      </template>
    </PageHeader>

    <AsyncState
      :loading="loading"
      :error="error"
      loading-label="Cargando las personas"
      @retry="reintentar"
    >
      <nav
        class="mb-4 inline-flex items-center gap-0.5 rounded-control bg-tarjeta-suave p-1"
        aria-label="Secciones de personas"
      >
        <button
          v-for="item in TABS"
          :key="item.name"
          type="button"
          class="min-h-9 rounded-control px-3 py-1.5 text-cp-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
          :class="
            tab === item.name
              ? 'bg-tarjeta text-texto-marca font-semibold shadow-control'
              : 'text-texto-suave hover:bg-tarjeta/70 hover:text-texto'
          "
          :aria-pressed="tab === item.name"
          :data-testid="`tab-${item.name}`"
          @click="tab = item.name"
        >
          {{ item.label }}
        </button>
      </nav>

      <PeopleDirectory
        v-if="currentTab.name === 'directory'"
        :people="personasVisibles"
        :week="week"
        @open="selectedId = $event"
      />
      <SkillsMatrix
        v-else
        :people="people"
        :skills="skills"
      />

      <PersonDialog
        v-if="selected"
        :person="selected"
        :skills="skills"
        :is-manager="isManager"
        :week="week"
        @close="selectedId = null"
        @saved="load"
      />
    </AsyncState>
  </div>
</template>
