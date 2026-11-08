/**
 * Vistas de la aplicacion y menus laterales.
 *
 * Hay dos espacios. El global agrupa las vistas de toda la organizacion; el
 * del proyecto, las suyas. El proyecto sale siempre de la URL: el de la
 * pagina del proyecto, en la ruta, o el del filtro, en la consulta. Quien
 * mira un proyecto ve su menu; quien no, ve el global.
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
const ACTIVITY_VIEW = {
  name: 'activity',
  label: 'Actividad',
  icon: 'clock',
  hint: 'Bitácora de cambios',
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
 * Menu global, en cuatro grupos.
 *
 * El grupo de Administracion es el unico que se esconde: lo ve solo el
 * gerente.
 */
export const GLOBAL_SECTIONS = [
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
    items: [PROJECTS_VIEW, PEOPLE_VIEW, DEPARTMENTS_VIEW, ACTIVITY_VIEW],
  },
  {
    title: 'Administración',
    managerOnly: true,
    items: [CONFIGURATION_VIEW],
  },
]

/**
 * Menu del proyecto, en dos grupos.
 *
 * `projectIn` dice donde lleva el identificador del proyecto cada entrada:
 * en los parametros de la ruta (`/projects/{id}/kanban`) para las vistas
 * propias del proyecto, o en el filtro de las vistas de planificacion
 * (`/capacity?project={id}`), que son las unificadas.
 */
export const PROJECT_SECTIONS = [
  {
    title: 'Planificación y ejecución',
    items: [
      { name: 'project', label: 'Resumen', icon: 'gauge', projectIn: 'params' },
      { name: 'capacity', label: 'Capacidad', icon: 'chart', projectIn: 'query' },
      { name: 'gantt', label: 'Gantt', icon: 'calendar', projectIn: 'query' },
      { name: 'calendar', label: 'Calendario', icon: 'grid', projectIn: 'query' },
      { name: 'kanban', label: 'Tablero', icon: 'board', projectIn: 'params' },
      { name: 'task-list', label: 'Lista', icon: 'list', projectIn: 'params' },
    ],
  },
  {
    title: 'Gestión y equipo',
    items: [
      { name: 'members', label: 'Miembros', icon: 'users', projectIn: 'params' },
      { name: 'project-settings', label: 'Ajustes', icon: 'sliders', projectIn: 'params' },
      { name: 'activity', label: 'Actividad', icon: 'clock', projectIn: 'query' },
    ],
  },
]

/** Vistas de planificacion que aceptan el filtro de proyecto. */
export const FILTERED_VIEWS = [
  CAPACITY_VIEW.name,
  GANTT_VIEW.name,
  CALENDAR_VIEW.name,
  ACTIVITY_VIEW.name,
]

/** Todas las vistas, las del menu global y las del menu de proyecto. */
const VIEWS = [
  ...GLOBAL_SECTIONS.flatMap((section) => section.items),
  ...PROJECT_SECTIONS.flatMap((section) => section.items),
]

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
