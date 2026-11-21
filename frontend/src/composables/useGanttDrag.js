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
 * El esqueleto del gesto vive en `useArrastre`; aqui solo vive lo del Gantt:
 * la escala de pixeles por dia, el redondeo a dias y la caja del diagrama.
 * El composable no toca el DOM ni el servidor: devuelve el estado del gesto
 * y llama al callback de confirmacion, que es quien hace el PATCH.
 */
import { ref } from 'vue'

import { useArrastre } from './useArrastre'
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
  const barraActiva = ref(null)
  /** Rango previsualizado, o null si el gesto no ha pasado el umbral. */
  const previsualizacion = ref(null)

  /** Rango del arrastre para la barra dada, con su zona y la escala vigente. */
  function rangoDe(pendiente, clientX) {
    const { barra, zona, pxPerDay } = pendiente.datos
    const delta = snapDelta(clientX - pendiente.inicio.x, pxPerDay)
    return zona === 'body'
      ? moveRange(barra.startIso, barra.endIso, delta)
      : resizeRange(barra.startIso, barra.endIso, zona, delta)
  }

  /** Previsualiza el destino del arrastre: el rango nuevo de la barra. */
  function alMover(pendiente, event) {
    const { barra } = pendiente.datos
    barraActiva.value = barra.taskId
    const rango = rangoDe(pendiente, event.clientX)
    previsualizacion.value = { taskId: barra.taskId, start: rango.start, end: rango.end }
  }

  /** Lo que el gesto deja de previsualizar al anularse o terminar. */
  function limpiarPrevisualizacion() {
    previsualizacion.value = null
    barraActiva.value = null
  }

  function fantasmaDe(pendiente, event) {
    const { barra } = pendiente.datos
    const rango = rangoDe(pendiente, event.clientX)
    return {
      x: event.clientX + 12,
      y: event.clientY - 12,
      etiqueta: barra.title,
      rango: `${rango.start} → ${rango.end}`,
      color: barra.color,
    }
  }

  /** Punto de soltado dentro de la caja del diagrama; sin caja, no se confirma. */
  function dentroDe(pendiente, event) {
    const caja = pendiente.datos.dentro?.value
    if (!caja || typeof caja.getBoundingClientRect !== 'function') return false
    const rect = caja.getBoundingClientRect()
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    )
  }

  function alConfirmarGesto(pendiente, event) {
    const { barra } = pendiente.datos
    const rango = rangoDe(pendiente, event.clientX)
    limpiarPrevisualizacion()
    alConfirmar({ taskId: barra.taskId, start: rango.start, end: rango.end })
  }

  const { empezarArrastre: empezar, fantasma, anular: anularGesto } = useArrastre({
    fantasmaDe,
    alMover,
    alConfirmar: alConfirmarGesto,
    dentroDe,
    umbral: GANTT_METRICS.dragThreshold,
    alAnular: limpiarPrevisualizacion,
  })

  /**
   * Empieza un gesto de arrastre sobre una barra.
   *
   * `zona` es 'body' (mover), 'start' o 'end' (redimensionar un extremo).
   * `dentro` es un ref al elemento que delimita el diagrama: si la soltura
   * cae fuera de su caja, el gesto se anula y no hay PATCH.
   */
  function empezarArrastre({ barra, zona, event, dentro }) {
    empezar({
      contexto: {
        barra,
        zona,
        dentro,
        pxPerDay: pxPerDayDe(barra.taskId),
      },
      event,
    })
  }

  return { empezarArrastre, fantasma, previsualizacion, barraActiva, anular: anularGesto }
}
