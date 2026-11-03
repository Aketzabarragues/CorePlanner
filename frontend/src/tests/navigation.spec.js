import { describe, expect, it } from 'vitest'

import {
  DEFAULT_VIEW,
  PROJECT_SECTIONS,
  PROJECT_VIEWS,
  projectPath,
  projectRoute,
  projectStatus,
  sameProject,
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
      'kanban',
      'members',
      'settings',
    ])
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

  it('da la etiqueta legible de la vista', () => {
    expect(viewLabel('capacity')).toBe('Matriz de Capacidad')
    expect(viewLabel('gantt')).toBe('Cronograma (Gantt)')
    expect(viewLabel('inventada')).toBe('Matriz de Capacidad')
  })

  it('construye la ruta del proyecto', () => {
    expect(projectPath('kanban', 3)).toBe('/projects/3/kanban')
    expect(projectPath('inventada', 3)).toBe('/projects/3/capacity')
  })

  it('construye el localizador de ruta con el identificador como texto', () => {
    expect(projectRoute('gantt', 7)).toEqual({ name: 'gantt', params: { id: '7' } })
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
