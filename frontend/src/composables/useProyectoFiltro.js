import { computed } from 'vue'
import { useRoute } from 'vue-router'

/**
 * Identificador del proyecto que filtra la vista.
 *
 * En el espacio de proyecto lo da la ruta; en el global, el filtro de la URL.
 */
export function useProyectoFiltro() {
  const route = useRoute()
  return computed(() => route.params.id ?? route.query.project ?? '')
}
