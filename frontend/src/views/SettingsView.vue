<script setup>
/**
 * Configuracion de la organizacion.
 *
 * Es la pantalla del gerente: calendario laboral, personas, departamentos,
 * proyectos, miembros, roles y competencias. Carga los datos de referencia una
 * vez y los reparte entre los paneles; cada panel avisa cuando cambia algo para
 * recargar.
 *
 * El calendario laboral es la excepcion: se puede leer desde cualquier rol y
 * solo el gerente lo modifica. Quien no es gerente ve esa pestana y nada mas.
 *
 * La pestaña abierta vive en la URL, de modo que recargar la pagina no cambia
 * de sección.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  capacityPoliciesApi,
  configApi,
  departmentsApi,
  meApi,
  projectsApi,
  skillsApi,
} from '../api/client'
import AsyncState from '../components/common/AsyncState.vue'
import CapacityPolicyPanel from '../components/settings/CapacityPolicyPanel.vue'
import DepartmentsPanel from '../components/settings/DepartmentsPanel.vue'
import LaborCalendarPanel from '../components/settings/LaborCalendarPanel.vue'
import MembersPanel from '../components/settings/MembersPanel.vue'
import PeoplePanel from '../components/settings/PeoplePanel.vue'
import ProjectsPanel from '../components/settings/ProjectsPanel.vue'
import RolesPanel from '../components/settings/RolesPanel.vue'
import SkillsPanel from '../components/settings/SkillsPanel.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'

const TABS = [
  { name: 'calendar', label: 'Calendario laboral' },
  { name: 'people', label: 'Personas' },
  { name: 'departments', label: 'Departamentos' },
  { name: 'projects', label: 'Proyectos' },
  { name: 'members', label: 'Miembros' },
  { name: 'roles', label: 'Roles' },
  { name: 'skills', label: 'Competencias' },
  { name: 'policies', label: 'Politica de capacidad' },
]

/** El calendario laboral se lee desde cualquier rol; el resto es del gerente. */
const READER_TABS = [TABS[0]]

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const isManager = ref(false)
const tab = ref('')
const error = ref(null)
const loading = ref(true)

const people = ref([])
const departments = ref([])
const projects = ref([])
const companyRoles = ref([])
const projectRoles = ref([])
const membersByProject = ref({})
const skills = ref([])
const policies = ref([])

/** Pestanas que puede ver quien entra. */
const visibleTabs = computed(() => (isManager.value ? TABS : READER_TABS))

const currentTab = computed(
  () => visibleTabs.value.find((item) => item.name === tab.value) ?? visibleTabs.value[0],
)

/** Titulo: el gerente ve la configuracion entera. */
const pageTitle = computed(() => (isManager.value ? 'Configuración' : 'Calendario laboral'))

/** Pestana que se abre: la pedida en la URL si se puede ver, si no la de por defecto. */
function resolveTab(requested) {
  const available = isManager.value ? TABS : READER_TABS
  if (requested && available.some((item) => item.name === requested)) return requested
  return isManager.value ? 'people' : 'calendar'
}

/** Cambia de pestaña y lo deja en la URL. */
function selectTab(name) {
  tab.value = name
  router.replace({ query: { ...route.query, tab: name } })
}

async function loadMembers(token) {
  const entries = await Promise.all(
    projects.value.map(async (project) => {
      const members = await projectsApi.members(token, project.id)
      return [project.id, members]
    }),
  )
  membersByProject.value = Object.fromEntries(entries)
}

async function load() {
  error.value = null
  try {
    const token = await auth.ensureSession()
    const scope = await meApi.get(token)
    isManager.value = scope.is_manager === true
    tab.value = resolveTab(route.query.tab)
    if (!isManager.value) {
      // El calendario laboral se lee solo: no hacen falta datos de referencia.
      return
    }
    const [peopleData, departmentsData, projectsData, companyRolesData, projectRolesData, skillsData, policiesData] =
      await Promise.all([
        configApi.people(token),
        departmentsApi.list(token),
        projectsApi.list(token),
        configApi.companyRoles(token),
        configApi.projectRoles(token),
        skillsApi.catalog(token),
        capacityPoliciesApi.list(token),
      ])
    people.value = peopleData
    departments.value = departmentsData
    projects.value = projectsData
    companyRoles.value = companyRolesData
    projectRoles.value = projectRolesData
    skills.value = skillsData
    policies.value = policiesData
    await loadMembers(token)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

/** Vuelve a pedir los datos y enseña el esqueleto mientras llegan. */
async function reintentar() {
  loading.value = true
  await load()
}

onMounted(load)

/**
 * Sigue la pestana de la URL.
 *
 * El router reutiliza la vista cuando solo cambia la consulta, de modo que
 * llegar por otra ruta (por ejemplo, el enlace al calendario laboral) tiene
 * que cambiar la pestana sin volver a pedir los datos.
 */
watch(
  () => route.query.tab,
  (value) => {
    const resolved = resolveTab(value)
    if (resolved !== tab.value) tab.value = resolved
  },
)
</script>

<template>
  <div>
    <PageHeader
      :title="pageTitle"
      ayuda="Administración del calendario laboral, las personas, los roles, los departamentos, los proyectos, los miembros, las competencias y las políticas de capacidad."
    >
      <template #filters>
        <nav
          v-if="visibleTabs.length > 1"
          class="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-control bg-tarjeta-suave p-1"
          aria-label="Secciones de la configuración"
        >
          <button
            v-for="item in visibleTabs"
            :key="item.name"
            type="button"
            :data-testid="`tab-${item.name}`"
            class="min-h-9 whitespace-nowrap rounded-control px-3 py-1.5 text-cp-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco"
            :class="
              tab === item.name
                ? 'bg-tarjeta text-texto-marca font-semibold shadow-control'
                : 'text-texto-suave hover:bg-tarjeta/70 hover:text-texto'
            "
            :aria-pressed="tab === item.name"
            @click="selectTab(item.name)"
          >
            {{ item.label }}
          </button>
        </nav>
      </template>
    </PageHeader>

    <AsyncState
      :loading="loading"
      :error="error"
      loading-label="Cargando la configuración"
      @retry="reintentar"
    >
      <LaborCalendarPanel
        v-if="currentTab.name === 'calendar'"
        :departments="departments"
        :people="people"
        :editable="isManager"
      />
      <PeoplePanel
        v-else-if="currentTab.name === 'people'"
        :people="people"
        :departments="departments"
        :company-roles="companyRoles"
        @saved="load"
      />
      <DepartmentsPanel
        v-else-if="currentTab.name === 'departments'"
        :departments="departments"
        :people="people"
        @saved="load"
      />
      <ProjectsPanel
        v-else-if="currentTab.name === 'projects'"
        :projects="projects"
        :departments="departments"
        :people="people"
        @saved="load"
      />
      <MembersPanel
        v-else-if="currentTab.name === 'members'"
        :projects="projects"
        :people="people"
        :project-roles="projectRoles"
        :members-by-project="membersByProject"
        @saved="load"
      />
      <RolesPanel
        v-else-if="currentTab.name === 'roles'"
        :company-roles="companyRoles"
        :project-roles="projectRoles"
      />
      <SkillsPanel v-else-if="currentTab.name === 'skills'" :skills="skills" @saved="load" />
      <CapacityPolicyPanel
        v-else-if="currentTab.name === 'policies'"
        :policies="policies"
        :departments="departments"
        :people="people"
        @saved="load"
      />
    </AsyncState>
  </div>
</template>
