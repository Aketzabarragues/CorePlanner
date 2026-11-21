/**
 * Arrastre y redimension de barras del diagrama de Gantt.
 *
 * Mismo contrato que el arrastre del Kanban: umbral de 5 px para distinguir
 * un pulsar de un arrastre, copia fantasma que sigue al cursor, Escape para
 * anular y confirmar al soltar. Aqui el destino no es una columna, es un
 * desplazamiento en dias: los pixeles se redondean a dias con `snapDelta` y
 * el rango nuevo sale de `moveRange` (cuerpo) o `resizeRange` (asas).
 *
 * Soltar fuera del diagrama anula el gesto como `Escape` (§8.5): el chart le
 * pasa la caja del diagrama y, si el punto de soltado no cae dentro, no hay
 * PATCH.
 *
 * El composable no toca el DOM ni el servidor: devuelve el estado del gesto
 * y llama al callback de confirmacion, que es quien hace el PATCH.
 */
import { getCurrentInstance, onBeforeUnmount, ref } from 'vue'

import { GANTT_METRICS } from '../utils/ganttMetrics'
import { moveRange, resizeRange, snapDelta } from '../utils/ganttLayout'

/**
 * Crea el arrastre de barras para un diagrama.
 *
 * @param {object} opciones
 * @param {(id: number, pxPerDay: number) => number} opciones.pxPerDayDe
 *   Escala vigente: devuelve los pixeles por dia de la escala en uso.
 * @param {(preview: { taskId, start, end }) => void} opciones.alConfirmar
 *   Se llama al soltar una barra movida o redimensionada, con el rango nuevo.
 */
export function useGanttDrag({ pxPerDayDe, alConfirmar }) {
  /** Barra en juego: la copia fantasma y el destino van de ella. */
  const fantasma = ref(null)
  /** Rango previsualizado, o null si el gesto no ha pasado el umbral. */
  const previsualizacion = ref(null)
  /** Barra que se esta arrastrando: la del 60 % de opacidad. */
  const barraActiva = ref(null)

  let gesto = null

  function onMove(event) {
    if (!gesto) return
    const { barra, zona, inicio, pxPerDay } = gesto
    if (!gesto.moved && !pasadoUmbral(event)) return
    gesto.moved = true
    barraActiva.value = barra.taskId
    const delta = snapDelta(event.clientX - inicio.x, pxPerDay)
    const rango =
      zona === 'body'
        ? moveRange(barra.startIso, barra.endIso, delta)
        : resizeRange(barra.startIso, barra.endIso, zona, delta)
    previsualizacion.value = { taskId: barra.taskId, start: rango.start, end: rango.end }
    fantasma.value = {
      x: event.clientX + 12,
      y: event.clientY - 12,
      etiqueta: barra.title,
      rango: `${rango.start} → ${rango.end}`,
      color: barra.color,
    }
  }

  function onUp(event) {
    limpiar()
    const pendiente = gesto
    gesto = null
    fantasma.value = null
    previsualizacion.value = null
    barraActiva.value = null
    if (!pendiente) return
    if (!pendiente.moved) return
    if (event && (event.clientX === undefined || event.clientY === undefined)) return
    if (!dentroDeDiagrama(event.clientX, event.clientY, pendiente)) {
      // Soltar fuera del diagrama anula el gesto, como un Escape (§8.5).
      return
    }
    const { barra, pxPerDay } = pendiente
    const delta = snapDelta(event.clientX - pendiente.inicio.x, pxPerDay)
    const rango =
      pendiente.zona === 'body'
        ? moveRange(barra.startIso, barra.endIso, delta)
        : resizeRange(barra.startIso, barra.endIso, pendiente.zona, delta)
    alConfirmar({ taskId: barra.taskId, start: rango.start, end: rango.end })
  }

  function onTecla(event) {
    if (event.key === 'Escape') {
      eventoAnular()
    }
  }

  /** Escape o soltar fuera del diagrama: la barra vuelve a su sitio. */
  function eventoAnular() {
    if (!gesto) return
    limpiar()
    gesto = null
    fantasma.value = null
    previsualizacion.value = null
    barraActiva.value = null
  }

  function limpiar() {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('keydown', onTecla)
  }

  function pasadoUmbral(event) {
    return (
      Math.abs(event.clientX - gesto.inicio.x) > GANTT_METRICS.dragThreshold ||
      Math.abs(event.clientY - gesto.inicio.y) > GANTT_METRICS.dragThreshold
    )
  }

  /** Punto de soltado dentro de la caja del diagrama; sin caja, no se confirma. */
  function dentroDeDiagrama(clientX, clientY, pendiente) {
    const caja = pendiente.dentro?.value
    if (!caja || typeof caja.getBoundingClientRect !== 'function') return false
    const rect = caja.getBoundingClientRect()
    return (
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    )
  }

  /**
   * Empieza un gesto de arrastre sobre una barra.
   *
   * `zona` es 'body' (mover), 'start' o 'end' (redimensionar un extremo).
   * `dentro` es un ref al elemento que delimita el diagrama: si la soltura
   * cae fuera de su caja, el gesto se anula y no hay PATCH.
   */
  function empezarArrastre({ barra, zona, event, dentro }) {
    eventoAnular()
    gesto = {
      barra,
      zona,
      inicio: { x: event.clientX, y: event.clientY },
      pxPerDay: pxPerDayDe(barra.taskId),
      moved: false,
      dentro,
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', onTecla)
  }

  if (getCurrentInstance()) onBeforeUnmount(limpiar)

  return { empezarArrastre, fantasma, previsualizacion, barraActiva, anular: eventoAnular }
}
