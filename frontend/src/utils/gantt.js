/**
 * Utilidades del diagrama de Gantt.
 */

/** Escalas temporales que ofrece el diagrama. */
export const GANTT_VIEW_MODES = [
  { id: 'Day', label: 'Día' },
  { id: 'Week', label: 'Semana' },
  { id: 'Month', label: 'Mes' },
]

/**
 * Fecha local en formato YYYY-MM-DD.
 *
 * La libreria de Gantt trabaja con fechas locales, asi que se leen los
 * campos locales en lugar de los de UTC, que desplazarian el dia.
 */
export function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Fechas de la tarea tras mover o redimensionar su barra.
 *
 * La libreria entrega el final como el ultimo instante de la barra, de
 * modo que ese mismo dia es la fecha de fin de la tarea.
 */
export function dateChangePayload(start, end) {
  return {
    start_date: toIsoDate(start),
    end_date: toIsoDate(end),
  }
}
