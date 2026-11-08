import { nextTick, onBeforeUnmount, toValue, watch } from 'vue'

/** Elementos que pueden recibir el foco dentro de un dialogo. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Comportamiento comun de los dialogos.
 *
 * Mientras el dialogo esta abierto: el fondo no se desplaza, Esc pide el
 * cierre, la tecla Tab queda atrapada dentro del panel y el foco entra en el
 * primer campo. Al cerrarse, el foco vuelve al elemento que lo abrio.
 *
 * Un panel que no es modal (modal: false) deja el fondo usable: no ata el
 * Tab ni bloquea el desplazamiento. Lo usa la matriz de capacidad, donde el
 * panel esta al lado de la matriz y las celdas tienen que seguir vivas.
 *
 * @param {import('vue').Ref<boolean>|(() => boolean)} open Si el dialogo esta abierto.
 * @param {import('vue').Ref<HTMLElement|null>} panel Elemento que atrapa el foco.
 * @param {() => void} onClose Se llama cuando se pide cerrar el dialogo.
 * @param {{modal?: boolean}} options Si el dialogo es modal (por defecto, si).
 */
export function useDialog(open, panel, onClose, options = {}) {
  const modal = options.modal ?? true
  let previousFocus = null
  let previousOverflow = ''
  let listening = false

  function isOpen() {
    return Boolean(toValue(open))
  }

  /** Elementos enfocables del panel, en el orden en que aparecen. */
  function focusableElements() {
    if (!panel.value) return []
    return Array.from(panel.value.querySelectorAll(FOCUSABLE))
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (!modal) return
    if (event.key !== 'Tab') return

    const elements = focusableElements()
    if (elements.length === 0) {
      event.preventDefault()
      panel.value?.focus()
      return
    }

    const first = elements[0]
    const last = elements[elements.length - 1]
    const active = document.activeElement
    const outside = !panel.value?.contains(active)

    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault()
      first.focus()
    }
  }

  function listen() {
    if (listening) return
    document.addEventListener('keydown', onKeydown)
    listening = true
  }

  function stopListening() {
    if (!listening) return
    document.removeEventListener('keydown', onKeydown)
    listening = false
  }

  /** Mete el foco dentro del panel: primero en un campo, si lo hay. */
  async function focusInside() {
    await nextTick()
    const campo = panel.value?.querySelector('input, select, textarea')
    const target = campo ?? focusableElements()[0] ?? panel.value
    target?.focus()
  }

  watch(
    isOpen,
    (opened) => {
      if (opened) {
        previousFocus = document.activeElement
        if (modal) {
          previousOverflow = document.body.style.overflow
          document.body.style.overflow = 'hidden'
        }
        listen()
        focusInside()
        return
      }

      stopListening()
      document.body.style.overflow = previousOverflow

      const target = previousFocus
      previousFocus = null
      if (target && typeof target.focus === 'function' && document.contains(target)) {
        target.focus()
      }
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    stopListening()
    document.body.style.overflow = previousOverflow
  })
}
