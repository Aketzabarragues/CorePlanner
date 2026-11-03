/**
 * Vistas del proyecto y rutas de navegacion.
 *
 * Las tres vistas de un proyecto comparten la misma barra de pestanas, asi
 * que su catalogo vive aqui para que el shell, el router y las pruebas
 * hablen del mismo vocabulario.
 */

export const PROJECT_VIEWS = [
  { name: 'capacity', label: 'Capacidad', icon: '📊', hint: 'Matriz matematica' },
  { name: 'gantt', label: 'Gantt', icon: '📅', hint: 'Linea temporal' },
  { name: 'kanban', label: 'Kanban', icon: '📋', hint: 'Tablero de flujo' },
]

export const DEFAULT_VIEW = 'capacity'

/** Devuelve el nombre de la vista, o la de por defecto si no es conocida. */
export function viewName(name) {
  return PROJECT_VIEWS.some((view) => view.name === name) ? name : DEFAULT_VIEW
}

/** Ruta del proyecto para una vista: /projects/1/capacity. */
export function projectPath(view, projectId) {
  return `/projects/${projectId}/${viewName(view)}`
}

/** Localizador de ruta con nombre, para que el router resuelva los parametros. */
export function projectRoute(view, projectId) {
  return { name: viewName(view), params: { id: String(projectId) } }
}

/** Compara dos identificadores de proyecto sin distinguir tipo ni formato. */
export function sameProject(first, second) {
  if (first === null || first === undefined) return false
  if (second === null || second === undefined) return false
  return String(first) === String(second)
}
