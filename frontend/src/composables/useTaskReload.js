import { onUnmounted, watch } from 'vue'

import { useProjectsStore } from '../stores/projects'

/**
 * Recarga la vista cuando cambian las tareas.
 *
 * La vista se queda montada: sus filtros, su pestana activa y su
 * desplazamiento se conservan. Antes el shell la remontaba entera con una
 * clave en el router-view, y eso los perdia.
 *
 * @param {() => unknown} reload Funcion que vuelve a pedir los datos.
 */
export function useTaskReload(reload) {
  const store = useProjectsStore()
  const stop = watch(() => store.tasksRevision, () => reload())
  onUnmounted(stop)
}
