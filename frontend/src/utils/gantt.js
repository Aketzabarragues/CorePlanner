/**
 * Utilidades del diagrama de Gantt.
 *
 * La aritmetica de fechas y las escalas miden en `ganttScale.js`; este
 * fichero deja solo lo que la vista sigue usando hasta el motor propio.
 */

import { GANTT_SCALES, dateChangePayload } from './ganttScale'

export { dateChangePayload }

/** Escalas temporales que ofrece el diagrama, sin las medidas del motor. */
export const GANTT_VIEW_MODES = GANTT_SCALES.map(({ id, label }) => ({ id, label }))
