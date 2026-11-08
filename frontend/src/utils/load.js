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
 * Aspecto de cada estado: fondo de la celda, texto, barra y borde.
 *
 * Los colores son los de la paleta de Tailwind, con los mismos valores que
 * el prototipo.
 */
const ASPECT = {
  [LOAD_STATE.EMPTY]: {
    label: 'Sin carga',
    cell: '',
    text: 'text-slate-600',
    bar: 'bg-slate-400',
    border: 'border-transparent',
  },
  [LOAD_STATE.UNKNOWN]: {
    label: 'Capacidad desconocida',
    cell: '',
    text: 'text-slate-600',
    bar: 'bg-slate-300',
    border: 'border-transparent',
  },
  [LOAD_STATE.FREE]: {
    label: 'Libre',
    cell: 'bg-blue-100',
    text: 'text-blue-900',
    bar: 'bg-blue-700',
    border: 'border-blue-400',
  },
  [LOAD_STATE.MID]: {
    label: 'Carga media',
    cell: 'bg-slate-100',
    text: 'text-slate-800',
    bar: 'bg-slate-600',
    border: 'border-slate-400',
  },
  [LOAD_STATE.OPTIMAL]: {
    label: 'Óptimo',
    cell: 'bg-green-200',
    text: 'text-green-900',
    bar: 'bg-green-700',
    border: 'border-green-600',
  },
  [LOAD_STATE.OVERLOAD]: {
    label: 'Sobrecarga leve',
    cell: 'bg-amber-200',
    text: 'text-amber-900',
    bar: 'bg-amber-700',
    border: 'border-amber-700',
  },
  [LOAD_STATE.HIGH_OVERLOAD]: {
    label: 'Sobrecarga alta',
    cell: 'bg-red-200',
    text: 'text-red-900',
    bar: 'bg-red-700',
    border: 'border-red-700',
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
 * cada persona. Las semanas en las que alguien no tiene capacidad conocida no
 * se cuentan como capacidad cero, porque no se sabe.
 */
export function teamUsage(rows, week) {
  let hours = 0
  let capacity = 0
  let unknown = false

  for (const row of rows ?? []) {
    const cell = (row.cells ?? []).find((item) => item.week === week)
    if (!cell) continue
    hours += Number(cell.hours ?? 0)
    if (cell.capacity === null || cell.capacity === undefined) {
      unknown = true
      continue
    }
    capacity += Number(cell.capacity)
  }

  return {
    hours,
    capacity: unknown ? null : capacity,
    unknown,
  }
}
