/**
 * Estado de la navegacion global.
 *
 * Guarda los proyectos visibles, los departamentos y el proyecto que esta
 * abierto. El proyecto actual sale de la URL: la barra de navegacion lo
 * sincroniza con el parametro de la ruta, de modo que al recargar la pagina
 * se abre el mismo proyecto.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { departmentsApi, projectsApi } from '../api/client'
import { sameProject } from '../utils/navigation'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref([])
  const departments = ref([])
  const members = ref([])
  const currentProjectId = ref(null)
  const loading = ref(false)
  const error = ref(null)

  let membersProjectId = null
  let membersPromise = null
  let membersLoadingId = null
  let loadPromise = null

  const currentProject = computed(
    () => projects.value.find((project) => sameProject(project.id, currentProjectId.value)) ?? null,
  )

  const currentDepartment = computed(
    () =>
      departments.value.find(
        (department) => department.id === currentProject.value?.department_id,
      ) ?? null,
  )

  async function fetchProjects(token) {
    const [projectList, departmentList] = await Promise.all([
      projectsApi.list(token),
      // Los departamentos solo adornan la cabecera: si no se pueden leer, la
      // aplicacion sigue funcionando sin la pila de departamento.
      departmentsApi.list(token).catch(() => []),
    ])
    projects.value = projectList
    departments.value = departmentList
    return projectList
  }

  /**
   * Carga proyectos y departamentos.
   *
   * Si ya hay una carga en marcha se devuelve esa misma, porque el guard del
   * router y el shell piden la lista a la vez al abrir la aplicacion.
   */
  function load(token) {
    if (!loadPromise) {
      loadPromise = fetchProjects(token)
        .then((projectList) => {
          error.value = null
          return projectList
        })
        .catch((err) => {
          error.value = err.message
          throw err
        })
        .finally(() => {
          loadPromise = null
        })
    }
    loading.value = true
    return loadPromise.finally(() => {
      loading.value = false
    })
  }

  /** Devuelve los proyectos, cargandolos la primera vez. */
  async function ensureProjects(token) {
    if (projects.value.length) return projects.value
    return load(token)
  }

  /**
   * Devuelve los miembros del proyecto, cargandolos la primera vez.
   *
   * La cabecera y la matriz de capacidad necesitan la misma lista, de modo que
   * se guarda aqui para no pedirla dos veces.
   */
  function ensureMembers(token, projectId) {
    if (projectId === null || projectId === undefined) {
      members.value = []
      membersProjectId = null
      return Promise.resolve(members.value)
    }
    if (sameProject(membersProjectId, projectId) && members.value.length) {
      return Promise.resolve(members.value)
    }
    if (membersPromise && sameProject(membersLoadingId, projectId)) return membersPromise
    membersLoadingId = projectId
    membersPromise = projectsApi
      .members(token, projectId)
      .then((memberList) => {
        members.value = memberList
        membersProjectId = projectId
        return memberList
      })
      .finally(() => {
        membersPromise = null
        membersLoadingId = null
      })
    return membersPromise
  }

  /** Marca el proyecto abierto. */
  function select(projectId) {
    currentProjectId.value = projectId === null || projectId === undefined ? null : String(projectId)
  }

  return {
    projects,
    departments,
    members,
    currentProjectId,
    currentProject,
    currentDepartment,
    loading,
    error,
    load,
    ensureProjects,
    ensureMembers,
    select,
  }
})
