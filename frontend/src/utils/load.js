/**
 * Escala de carga de una celda de capacidad.
 *
 * El uso de una celda es `horas / capacidad`, y de ese numero sale su estado.
 * Los umbrales son los de la propuesta de interfaz y viven aqui, no en las
 * plantillas: si se cambian, cambian en todas las pantallas a la vez.
 *
 * La escala va del gris (sin carga) al rojo (sobrecarga alta). El color nunca
 * es la unica senal: la sobrecarga lleva triangulo y el porcentaje en texto.
 */

/** Por debajo de este uso la carga es baja. */
export const FREE_THRESHOLD = 0.5

/** A partir de este uso la carga es buena. */
export const OPTIMAL_THRESHOLD = 0.85

/** A partir de este uso hay sobrecarga. */
export const OVERLOAD_THRESHOLD = 1

/** A partir de este uso la sobrecarga es alta. */
export const HIGH_OVERLOAD_THRESHOLD = 1.1

/** Estados de la escala. */
export const LOAD_STATE = {
  EMPTY: 'empty',
  UNKNOWN: 'unknown',
  FREE: 'free',
  MID: 'mid',
  OPTIMAL: 'optimal',
  OVERLOAD: 'overload',
  HIGH_OVERLOAD: 'high-overload',
}

/**
 * Aspecto de cada estado: fondo, texto, barra y borde de la celda.
 *
 * Clases literales de los tokens de carga (`carga-*`): `verify:css` exige que
 * la clase exista en el bundle, asi que no se componen. La capacidad
 * desconocida no lleva barra: una barra seria inventar el limite.
 */
const ASPECT = {
  [LOAD_STATE.EMPTY]: {
    label: 'Sin carga',
    cell: 'bg-carga-vacio-fondo',
    text: 'text-carga-vacio-texto',
    bar: 'bg-carga-vacio-barra',
    border: 'border-carga-vacio-borde',
  },
  [LOAD_STATE.UNKNOWN]: {
    label: 'Capacidad desconocida',
    cell: 'bg-carga-capacidad-desconocida-fondo',
    text: 'text-carga-capacidad-desconocida-texto',
    bar: '',
    border: 'border-carga-capacidad-desconocida-borde',
  },
  [LOAD_STATE.FREE]: {
    label: 'Libre',
    cell: 'bg-carga-libre-fondo',
    text: 'text-carga-libre-texto',
    bar: 'bg-carga-libre-barra',
    border: 'border-carga-libre-borde',
  },
  [LOAD_STATE.MID]: {
    label: 'Carga media',
    cell: 'bg-carga-media-fondo',
    text: 'text-carga-media-texto',
    bar: 'bg-carga-media-barra',
    border: 'border-carga-media-borde',
  },
  [LOAD_STATE.OPTIMAL]: {
    label: 'Óptimo',
    cell: 'bg-carga-optimo-fondo',
    text: 'text-carga-optimo-texto',
    bar: 'bg-carga-optimo-barra',
    border: 'border-carga-optimo-borde',
  },
  [LOAD_STATE.OVERLOAD]: {
    label: 'Sobrecarga leve',
    cell: 'bg-carga-sobrecarga-leve-fondo',
    text: 'text-carga-sobrecarga-leve-texto',
    bar: 'bg-carga-sobrecarga-leve-barra',
    border: 'border-carga-sobrecarga-leve-borde',
  },
  [LOAD_STATE.HIGH_OVERLOAD]: {
    label: 'Sobrecarga alta',
    cell: 'bg-carga-sobrecarga-alta-fondo',
    text: 'text-carga-sobrecarga-alta-texto',
    bar: 'bg-carga-sobrecarga-alta-barra',
    border: 'border-carga-sobrecarga-alta-borde',
  },
}

/** Estados que son sobrecarga: llevan triangulo. */
const OVERLOAD_STATES = [LOAD_STATE.OVERLOAD, LOAD_STATE.HIGH_OVERLOAD]

/**
 * Estado de una celda.
 *
 * Sin horas no hay nada que pintar. Con capacidad desconocida no se sabe si
 * la semana esta libre o cargada, de modo que la celda no se marca como
 * ninguna de las dos cosas.
 *
 * @param {number} hours Horas de la celda.
 * @param {number|null} capacity Capacidad de la persona en esa semana.
 * @returns {string} Uno de los estados de LOAD_STATE.
 */
export function loadState(hours, capacity) {
  const valor = Number(hours ?? 0)
  if (valor <= 0) return LOAD_STATE.EMPTY
  if (capacity === null || capacity === undefined || Number(capacity) <= 0) {
    return LOAD_STATE.UNKNOWN
  }

  const uso = valor / Number(capacity)
  if (uso > HIGH_OVERLOAD_THRESHOLD) return LOAD_STATE.HIGH_OVERLOAD
  if (uso > OVERLOAD_THRESHOLD) return LOAD_STATE.OVERLOAD
  if (uso >= OPTIMAL_THRESHOLD) return LOAD_STATE.OPTIMAL
  if (uso >= FREE_THRESHOLD) return LOAD_STATE.MID
  return LOAD_STATE.FREE
}

