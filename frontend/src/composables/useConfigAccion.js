import { inject, onBeforeUnmount } from 'vue'

/**
 * Accion primaria de una pestana de configuracion.
 *
 * El panel la registra al montarla con su `{ etiqueta, onClick }` y la retira
 * al desmontarse; solo hay un panel montado a la vez. SettingsView ofrece el
 * registro con `provide` (la clave `CONFIG_ACCION_KEY`) y pinta la accion de
 * la pestana activa en la cabecera compartida, al extremo derecho.
 */
export const CONFIG_ACCION_KEY = Symbol('config-accion-pestana')

export function useConfigAccion(accion) {
  const registro = inject(CONFIG_ACCION_KEY, null)
  if (!registro) return
  registro.value = accion
  onBeforeUnmount(() => {
    registro.value = null
  })
}
