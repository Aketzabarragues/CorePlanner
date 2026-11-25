/**
 * Estados de tarea de los proyectos.
 *
 * Fuente unica: el backend. La tienda guarda los estados de los proyectos
 * visibles, cargados por proyecto o todos a la vez, y resuelve etiqueta y
 * color para que las vistas pinten lo mismo. Sin TTL: cada vista pide su
 * recarga despues de sus propios cambios, igual que hace la de proyectos.
 *
 * Las claves de `byProject` son texto: la API `GET /task-statuses` responde
 * un mapa con identificador de proyecto en texto, asi que todo lo que entra
 * por aca pasa por `String`.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { taskStatusesApi } from '../api/client'

export const useTaskStatusesStore = defineStore('taskStatuses', () => {
  /** Estados por proyecto, lista en el orden de `order_index`. */
  const byProject = ref({})
  const loading = ref(false)
  const error = ref(null)

  let loadAllPromise = null

  /** Proyectos con lista cargada, para no repetir peticiones. */
  const loaded = computed(() => new Set(Object.keys(byProject.value)))

  /** Lista de un proyecto, vacia si no se ha cargado. */
  function statesOf(projectId) {
    if (projectId === null || projectId === undefined) return []
    return byProject.value[String(projectId)] ?? []
  }

  /** Estado del proyecto por su clave, o null si no esta. */
  function stateOf(projectId, key) {
    if (key === null || key === undefined) return null
    return statesOf(projectId).find((item) => item.key === String(key)) ?? null
  }

  /** Etiqueta del estado del proyecto por su clave; la clave si no esta. */
  function labelOf(projectId, key) {
    return stateOf(projectId, key)?.label ?? String(key)
  }

  /**
   * Carga los estados de todos los proyectos visibles.
   *
   * La peticion ya va en marcha se devuelve tal cual: el guard del router y
   * la vista global pueden pedirla a la vez al abrir la aplicacion.
   */
  function loadAll(token) {
    if (!loadAllPromise) {
      loadAllPromise = taskStatusesApi
        .all(token)
        .then((mapa) => {
          byProject.value = mapa ?? {}
          error.value = null
        })
        .catch((err) => {
          error.value = err.message
          throw err
        })
        .finally(() => {
          loadAllPromise = null
        })
    }
    loading.value = true
    return loadAllPromise.finally(() => {
      loading.value = false
    })
  }

  /**
   * Carga los estados de un proyecto.
   *
   * Si ya esta en `byProject` se devuelve lo que hay, sin peticion. La
   * recarga forzada despues de un cambio la hace la vista con `reload`.
   */
  function loadProject(token, projectId) {
    if (projectId === null || projectId === undefined) return Promise.resolve([])
    const clave = String(projectId)
    if (loaded.value.has(clave)) return Promise.resolve(byProject.value[clave])
    return taskStatusesApi
      .project(token, projectId)
      .then((lista) => {
        byProject.value = { ...byProject.value, [clave]: lista ?? [] }
        return byProject.value[clave]
      })
  }

  /**
   * Vuelve a pedir los estados de un proyecto.
   *
   * Despues de crear, editar, reordenar o borrar un estado: la lista del
   * servidor es la que manda. La clave sale de `byProject` para que
   * `loadProject` no crea que ya esta cargada.
   */
  async function reload(token, projectId) {
    const clave = String(projectId)
    const resto = { ...byProject.value }
    delete resto[clave]
    byProject.value = resto
    await loadProject(token, projectId)
  }

  return {
    byProject,
    loading,
    error,
    loaded,
    statesOf,
    stateOf,
    labelOf,
    loadAll,
    loadProject,
    reload,
  }
})
