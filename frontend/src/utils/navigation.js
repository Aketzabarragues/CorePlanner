/**
 * Vistas de la aplicacion y rutas de navegacion.
 *
 * Hay dos contextos. El global reúne la organizacion entera y no lleva
 * identificador de proyecto en la URL. El de proyecto trabaja sobre un
 * proyecto concreto. Cada contexto tiene su propio catalogo, de modo que el
 * menu lateral, el router y las pruebas hablen del mismo vocabulario.
 */

const CAPACITY_VIEW = {
  name: 'capacity',
  label: 'Matriz de Capacidad',
  icon: 'chart',
  hint: 'Matriz matematica',
}
const GANTT_VIEW = {
  name: 'gantt',
  label: 'Cronograma (Gantt)',
  icon: 'calendar',
  hint: 'Linea temporal',
}
const KANBAN_VIEW = {
  name: 'kanban',
  label: 'Tablero Kanban',
  icon: 'board',
  hint: 'Tablero de flujo',
}
const MEMBERS_VIEW = {
  name: 'members',
  label: 'Miembros y Asignaciones',
  icon: 'users',
  hint: 'Reparto de trabajo del equipo',
}
const SETTINGS_VIEW = {
  name: 'settings',
  label: 'Configuración del Proyecto',
  icon: 'sliders',
  hint: 'Ajustes del proyecto',
}
const CONFIGURATION_VIEW = {
  name: 'configuration',
  label: 'Configuración',
  icon: 'sliders',
  hint: 'Personas, roles, departamentos y proyectos',
}
const PEOPLE_VIEW = {
  name: 'people',
  label: 'Personas y Competencias',
  icon: 'users',
  hint: 'Perfiles, horarios y habilidades',
}
const MY_WORK_VIEW = {
  name: 'my-work',
  label: 'Mi trabajo',
  icon: 'check',
  hint: 'Tareas propias del periodo',
}
const PANEL_VIEW = {
  name: 'panel',
  label: 'Panel',
  icon: 'gauge',
  hint: 'Estado de la organizacion',
}
const GLOBAL_CALENDAR_VIEW = {
  name: 'global-calendar',
  label: 'Calendario Global',
  icon: 'grid',
  hint: 'La planificacion dia a dia',
}
const CALENDAR_VIEW = {
  name: 'calendar',
  label: 'Calendario',
  icon: 'grid',
  hint: 'La planificacion dia a dia',
}
const WORK_CALENDAR_VIEW = {
  name: 'work-calendar',
  label: 'Calendario Laboral',
  icon: 'calendar',
  hint: 'Dias no laborables y su impacto',
}
const PLANNER_VIEW = {
  name: 'planner',
  label: 'Planificador de Recursos',
  icon: 'columns',
  hint: 'Carga, tareas y reparto por proyecto',
}

export const GLOBAL_SECTIONS = [
  {
    title: 'Espacio Global',
    items: [
      PANEL_VIEW,
      MY_WORK_VIEW,
      {
        name: 'projects',
        label: 'Proyectos',
        icon: 'folder',
        hint: 'Proyectos de la organizacion',
      },
      {
        name: 'global-capacity',
        label: 'Capacidad Global',
        icon: 'chart',
        hint: 'Matriz consolidada de todos los proyectos',
      },
      {
        name: 'global-gantt',
        label: 'Gantt Global',
        icon: 'calendar',
        hint: 'Cronograma de todos los proyectos',
      },
      GLOBAL_CALENDAR_VIEW,
      WORK_CALENDAR_VIEW,
      PLANNER_VIEW,
      {
        name: 'departments',
        label: 'Departamentos',
        icon: 'building',
        hint: 'Departamentos y sus responsables',
      },
      PEOPLE_VIEW,
    ],
  },
  {
    title: 'Administración',
    managerOnly: true,
    items: [CONFIGURATION_VIEW],
  },
]

export const PROJECT_SECTIONS = [
  {
    title: 'Planificación & ejecución',
    items: [CAPACITY_VIEW, GANTT_VIEW, CALENDAR_VIEW, KANBAN_VIEW],
  },
  {
    title: 'Gestión & equipo',
    items: [MEMBERS_VIEW],
  },
]

/** Vistas del espacio global, en el orden en que aparecen en el menu. */
export const GLOBAL_VIEWS = GLOBAL_SECTIONS.flatMap((section) => section.items)

/**
 * Vistas de proyecto.
 *
 * La configuracion no esta en el menu lateral: se llega desde el resumen del
 * proyecto, que es donde tiene sentido abrirla.
 */
export const PROJECT_VIEWS = [
  CAPACITY_VIEW,
  GANTT_VIEW,
  CALENDAR_VIEW,
  KANBAN_VIEW,
  MEMBERS_VIEW,
  SETTINGS_VIEW,
]

export const DEFAULT_VIEW = 'capacity'
export const DEFAULT_GLOBAL_VIEW = 'global-capacity'

/** Devuelve el nombre de la vista de proyecto, o la de por defecto. */
export function viewName(name) {
  return PROJECT_VIEWS.some((view) => view.name === name) ? name : DEFAULT_VIEW
}

/** Devuelve el nombre de la vista global, o la de por defecto. */
export function globalViewName(name) {
  return GLOBAL_VIEWS.some((view) => view.name === name) ? name : DEFAULT_GLOBAL_VIEW
}

/** Indica si un nombre de vista pertenece al espacio global. */
export function isGlobalView(name) {
  return GLOBAL_VIEWS.some((view) => view.name === name)
}

/** Indica si un nombre de vista pertenece al espacio de proyecto. */
export function isProjectView(name) {
  return PROJECT_VIEWS.some((view) => view.name === name)
}

/** Etiqueta legible de la vista, sea global o de proyecto. */
export function viewLabel(name) {
  const view = [...GLOBAL_VIEWS, ...PROJECT_VIEWS].find((item) => item.name === name)
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

/** Localizador de ruta de una vista del espacio global. */
export function globalRoute(view) {
  return { name: globalViewName(view) }
}

/** Ruta de una vista del espacio global: /capacity. */
export function globalPath(view) {
  return `/${globalViewName(view)}`
}

/**
 * Vista del espacio global que corresponde a una vista de proyecto.
 *
 * El tablero y los miembros no tienen equivalente global: se cae en el
 * listado de proyectos.
 */
export function toGlobalView(view) {
  const counterparts = {
    capacity: 'global-capacity',
    gantt: 'global-gantt',
    calendar: 'global-calendar',
    kanban: 'projects',
    members: 'projects',
    settings: 'projects',
    configuration: 'projects',
    people: 'people',
    'my-work': 'my-work',
    panel: 'panel',
  }
  return counterparts[view] ?? DEFAULT_GLOBAL_VIEW
}

/**
 * Vista de proyecto que corresponde a una vista global.
 *
 * El listado de proyectos y los departamentos no son vistas de un
 * proyecto concreto: se entra por la matriz.
 */
export function toProjectView(view) {
  const counterparts = {
    'global-capacity': 'capacity',
    'global-gantt': 'gantt',
    'global-calendar': 'calendar',
    projects: 'capacity',
    departments: 'capacity',
    people: 'capacity',
  }
  return counterparts[view] ?? DEFAULT_VIEW
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
