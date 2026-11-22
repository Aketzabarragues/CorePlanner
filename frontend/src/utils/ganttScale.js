/**
 * Escala temporal y aritmetica de dias del diagrama de Gantt.
 *
 * Todas las fechas internas son UTC a medianoche: el feed trae cadenas ISO
 * ('YYYY-MM-DD') y el parseo y el formato se hacen por campos UTC. Leer los
 * campos locales desplazaria el dia segun el desfase horario del cliente. La
 * aritmetica de dias va en enteros de milisegundos.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Escalas temporales que ofrece el diagrama, de la mas amplia a la mas fina. */
export const GANTT_SCALES = [
  { id: 'Day', label: 'Día', pxPerDay: 44, header: 'day' },
  { id: 'Week', label: 'Semana', pxPerDay: 14, header: 'week' },
  { id: 'Month', label: 'Mes', pxPerDay: 5, header: 'month' },
]

/** Escala por identificador; si no existe, la de semana. */
export function scaleById(id) {
  return GANTT_SCALES.find((scale) => scale.id === id) ?? GANTT_SCALES[1]
}

/**
 * Escala efectiva: los pixeles por dia suben hasta llenar el ancho disponible.
 *
 * Contrato: pixeles por dia = `max(natural, floor(ancho disponible / dias))`.
 * El minimo natural nunca se baja: si el rango es mas ancho que el panel, se
 * conserva la escala natural y el panel se desplaza en horizontal. Sin ancho
 * utilizable (aun no medido, o cero), la escala natural se devuelve tal cual.
 */
export function escalaAjustada(scale, dias, anchoDisponible) {
  if (!scale) return scale
  const ancho = Math.floor(Number(anchoDisponible))
  const cantidad = Math.floor(Number(dias))
  if (!Number.isFinite(ancho) || !Number.isFinite(cantidad)) return scale
  if (ancho <= 0 || cantidad <= 0) return scale
  const pxPorDia = Math.max(scale.pxPerDay, Math.floor(ancho / cantidad))
  if (pxPorDia === scale.pxPerDay) return scale
  return { ...scale, pxPerDay: pxPorDia }
}

/**
 * Fecha en UTC a medianoche.
 *
 * Acepta una cadena 'YYYY-MM-DD' o una fecha. La cadena se parsea como UTC,
 * no como hora local: el dia del feed no depende del desfase horario.
 */
export function parseIsoDate(value) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  }
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * Fecha en formato 'YYYY-MM-DD' leyendo los campos UTC.
 *
 * Acepta una fecha o una cadena ISO, que se devuelve normalizada.
 */
export function toIsoDate(value) {
  const date = parseIsoDate(value)
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Fecha UTC desplazada delta dias, positivo adelante. */
export function addDays(date, delta) {
  const result = new Date(date.getTime())
  result.setUTCDate(result.getUTCDate() + delta)
  return result
}

/** Dias enteros entre dos fechas: `to - from`, positivo si `to` es posterior. */
export function diffDays(from, to) {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / DAY_MS)
}

/** Dias del rango, ambos extremos incluidos: nunca menos de 1. */
export function inclusiveDays(start, end) {
  return Math.max(1, diffDays(start, end) + 1)
}

/** Indice del dia desde `rangeStart`: 0 para el propio `rangeStart`. */
export function dayIndex(date, rangeStart) {
  return diffDays(rangeStart, date)
}

/** Fecha UTC del dia `index` a partir de `rangeStart`. */
export function dateAtIndex(rangeStart, index) {
  return addDays(parseIsoDate(rangeStart), index)
}

/** Cuerpo del PATCH de la tarea al mover o redimensionar una barra. */
export function dateChangePayload(startIso, endIso) {
  return {
    start_date: toIsoDate(startIso),
    end_date: toIsoDate(endIso),
  }
}
