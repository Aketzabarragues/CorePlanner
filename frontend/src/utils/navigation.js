/**
 * Vistas de la aplicacion y menu lateral.
 *
 * Hay un solo arbol de rutas: el proyecto ya no es un espacio con su propio
 * menu, es un filtro (`?project=`) de las vistas de planificacion. El menu
 * agrupa las vistas por lo que son, no por donde se esta.
 */

const PANEL_VIEW = {
  name: 'panel',
  label: 'Panel',
  icon: 'gauge',
  hint: 'Estado de la organización',
}
const MY_WORK_VIEW = {
  name: 'my-work',
  label: 'Mi trabajo',
  icon: 'check',
  hint: 'Tareas propias del período',
}
const CAPACITY_VIEW = {
  name: 'capacity',
  label: 'Capacidad',
  icon: 'chart',
  hint: 'Matriz de ocupación',
}
const GANTT_VIEW = {
  name: 'gantt',
  label: 'Gantt',
  icon: 'calendar',
  hint: 'Línea temporal',
}
const CALENDAR_VIEW = {
  name: 'calendar',
  label: 'Calendario',
  icon: 'grid',
  hint: 'La planificación día a día',
}
const PROJECTS_VIEW = {
  name: 'projects',
  label: 'Proyectos',
  icon: 'folder',
  hint: 'Proyectos de la organización',
}
const PEOPLE_VIEW = {
  name: 'people',
  label: 'Personas y Competencias',
  icon: 'users',
  hint: 'Perfiles, horarios y habilidades',
}
const DEPARTMENTS_VIEW = {
  name: 'departments',
  label: 'Departamentos',
  icon: 'building',
  hint: 'Departamentos y sus responsables',
}
const CONFIGURATION_VIEW = {
  name: 'configuration',
  label: 'Configuración',
  icon: 'sliders',
  hint: 'Personas, roles, departamentos y proyectos',
}

/**
 * Menu lateral, en cuatro grupos.
 *
 * El grupo de Administracion es el unico que se esconde: lo ve solo el
 * gerente.
 */
export const SECTIONS = [
  {
    title: 'Mi espacio',
    items: [PANEL_VIEW, MY_WORK_VIEW],
  },
  {
    title: 'Planificación',
    items: [CAPACITY_VIEW, GANTT_VIEW, CALENDAR_VIEW],
  },
  {
    title: 'Organización',
    items: [PROJECTS_VIEW, PEOPLE_VIEW, DEPARTMENTS_VIEW],
  },
  {
    title: 'Administración',
    managerOnly: true,
    items: [CONFIGURATION_VIEW],
  },
]

/**
 * Vistas del proyecto.
 *
 * No estan en el menu: son las pestanas de la pagina del proyecto
 * (`/projects/{id}`), que es donde tiene sentido abrirlas.
 */
export const PROJECT_VIEWS = [
  { name: 'project', label: 'Resumen' },
  { name: 'kanban', label: 'Tablero' },
  { name: 'members', label: 'Miembros' },
  { name: 'project-settings', label: 'Ajustes' },
]

/** Vistas de planificacion que aceptan el filtro de proyecto. */
export const FILTERED_VIEWS = [CAPACITY_VIEW.name, GANTT_VIEW.name, CALENDAR_VIEW.name]

/** Todas las vistas, las del menu y las del proyecto. */
const VIEWS = [...SECTIONS.flatMap((section) => section.items), ...PROJECT_VIEWS]

/** Etiqueta legible de una vista. */
export function viewLabel(name) {
  const view = VIEWS.find((item) => item.name === name)
  return view ? view.label : ''
}

/** Compara dos identificadores de proyecto sin distinguir tipo ni formato. */
export function sameProject(first, second) {
  if (first === null || first === undefined) return false
  if (second === null || second === undefined) return false
  return String(first) === String(second)
}

/** Estados que puede tener un proyecto, con su etiqueta. */
export const PROJECT_STATUSES = [
  { value: 'planning', label: 'Planificación' },
  { value: 'active', label: 'Activo' },
  { value: 'on_hold', label: 'Pausado' },
  { value: 'done', label: 'Completado' },
  { value: 'cancelled', label: 'Cancelado' },
]

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
