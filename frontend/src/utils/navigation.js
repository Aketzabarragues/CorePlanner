/**
 * Vistas del proyecto y rutas de navegacion.
 *
 * La seccion lateral se organiza en grupos, asi que el catalogo vive aqui
 * para que el shell, el router y las pruebas hablen del mismo vocabulario.
 */

export const PROJECT_SECTIONS = [
  {
    title: 'Planificación & ejecución',
    items: [
      { name: 'capacity', label: 'Matriz de Capacidad', icon: 'chart', hint: 'Matriz matematica' },
      { name: 'gantt', label: 'Cronograma (Gantt)', icon: 'calendar', hint: 'Linea temporal' },
      { name: 'kanban', label: 'Tablero Kanban', icon: 'board', hint: 'Tablero de flujo' },
    ],
  },
  {
    title: 'Gestión & equipo',
    items: [
      {
        name: 'members',
        label: 'Miembros y Asignaciones',
        icon: 'users',
        hint: 'Reparto de trabajo del equipo',
      },
      {
        name: 'settings',
        label: 'Configuración del Proyecto',
        icon: 'sliders',
        hint: 'Ajustes del proyecto',
      },
    ],
  },
]

/** Todas las vistas de proyecto, en el orden en que aparecen en el menu. */
export const PROJECT_VIEWS = PROJECT_SECTIONS.flatMap((section) => section.items)

export const DEFAULT_VIEW = 'capacity'

/** Devuelve el nombre de la vista, o la de por defecto si no es conocida. */
export function viewName(name) {
  return PROJECT_VIEWS.some((view) => view.name === name) ? name : DEFAULT_VIEW
}

/** Etiqueta legible de la vista. */
export function viewLabel(name) {
  const view = PROJECT_VIEWS.find((item) => item.name === name)
  if (view) return view.label
  const fallback = PROJECT_VIEWS.find((item) => item.name === DEFAULT_VIEW)
  return fallback ? fallback.label : DEFAULT_VIEW
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

/** Etiqueta y color del estado de un proyecto. */
export function projectStatus(status) {
  switch (status) {
    case 'active':
      return { label: 'Activo', tone: 'active' }
    case 'on_hold':
      return { label: 'Pausado', tone: 'paused' }
    case 'planning':
      return { label: 'Planificación', tone: 'neutral' }
    case 'done':
      return { label: 'Completado', tone: 'neutral' }
    case 'cancelled':
      return { label: 'Cancelado', tone: 'neutral' }
    default:
      return { label: 'Sin estado', tone: 'neutral' }
  }
}
