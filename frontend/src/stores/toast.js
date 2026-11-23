/**
 * Avisos flotantes globales (toast).
 *
 * Un host unico en la raiz de la aplicacion dibuja la pila; las vistas piden
 * avisos al store sin saber donde se pintan. Contrato:
 *
 * - `timeout: 0` no autocierra; `push` y `success`/`info` autocierran a los
 *   4000 ms, `warning`/`error` no autocierran.
 * - Con `key`, el aviso reemplaza al de la misma key (no apila) y reinicia su
 *   temporizador.
 * - La pila no supera `MAXIMO` items: al meter el cuarto se descarta el mas
 *   viejo.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

const MAXIMO = 3
const CIERRE_MS = 4000

export const useToastStore = defineStore('toast', () => {
  const items = ref([])
  const temporizadores = new Map()
  let siguienteId = 1

  function borrarTemporizador(id) {
    const temporizador = temporizadores.get(id)
    if (temporizador === undefined) return
    clearTimeout(temporizador)
    temporizadores.delete(id)
  }

  function programarCierre(id, timeout) {
    if (timeout === 0) return
    const temporizador = setTimeout(() => {
      temporizadores.delete(id)
      items.value = items.value.filter((item) => item.id !== id)
    }, timeout)
    temporizadores.set(id, temporizador)
  }

  /**
   * Mete un aviso en la pila. Con `key` no apila: reemplaza el mensaje y la
   * variante del aviso de esa key y reinicia su temporizador. Devuelve el id
   * del aviso creado o reemplazado.
   */
  function push({ message, variant = 'info', timeout = CIERRE_MS, key = null }) {
    if (key !== null) {
      const existente = items.value.find((item) => item.key === key)
      if (existente !== undefined) {
        existente.message = message
        existente.variant = variant
        borrarTemporizador(existente.id)
        programarCierre(existente.id, timeout)
        return existente.id
      }
    }
    const id = siguienteId
    siguienteId += 1
    items.value.push({ id, message, variant, key })
    if (items.value.length > MAXIMO) {
      const masViejo = items.value.shift()
      borrarTemporizador(masViejo.id)
    }
    programarCierre(id, timeout)
    return id
  }

  /** Quita un aviso por id y limpia su temporizador. */
  function dismiss(id) {
    items.value = items.value.filter((item) => item.id !== id)
    borrarTemporizador(id)
  }

  /** Vacia la pila y limpia todos los temporizadores. */
  function clear() {
    items.value = []
    for (const id of [...temporizadores.keys()]) borrarTemporizador(id)
  }

  function success(message, { timeout = CIERRE_MS, key = null } = {}) {
    return push({ message, variant: 'success', timeout, key })
  }

  function info(message, { timeout = CIERRE_MS, key = null } = {}) {
    return push({ message, variant: 'info', timeout, key })
  }

  function warning(message, { timeout = 0, key = null } = {}) {
    return push({ message, variant: 'warning', timeout, key })
  }

  function error(message, { timeout = 0, key = null } = {}) {
    return push({ message, variant: 'error', timeout, key })
  }

  return { items, push, success, info, warning, error, dismiss, clear }
})
