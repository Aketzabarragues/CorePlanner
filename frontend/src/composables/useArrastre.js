/**
 * Esqueleto del gesto de arrastre y soltar, comun al Kanban y al Gantt.
 *
 * Un umbral de 5 px distingue un pulsar de un arrastre, el fantasma sigue al
 * puntero y `Escape` anula el gesto. El composable no sabe que es el destino
 * de la soltura: recibe en cada momento los datos del gesto y la posicion del
 * puntero, y el que lo resuelve (una columna, un desplazamiento en dias,
 * una caja de soltado) es el que lo invoca.
 *
 * La bandera "movido" distingue un clic de verdad del que sigue a un arrastre:
 * el clic que viene tras soltar no debe abrir nada.
 *
 * El composable no toca el DOM ni el servidor: el fantasma lo pinta la vista
 * y el callback de confirmacion es quien hace la peticion.
 */
import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'

/** Movimiento minimo, en pixeles, para que un gesto cuente como arrastre. */
export const DRAG_THRESHOLD = 5

/**
 * Crea el gesto de arrastre.
 *
 * @param {object} opciones
 * @param {(contexto: object, event: MouseEvent) => object|null} [opciones.fantasmaDe]
 *   El fantasma: datos del gesto y puntero, y devuelve el contenido del
 *   fantasma (posicion, etiqueta, color) o null.
 * @param {(contexto: object, event: MouseEvent) => void} [opciones.alMover]
 *   En cada movimiento tras cruzar el umbral: aqui se previsualiza el
 *   destino del arrastre.
 * @param {(contexto: object, event: MouseEvent) => void} [opciones.alConfirmar]
 *   Al soltar tras cruzar el umbral: aqui se resuelve el destino y se actua.
 * @param {(contexto: object, event: MouseEvent) => boolean} [opciones.dentroDe]
 *   Si el punto de soltado esta dentro del objetivo del arrastre; si no,
 *   el gesto se anula como con `Escape`.
 * @param {number} [opciones.umbral]
 *   Movimiento minimo en pixeles para contar como arrastre; por defecto
 *   `DRAG_THRESHOLD`.
 * @param {() => void} [opciones.alAnular]
 *   Cuando el gesto se anula (`Escape` o `anular`): aqui se tumba la
 *   previsualizacion propia de quien lo invoca.
 */
export function useArrastre({
  fantasmaDe = null,
  alMover = null,
  alConfirmar = null,
  dentroDe = null,
  umbral = DRAG_THRESHOLD,
  alAnular = null,
} = {}) {
  /** Fantasma que sigue al puntero, o null si no hay gesto en juego. */
  const fantasma = ref(null)

  /** Datos del gesto en juego: quien lo arranca es el que lo conoce. */
  let contexto = null
  /** Si el puntero se ha movido lo bastante, el gesto es un arrastre. */
  let moved = false
  /** Si llego `Escape`: la soltura no confirma nada. */
  let anulado = false

  function onMove(event) {
    if (!contexto || anulado) return
    if (!moved) {
      if (!pasadoUmbral(event)) return
      moved = true
    }
    if (alMover) alMover(contexto, event)
    fantasma.value = fantasmaDe ? fantasmaDe(contexto, event) : null
  }

  function onUp(event) {
    const pendiente = contexto
    contexto = null
    fantasma.value = null
    limpiar()
    if (!pendiente) return
    let confirmado = false
    if (moved && !anulado) {
      if (
        event != null &&
        event.clientX !== undefined &&
        event.clientY !== undefined &&
        (!dentroDe || dentroDe(pendiente, event))
      ) {
        if (alConfirmar) alConfirmar(pendiente, event)
        confirmado = true
      }
    }
    // Soltar sin confirmar tumba la previsualizacion, como un `Escape`; si el
    // gesto ya se habia anulado, esa parte ya hizo su parte.
    if (!confirmado && !anulado && alAnular) alAnular()
  }

  function onTecla(event) {
    if (event.key === 'Escape') anular()
  }

  /**
   * Anula el gesto en juego, como una presion de `Escape`: no hay mas
   * fantasma y la soltura no confirma nada. El gesto termina con el raton
   * arriba; mientras tanto no se previsualiza nada.
   */
  function anular() {
    if (!contexto) return
    anulado = true
    fantasma.value = null
    if (alAnular) alAnular()
  }

  function limpiar() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('keydown', onTecla)
  }

  function pasadoUmbral(event) {
    return (
      Math.abs(event.clientX - contexto.inicio.x) > umbral ||
      Math.abs(event.clientY - contexto.inicio.y) > umbral
    )
  }

  /**
   * Empieza un gesto de arrastre.
   *
   * `contexto` son los datos propios de quien arrastra: el composable los
   * guarda y los devuelve tal cual en los callbacks, sin mirarlos.
   */
  function empezarArrastre({ contexto: datos, event }) {
    anular()
    contexto = { datos, inicio: { x: event.clientX, y: event.clientY } }
    moved = false
    anulado = false
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', onTecla)
  }

  if (getCurrentInstance()) onBeforeUnmount(limpiar)

  return { empezarArrastre, fantasma, anular, movido: () => moved }
}
