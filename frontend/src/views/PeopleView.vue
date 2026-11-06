<script setup>
/**
 * Personas y competencias.
 *
 * La persona es mas que un usuario: tiene puesto, tipo de contrato, horario
 * versionado y competencias. La pantalla tiene tres pestanas: el directorio
 * con el horario vigente de cada persona, la matriz de competencias y el
 * calendario laboral.
 */
import { computed, onMounted, ref } from 'vue'

import { calendarApi, departmentsApi, meApi, peopleApi } from '../api/client'
import PeopleDirectory from '../components/people/PeopleDirectory.vue'
import PersonDrawer from '../components/people/PersonDrawer.vue'
import SkillsMatrix from '../components/people/SkillsMatrix.vue'
import WorkCalendar from '../components/people/WorkCalendar.vue'
import { useAuthStore } from '../stores/auth'
import { currentWeekKey, shiftWeek, weekLabel } from '../utils/weeks'

const TABS = [
  { name: 'directory', label: 'Directorio' },
  { name: 'skills', label: 'Competencias' },
  { name: 'calendar', label: 'Días no laborables' },
]

const auth = useAuthStore()
const tab = ref('directory')
const week = ref(currentWeekKey())
const error = ref(null)
const loading = ref(true)
const isManager = ref(false)

const people = ref([])
const skills = ref([])
const days = ref([])
const departments = ref([])
const selectedId = ref(null)

const currentTab = computed(() => TABS.find((item) => item.name === tab.value) ?? TABS[0])
const selected = computed(() => people.value.find((item) => item.id === selectedId.value) ?? null)

async function load() {
  error.value = null
  try {
    const token = await auth.ensureSession()
    const scope = await meApi.get(token)
    isManager.value = scope.is_manager === true
    const [peopleData, skillsData, daysData, departmentsData] = await Promise.all([
      peopleApi.list(token, { week: week.value }),
      peopleApi.skillCatalog(token),
      calendarApi.list(token),
      departmentsApi.list(token),
    ])
    people.value = peopleData
    skills.value = skillsData
    days.value = daysData
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

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-7xl">
    <header class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-siemens-900">Personas y Competencias</h1>
        <p class="mt-1 text-sm text-slate-500">
          Perfiles, horarios versionados y habilidades del equipo.
        </p>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <button
          type="button"
          class="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50"
          data-testid="week-previous"
          @click="moveWeek(-1)"
        >
          &larr;
        </button>
        <span class="min-w-20 text-center font-medium text-slate-900" data-testid="week-label">
          {{ weekLabel(week) }} · {{ week }}
        </span>
        <button
          type="button"
          class="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50"
          data-testid="week-next"
          @click="moveWeek(1)"
        >
          &rarr;
        </button>
      </div>
    </header>

    <p v-if="loading" class="text-sm text-slate-500">Cargando...</p>

    <template v-else>
      <nav class="mb-4 flex gap-1 border-b border-slate-200">
        <button
          v-for="item in TABS"
          :key="item.name"
          type="button"
          :data-testid="`tab-${item.name}`"
          class="border-b-2 px-3 py-2 text-sm"
          :class="
            tab === item.name
              ? 'border-siemens-900 font-medium text-siemens-900'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          "
          @click="tab = item.name"
        >
          {{ item.label }}
        </button>
      </nav>

      <p v-if="error" class="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {{ error }}
      </p>

      <PeopleDirectory
        v-if="currentTab.name === 'directory'"
        :people="people"
        :week="week"
        @open="selectedId = $event"
      />
      <SkillsMatrix v-else-if="currentTab.name === 'skills'" :people="people" :skills="skills" />
      <WorkCalendar
        v-else
        :days="days"
        :departments="departments"
        :is-manager="isManager"
        @saved="load"
      />

      <PersonDrawer
        v-if="selected"
        :person="selected"
        :skills="skills"
        :is-manager="isManager"
        :week="week"
        @close="selectedId = null"
        @saved="load"
      />
    </template>
  </div>
</template>