/** Aspecto de un estado: clases y etiqueta. */
export function loadAspect(state) {
  return ASPECT[state] ?? ASPECT[LOAD_STATE.EMPTY]
}

/** Etiqueta de un estado. */
export function loadLabel(state) {
  return loadAspect(state).label
}

/**
 * Rango de uso de un estado, para la leyenda.
 *
 * Sale de los umbrales, no escrito a mano: si cambia un umbral, la leyenda y
 * la escala cambian a la vez.
 *
 * @param {string} state Uno de los estados de LOAD_STATE.
 * @returns {string} El rango que cubre el estado, p. ej. "85-100 %".
 */
export function loadRange(state) {
  const pct = (umbral) => Math.round(umbral * 100)
  switch (state) {
    case LOAD_STATE.EMPTY:
      return '0 h'
    case LOAD_STATE.UNKNOWN:
      return 'sin capacidad'
    case LOAD_STATE.FREE:
      return `< ${pct(FREE_THRESHOLD)} %`
    case LOAD_STATE.MID:
      return `${pct(FREE_THRESHOLD)}-${pct(OPTIMAL_THRESHOLD)} %`
    case LOAD_STATE.OPTIMAL:
      return `${pct(OPTIMAL_THRESHOLD)}-${pct(OVERLOAD_THRESHOLD)} %`
    case LOAD_STATE.OVERLOAD:
      return `${pct(OVERLOAD_THRESHOLD)}-${pct(HIGH_OVERLOAD_THRESHOLD)} %`
    default:
      return `> ${pct(HIGH_OVERLOAD_THRESHOLD)} %`
  }
}

/** Si el estado es una sobrecarga, y por lo tanto lleva triangulo. */
export function isOverloaded(state) {
  return OVERLOAD_STATES.includes(state)
}

/**
 * Porcentaje de uso de una celda.
 *
 * Sin capacidad conocida no hay porcentaje: se devuelve null en vez de un
 * numero inventado.
 */
export function loadRatio(hours, capacity) {
  if (capacity === null || capacity === undefined || Number(capacity) <= 0) return null
  const valor = Number(hours ?? 0)
  return Math.round((valor / Number(capacity)) * 100)
}

/**
 * Capacidad libre de una celda.
 *
 * Lo que queda de la capacidad una vez descontada la carga: `capacidad -
 * horas`. Sigue la cadena del ratio y del estado: sin capacidad conocida no
 * hay capacidad libre que calcular, y se devuelve null en vez de un limite
 * inventado. Si la carga pasa de la capacidad, el resultado sale negativo: el
 * exceso se ve con su signo.
 */
export function loadFree(hours, capacity) {
  if (capacity === null || capacity === undefined || Number(capacity) <= 0) return null
  return Math.round((Number(capacity) - Number(hours ?? 0)) * 100) / 100
}

/** Porcentaje de uso con un decimal, para textos que lo llevan. */
export function loadRatioText(hours, capacity) {
  const ratio = loadRatio(hours, capacity)
  return ratio === null ? '' : `${ratio} %`
}

/**
 * Ancho de la barra de uso, en tanto por ciento.
 *
 * La barra se llena del todo cuando hay sobrecarga: el exceso se ve en el
 * color y en el icono, no en una barra mas larga.
 */
export function loadBarWidth(hours, capacity) {
  if (capacity === null || capacity === undefined || Number(capacity) <= 0) return 0
  const uso = (Number(hours ?? 0) / Number(capacity)) * 100
  return Math.max(0, Math.min(100, Math.round(uso)))
}

/**
 * Uso agregado del equipo en una semana.
 *
 * Solo suma lo que el backend ya devuelve: las horas y las capacidades de
 * cada persona. Quien no tiene capacidad conocida en esa semana se ignora
 * para la capacidad (sus horas si se cuentan) y no anula la del resto del
 * equipo. La capacidad del equipo es desconocida solo si nadie la tiene, y
 * `unknown` vale true en ese caso.
 */
export function teamUsage(rows, week) {
  let hours = 0
  let capacity = 0
  let anyKnown = false

  for (const row of rows ?? []) {
    const cell = (row.cells ?? []).find((item) => item.week === week)
    if (!cell) continue
    hours += Number(cell.hours ?? 0)
    if (cell.capacity === null || cell.capacity === undefined) {
      continue
    }
    capacity += Number(cell.capacity)
    anyKnown = true
  }

  return {
    hours,
    capacity: anyKnown ? capacity : null,
    unknown: !anyKnown,
  }
}
