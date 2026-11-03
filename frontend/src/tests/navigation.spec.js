import { describe, expect, it } from 'vitest'

import {
  DEFAULT_VIEW,
  PROJECT_VIEWS,
  projectPath,
  projectRoute,
  sameProject,
  viewName,
} from '../utils/navigation'

describe('navegacion', () => {
  it('cataloga las tres vistas del proyecto', () => {
    expect(PROJECT_VIEWS.map((view) => view.name)).toEqual(['capacity', 'gantt', 'kanban'])
  })

  it('usa la vista de por defecto cuando la ruta no es de proyecto', () => {
    expect(viewName('projects')).toBe(DEFAULT_VIEW)
    expect(viewName(undefined)).toBe(DEFAULT_VIEW)
    expect(viewName('inventada')).toBe(DEFAULT_VIEW)
  })

  it('respeta las vistas conocidas', () => {
    expect(viewName('gantt')).toBe('gantt')
    expect(viewName('kanban')).toBe('kanban')
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
})
