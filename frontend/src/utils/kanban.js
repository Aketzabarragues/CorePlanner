/**
 * Utilidades de los estados de tarea.
 *
 * Los estados son por proyecto y los da el backend (la tienda `taskStatuses`
 * los guarda). Estas funciones reciben la lista de estados que les toca
 * pintar; la que no se pasa usa los cuatro por defecto, que son el respaldo
 * de la app mientras la lista no ha cargado o la peticion ha fallado.
 */

import { barra as barraColor, pildora as pildoraColor } from './statusColor'

/**
 * Estados por defecto, en el orden en que se muestran.
 *
 * Mismos que los que el backend siembra en el alta del proyecto: cuando la
 * lista del proyecto no esta cargada, la interfaz se ve igual que en la
 * version anterior.
 */
export const DEFAULT_TASK_STATUSES = [
  { key: 'backlog', label: 'Backlog', color: '#57606a', progress: 0 },
  { key: 'in_progress', label: 'En Desarrollo', color: '#1f6feb', progress: 50 },
  { key: 'testing', label: 'Pruebas (FAT/SAT)', color: '#bf8700', progress: 75 },
  { key: 'done', label: 'Completado', color: '#1a7f37', progress: 100 },
]

/** Estado de la lista por su clave, o null si no esta. */
export function stateOf(status, estados = DEFAULT_TASK_STATUSES) {
  return estados.find((item) => item.key === status) ?? null
}

/** Etiqueta de un estado, o la clave si la lista no lo trae. */
export function columnLabel(status, estados = DEFAULT_TASK_STATUSES) {
  return stateOf(status, estados)?.label ?? status
}

/** Estilos en linea de la pildora de un estado. */
export function statusPill(status, estados = DEFAULT_TASK_STATUSES) {
  return pildoraColor(stateOf(status, estados)?.color)
}

/** Estilos en linea de la barra de un estado. */
export function statusBar(status, estados = DEFAULT_TASK_STATUSES) {
  return barraColor(stateOf(status, estados)?.color)
}

/**
 * Columna que hay bajo un punto de la pantalla.
 *
 * Recibe los rectangulos de las columnas en el mismo orden en que se pintan
 * (el de la lista de estados) y devuelve el estado que contiene el punto, o
 * null si no hay ninguno.
 */
export function columnAt(x, y, rects, estados = DEFAULT_TASK_STATUSES) {
  for (const [index, rect] of rects.entries()) {
    if (!rect) continue
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return estados[index] ?? null
    }
  }
  return null
}

/**
 * Estados a pintar: los del proyecto y los que usan las tareas que se ven.
 *
 * Si la lista del proyecto no esta cargada, al menos se ven las tareas con su
 * estado, en vez de desaparecer del tablero. Los estados que no conoce la
 * lista se anaden con la clave como etiqueta y sin color.
 */
export function estadosCon(estados, clavesUsadas = []) {
  const lista = estados ?? []
  const faltantes = [...new Set(clavesUsadas ?? [])].filter(
    (clave) => clave !== null && clave !== undefined && !lista.some((item) => item.key === clave),
  )
  return [...lista, ...faltantes.map((clave) => ({ key: clave, label: clave }))].map((item) => ({
    key: item.key,
    label: item.label ?? item.key,
    color: item.color,
    progress: item.progress,
  }))
}

/**
 * Horas estimadas en texto.
 *
 * Las horas enteras se muestran sin decimales y las que no lo son con dos,
 * para que el badge no quede lleno de ceros.
 */
export function formatHours(hours) {
  const value = Number(hours)
  if (!Number.isFinite(value)) return '0 h'
  return `${Number.isInteger(value) ? value : value.toFixed(2)} h`
}
