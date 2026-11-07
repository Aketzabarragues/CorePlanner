/**
 * Utilidades del planificador de recursos.
 *
 * El planificador mira la misma matriz de capacidad que la matriz de
 * ocupacion, pero ademas dice en que se ocupa cada persona: que tareas tiene
 * y en que proyectos.
 */

import { weekMonday } from './weeks'

/** Fecha ISO de un instante UTC: "2026-11-09". */
export function isoDate(date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

/** Rango de fechas que cubren las semanas indicadas: del lunes al domingo. */
export function weeksRange(weeks) {
  if (!weeks.length) return null
  const first = weekMonday(weeks[0])
  const last = weekMonday(weeks[weeks.length - 1])
  last.setUTCDate(last.getUTCDate() + 6)
  return { from: isoDate(first), to: isoDate(last) }
}

/** Porcentaje de ocupacion de una celda, o null si no hay capacidad. */
export function usageRatio(cell) {
  if (!cell.capacity) return null
  return Math.round((cell.hours / cell.capacity) * 100)
}

/**
 * Reparto por proyecto de una lista de tareas.
 *
 * Cuenta cuantas tareas lleva la persona de cada proyecto, que es lo que
 * permite ver de un vistazo en que se ocupa.
 */
export function projectSplit(tasks, projectNames) {
  const counts = new Map()
  for (const task of tasks) {
    counts.set(task.project_id, (counts.get(task.project_id) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([projectId, count]) => ({
      projectId,
      name: projectNames.get(projectId) ?? `Proyecto ${projectId}`,
      count,
    }))
    .sort((first, second) => second.count - first.count)
}
