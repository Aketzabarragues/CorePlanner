/**
 * Hit-test del calendario.
 *
 * Puro: el componente mide el DOM y entrega los numeros (`geometria`); aqui
 * solo se decide que dia cae bajo el puntero, sin document ni window. La
 * misma geometria sirve para la vista de mes (varias semanas) y la de semana
 * (una).
 */
import { addDays, parseIsoDate, toIsoDate } from './ganttScale'

/**
 * Dia laborable: lunes a viernes, en UTC.
 *
 * El fin de semana no reparte horas ni lleva barras: el calendario nunca
 * deja una barra sobre el sabado o el domingo.
 */
export function esLaborable(fecha) {
  const dia = parseIsoDate(fecha).getUTCDay()
  return dia !== 0 && dia !== 6
}

/**
 * Fecha laborable mas cercana: la misma si ya lo es; si es sabado, el viernes
 * anterior; si es domingo, el lunes siguiente.
 *
 * El destino de un arrastre cae siempre en dia laborable: la barra nunca se
 * queda en fin de semana.
 */
export function diaLaborable(fecha) {
  if (esLaborable(fecha)) return toIsoDate(fecha)
  const delta = parseIsoDate(fecha).getUTCDay() === 6 ? -1 : 1
  return toIsoDate(addDays(parseIsoDate(fecha), delta))
}

/**
 * Columna de dia bajo el puntero, 0 a 6, o null.
 *
 * Null si el puntero esta fuera del rectangulo en horizontal o en la zona de
 * nombres. `anchoDia` debe ser mayor que cero.
 */
export function columnaDesdeX({ x, geometria }) {
  const { izquierda, derecha, anchoNombres, anchoDia } = geometria
  if (!Number.isFinite(x) || !Number.isFinite(anchoDia) || anchoDia <= 0) return null
  if (x < izquierda || x > derecha) return null
  if (x < izquierda + anchoNombres) return null
  const columna = Math.floor((x - izquierda - anchoNombres) / anchoDia)
  return Math.min(6, Math.max(0, columna))
}

/**
 * Dia bajo el puntero: `{ semana, columna, fecha }` o null.
 *
 * Null si el punto cae fuera del rectangulo, en la zona de nombres o sin
 * semana que lo contenga. `fecha` es el `date` ISO de la semana y la
 * columna encontrada; sin dias en la semana no hay fecha, null.
 */
export function hitTestDia({ x, y, geometria }) {
  const { izquierda, derecha, arriba, abajo, semanas, dias } = geometria
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < izquierda ||
    x > derecha ||
    y < arriba ||
    y > abajo
  ) {
    return null
  }
  const columna = columnaDesdeX({ x, geometria })
  if (columna === null) return null
  const semana = semanas.find((item) => y >= item.top && y <= item.bottom)
  if (!semana) return null
  const fecha = dias?.[semana.indice]?.[columna]?.date ?? null
  return { semana: semana.indice, columna, fecha }
}
