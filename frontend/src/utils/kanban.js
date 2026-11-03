/**
 * Utilidades del tablero Kanban.
 */

/** Columnas del tablero, en el orden en que se muestran. */
export const KANBAN_COLUMNS = [
  { status: 'backlog', label: 'Backlog' },
  { status: 'in_progress', label: 'En Desarrollo' },
  { status: 'testing', label: 'Pruebas (FAT/SAT)' },
  { status: 'done', label: 'Completado' },
]

/** Etiqueta de un estado. */
export function columnLabel(status) {
  return KANBAN_COLUMNS.find((column) => column.status === status)?.label ?? status
}

/**
 * Columna que hay bajo un punto de la pantalla.
 *
 * Recebe los rectangulos de las columnas en el mismo orden que
 * KANBAN_COLUMNS y devuelve la que contiene el punto, o null si no hay
 * ninguna.
 */
export function columnAt(x, y, rects) {
  for (const [index, rect] of rects.entries()) {
    if (!rect) continue
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return KANBAN_COLUMNS[index] ?? null
    }
  }
  return null
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
