<script setup>
/**
 * Configuracion de la organizacion.
 *
 * Es la pantalla del gerente: personas, departamentos, proyectos, miembros,
 * roles y competencias. Carga los datos de referencia una vez y los reparte
 * entre los paneles; cada panel avisa cuando cambia algo para recargar.
 */
import { computed, onMounted, ref } from 'vue'

import { configApi, departmentsApi, projectsApi, skillsApi } from '../api/client'
import AsyncState from '../components/common/AsyncState.vue'
import DepartmentsPanel from '../components/settings/DepartmentsPanel.vue'
import MembersPanel from '../components/settings/MembersPanel.vue'
import PeoplePanel from '../components/settings/PeoplePanel.vue'
import ProjectsPanel from '../components/settings/ProjectsPanel.vue'
import RolesPanel from '../components/settings/RolesPanel.vue'
import SkillsPanel from '../components/settings/SkillsPanel.vue'
import PageHeader from '../components/common/PageHeader.vue'
import { useAuthStore } from '../stores/auth'

const TABS = [
  { name: 'people', label: 'Personas' },
  { name: 'departments', label: 'Departamentos' },
  { name: 'projects', label: 'Proyectos' },
  { name: 'members', label: 'Miembros' },
  { name: 'roles', label: 'Roles' },
  { name: 'skills', label: 'Competencias' },
]

const auth = useAuthStore()
const tab = ref('people')
const error = ref(null)
const loading = ref(true)

const people = ref([])
const departments = ref([])
const projects = ref([])
const companyRoles = ref([])
const projectRoles = ref([])
const membersByProject = ref({})
const skills = ref([])

const currentTab = computed(() => TABS.find((item) => item.name === tab.value) ?? TABS[0])

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
    const [peopleData, departmentsData, projectsData, companyRolesData, projectRolesData, skillsData] =
      await Promise.all([
        configApi.people(token),
        departmentsApi.list(token),
        projectsApi.list(token),
        configApi.companyRoles(token),
        configApi.projectRoles(token),
        skillsApi.catalog(token),
      ])
    people.value = peopleData
    departments.value = departmentsData
    projects.value = projectsData
    companyRoles.value = companyRolesData
    projectRoles.value = projectRolesData
    skills.value = skillsData
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
</script>

<template>
  <div>
    <PageHeader
      title="Configuración"
      subtitle="Personas, roles, departamentos, proyectos y competencias de la organización."
    />

    <AsyncState
      :loading="loading"
      :error="error"
      loading-label="Cargando la configuración"
      @retry="reintentar"
    >
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

      <PeoplePanel
        v-if="currentTab.name === 'people'"
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
      <SkillsPanel v-else :skills="skills" @saved="load" />
    </AsyncState>
  </div>
</template>
