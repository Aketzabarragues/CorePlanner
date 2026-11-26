/**
 * Arrastre y redimension de barras del calendario.
 *
 * Mismo contrato que el arrastre del Gantt: umbral de 5 px para distinguir
 * un pulsar de un arrastre, fantasma que sigue al cursor, Escape para anular
 * y confirmar al soltar. Aqui el destino no es una escala en pixeles, es un
 * dia de la rejilla: los pixeles del puntero caen sobre una semana y una
 * columna de dia, y la fecha destino sale de la geometria medida por el
 * componente (`hitTestDia` para el cuerpo, `columnaDesdeX` para las asas).
 *
 * Soltar fuera de la rejilla anula el gesto como `Escape`: sin semana que
 * contenga el punto no hay PATCH.
 *
 * El esqueleto del gesto vive en `useArrastre`; aqui solo vive lo del
 * calendario: la zona (cuerpo o asa), la geometria de la rejilla y el
 * destino en dia laborable. El composable no toca el DOM ni el servidor:
 * devuelve el estado del gesto y llama al callback de confirmacion, que es
 * quien hace el PATCH.
 */
import { ref } from 'vue'

import { useArrastre } from './useArrastre'
import { columnaDesdeX, diaLaborable, hitTestDia } from '../utils/calendarGeometry'
import { diffDays } from '../utils/ganttScale'
import { moveRange, resizeRange } from '../utils/ganttLayout'

/**
 * Crea el arrastre de barras para la rejilla del calendario.
 *
 * @param {object} opciones
 * @param {() => object|null} opciones.geometriaDe
 *   Geometria de la rejilla ya medida: se lee UNA vez al empezar el gesto y se
 *   fija durante el gesto, igual que la escala del Gantt: el desplazamiento
 *   del mes no puede cambiar la geometria a mitad del arrastre.
 * @param {(preview: { taskId, start, end }) => void} opciones.alConfirmar
 *   Se llama al soltar una barra movida o redimensionada, con el rango nuevo.
 */
export function useCalendarioDrag({ geometriaDe, alConfirmar }) {
  /** Barra en juego: el fantasma y el destino van de ella. */
  const barraActiva = ref(null)
  /** Rango previsualizado, o null si el gesto no ha pasado el umbral. */
  const previsualizacion = ref(null)

  /**
   * Fecha destino del puntero, segun la zona.
   *
   * El cuerpo cae donde cae la semana y la columna (`hitTestDia`, con su
   * fecha); el asa redimensiona dentro de la semana de la barra
   * (`columnaDesdeX` y los `dias` de esa semana). Sin dia bajo el puntero,
   * null. El dia destino se deja en laborable: la barra nunca cae en fin de
   * semana.
   */
  function fechaDestino(pendiente, clientX, clientY) {
    const { zona, geometria, dias } = pendiente.datos
    if (zona === 'body') {
      const hit = hitTestDia({ x: clientX, y: clientY, geometria })
      return hit ? diaLaborable(hit.fecha) : null
    }
    const columna = columnaDesdeX({ x: clientX, geometria })
    return columna === null ? null : diaLaborable(dias[columna].date)
  }

  /** Rango de la barra en la posicion del puntero: null si no hay destino. */
  function rangoDe(pendiente, clientX, clientY) {
    const { barra, zona } = pendiente.datos
    const destino = fechaDestino(pendiente, clientX, clientY)
    if (destino === null) return null
    const { start, end } = barra.tarea
    if (zona === 'body') return { ...moveRange(start, end, diffDays(start, destino)), fecha: destino }
    return { ...resizeRange(start, end, zona, diffDays(zona === 'start' ? start : end, destino)), fecha: destino }
  }

  /** Previsualiza el destino del arrastre: el rango nuevo y el dia destino. */
  function alMover(pendiente, event) {
    const { barra } = pendiente.datos
    barraActiva.value = barra.tarea.id
    const rango = rangoDe(pendiente, event.clientX, event.clientY)
    previsualizacion.value =
      rango === null
        ? null
        : { taskId: barra.tarea.id, start: rango.start, end: rango.end, fecha: rango.fecha }
  }

  /** Lo que el gesto deja de previsualizar al anularse o terminar. */
  function limpiarPrevisualizacion() {
    previsualizacion.value = null
    barraActiva.value = null
  }

  function fantasmaDe(pendiente, event) {
    const { barra } = pendiente.datos
    const rango = rangoDe(pendiente, event.clientX, event.clientY)
    return {
      x: event.clientX + 12,
      y: event.clientY - 12,
      tarea: barra.tarea,
      rango: rango ? `${rango.start} → ${rango.end}` : `${barra.tarea.start} → ${barra.tarea.end}`,
    }
  }

  /**
   * Punto de soltado dentro de la rejilla: el punto cae en el rectangulo y en
   * una semana. Sin geometria no se confirma nada.
   */
  function dentroDe(pendiente, event) {
    const geometria = pendiente.datos.geometria
    if (!geometria) return false
    const hit = hitTestDia({ x: event.clientX, y: event.clientY, geometria })
    return hit !== null
  }

  function alConfirmarGesto(pendiente, event) {
    const { barra } = pendiente.datos
    const rango = rangoDe(pendiente, event.clientX, event.clientY)
    limpiarPrevisualizacion()
    if (rango === null) return
    alConfirmar({ taskId: barra.tarea.id, start: rango.start, end: rango.end })
  }

  const { empezarArrastre: empezar, fantasma, anular, movido } = useArrastre({
    fantasmaDe,
    alMover,
    alConfirmar: alConfirmarGesto,
    dentroDe,
    alAnular: limpiarPrevisualizacion,
  })

  /**
   * Empieza un gesto de arrastre sobre una barra.
   *
   * `zona` es 'body' (mover), 'start' o 'end' (redimensionar un extremo).
   * `barra` lleva la `tarea` con sus `start` y `end` ISO. `dias` son los
   * siete dias de la semana de la barra, para mapear columna a fecha al
   * redimensionar. La geometria se lee aqui, una sola vez, y se fija.
   */
  function empezarArrastre({ barra, zona, event, dias }) {
    empezar({
      contexto: { barra, zona, dias, geometria: geometriaDe() },
      event,
    })
  }

  return { empezarArrastre, fantasma, previsualizacion, barraActiva, anular, movido }
}
