import { describe, expect, it } from 'vitest'

import {
  FILTERED_VIEWS,
  PROJECT_VIEWS,
  SECTIONS,
  projectStatus,
  sameProject,
  viewLabel,
} from '../utils/navigation'

describe('navegacion', () => {
  it('organiza el menu en cuatro grupos', () => {
    expect(SECTIONS.map((section) => section.title)).toEqual([
      'Mi espacio',
      'Planificación',
      'Organización',
      'Administración',
    ])
  })

  it('cataloga las vistas del menu', () => {
    const enElMenu = SECTIONS.flatMap((section) => section.items).map((view) => view.name)

    expect(enElMenu).toEqual([
      'panel',
      'my-work',
      'capacity',
      'gantt',
      'calendar',
      'projects',
      'people',
      'departments',
      'configuration',
    ])
  })

  it('las vistas del proyecto no estan en el menu', () => {
    const enElMenu = SECTIONS.flatMap((section) => section.items).map((view) => view.name)

    expect(PROJECT_VIEWS.map((view) => view.name)).toEqual([
      'project',
      'kanban',
      'members',
      'project-settings',
    ])
    expect(enElMenu).not.toContain('kanban')
    expect(enElMenu).not.toContain('members')
    expect(enElMenu).not.toContain('project-settings')
  })

  it('la configuracion es una seccion solo del gerente', () => {
    const administracion = SECTIONS.find((section) => section.managerOnly)

    expect(administracion).toBeTruthy()
    expect(administracion.items.map((view) => view.name)).toEqual(['configuration'])
  })

  it('las vistas de planificacion son las que aceptan el filtro de proyecto', () => {
    expect(FILTERED_VIEWS).toEqual(['capacity', 'gantt', 'calendar'])
  })

  it('da la etiqueta legible de la vista', () => {
    expect(viewLabel('capacity')).toBe('Capacidad')
    expect(viewLabel('gantt')).toBe('Gantt')
    expect(viewLabel('calendar')).toBe('Calendario')
    expect(viewLabel('departments')).toBe('Departamentos')
    expect(viewLabel('kanban')).toBe('Tablero')
    expect(viewLabel('inventada')).toBe('')
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
