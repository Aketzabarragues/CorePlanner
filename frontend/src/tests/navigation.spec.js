import { describe, expect, it } from 'vitest'

import {
  DEFAULT_VIEW,
  GLOBAL_SECTIONS,
  GLOBAL_VIEWS,
  PROJECT_SECTIONS,
  PROJECT_VIEWS,
  globalPath,
  globalRoute,
  globalViewName,
  isGlobalView,
  isProjectView,
  projectPath,
  projectRoute,
  projectStatus,
  sameProject,
  toGlobalView,
  toProjectView,
  viewLabel,
  viewName,
} from '../utils/navigation'

describe('navegacion', () => {
  it('organiza las vistas del proyecto en dos grupos', () => {
    expect(PROJECT_SECTIONS.map((section) => section.title)).toEqual([
      'Planificación & ejecución',
      'Gestión & equipo',
    ])
  })

  it('cataloga las vistas de planificacion y las de gestion', () => {
    expect(PROJECT_VIEWS.map((view) => view.name)).toEqual([
      'capacity',
      'gantt',
      'calendar',
      'kanban',
      'members',
      'settings',
    ])
  })

  it('el menu del proyecto deja la configuracion fuera', () => {
    const enElMenu = PROJECT_SECTIONS.flatMap((section) => section.items).map(
      (view) => view.name,
    )

    expect(enElMenu).toEqual(['capacity', 'gantt', 'calendar', 'kanban', 'members'])
  })

  it('cataloga las vistas del espacio global', () => {
    expect(GLOBAL_VIEWS.map((view) => view.name)).toEqual([
      'panel',
      'my-work',
      'projects',
      'global-capacity',
      'global-gantt',
      'global-calendar',
      'departments',
      'people',
      'configuration',
    ])
    expect(GLOBAL_SECTIONS).toHaveLength(2)
  })

  it('la configuracion es una seccion solo del gerente', () => {
    const administracion = GLOBAL_SECTIONS.find((section) => section.managerOnly)

    expect(administracion).toBeTruthy()
    expect(administracion.items.map((view) => view.name)).toEqual(['configuration'])
  })

  it('distingue las vistas globales de las de proyecto', () => {
    expect(isGlobalView('global-capacity')).toBe(true)
    expect(isGlobalView('capacity')).toBe(false)
    expect(isProjectView('capacity')).toBe(true)
    expect(isProjectView('global-capacity')).toBe(false)
  })

  it('usa la vista de por defecto cuando la ruta no es de proyecto', () => {
    expect(viewName('projects')).toBe(DEFAULT_VIEW)
    expect(viewName(undefined)).toBe(DEFAULT_VIEW)
    expect(viewName('inventada')).toBe(DEFAULT_VIEW)
  })

  it('respeta las vistas conocidas', () => {
    expect(viewName('gantt')).toBe('gantt')
    expect(viewName('members')).toBe('members')
    expect(viewName('settings')).toBe('settings')
  })

  it('usa la vista global de por defecto cuando la ruta no es global', () => {
    expect(globalViewName('projects')).toBe('projects')
    expect(globalViewName('global-gantt')).toBe('global-gantt')
    expect(globalViewName('capacity')).toBe('global-capacity')
    expect(globalViewName('inventada')).toBe('global-capacity')
  })

  it('da la etiqueta legible de la vista', () => {
    expect(viewLabel('capacity')).toBe('Matriz de Capacidad')
    expect(viewLabel('gantt')).toBe('Cronograma (Gantt)')
    expect(viewLabel('global-capacity')).toBe('Capacidad Global')
    expect(viewLabel('departments')).toBe('Departamentos')
    expect(viewLabel('inventada')).toBe('Matriz de Capacidad')
  })

  it('construye la ruta del proyecto', () => {
    expect(projectPath('kanban', 3)).toBe('/projects/3/kanban')
    expect(projectPath('inventada', 3)).toBe('/projects/3/capacity')
  })

  it('construye el localizador de ruta con el identificador como texto', () => {
    expect(projectRoute('gantt', 7)).toEqual({ name: 'gantt', params: { id: '7' } })
  })

  it('construye la ruta del espacio global', () => {
    expect(globalPath('global-capacity')).toBe('/global-capacity')
    expect(globalRoute('departments')).toEqual({ name: 'departments' })
  })

  it('lleva de una vista de proyecto a su homologa global', () => {
    expect(toGlobalView('capacity')).toBe('global-capacity')
    expect(toGlobalView('gantt')).toBe('global-gantt')
    expect(toGlobalView('calendar')).toBe('global-calendar')
    expect(toGlobalView('kanban')).toBe('projects')
    expect(toGlobalView('members')).toBe('projects')
  })

  it('lleva de una vista global a su homologa de proyecto', () => {
    expect(toProjectView('global-capacity')).toBe('capacity')
    expect(toProjectView('global-gantt')).toBe('gantt')
    expect(toProjectView('global-calendar')).toBe('calendar')
    expect(toProjectView('projects')).toBe('capacity')
    expect(toProjectView('departments')).toBe('capacity')
  })

  it('compara identificadores sin distinguir tipo', () => {
    expect(sameProject(1, '1')).toBe(true)
    expect(sameProject('2', 2)).toBe(true)
    expect(sameProject(1, 2)).toBe(false)
    expect(sameProject(null, '1')).toBe(false)
    expect(sameProject(1, undefined)).toBe(false)
  })

  it('traduce el estado del proyecto a etiqueta y tono', () => {
    expect(projectStatus('active')).toEqual({ label: 'Activo', tone: 'active' })
    expect(projectStatus('on_hold')).toEqual({ label: 'Pausado', tone: 'paused' })
    expect(projectStatus('planning')).toEqual({ label: 'Planificación', tone: 'neutral' })
    expect(projectStatus(undefined)).toEqual({ label: 'Sin estado', tone: 'neutral' })
  })
})
