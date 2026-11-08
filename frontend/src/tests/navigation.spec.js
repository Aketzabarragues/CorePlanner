import { describe, expect, it } from 'vitest'

import {
  FILTERED_VIEWS,
  GLOBAL_SECTIONS,
  PROJECT_SECTIONS,
  projectStatus,
  sameProject,
  viewLabel,
} from '../utils/navigation'

describe('navegacion', () => {
  it('organiza el menu global en cuatro grupos', () => {
    expect(GLOBAL_SECTIONS.map((section) => section.title)).toEqual([
      'Mi espacio',
      'Planificación',
      'Organización',
      'Administración',
    ])
  })

  it('cataloga las vistas del menu global', () => {
    const enElMenu = GLOBAL_SECTIONS.flatMap((section) => section.items).map((view) => view.name)

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

  it('organiza el menu del proyecto en dos grupos', () => {
    expect(PROJECT_SECTIONS.map((section) => section.title)).toEqual([
      'Planificación y ejecución',
      'Gestión y equipo',
    ])
  })

  it('cataloga las vistas del menu del proyecto', () => {
    const enElMenu = PROJECT_SECTIONS.flatMap((section) => section.items)

    expect(enElMenu.map((view) => view.name)).toEqual([
      'project',
      'capacity',
      'gantt',
      'calendar',
      'kanban',
      'members',
      'project-settings',
    ])
  })

  it('las vistas propias del proyecto llevan el id en la ruta', () => {
    const enElMenu = PROJECT_SECTIONS.flatMap((section) => section.items)
    const propias = enElMenu.filter((view) => view.projectIn === 'params').map((view) => view.name)

    expect(propias).toEqual(['project', 'kanban', 'members', 'project-settings'])
  })

  it('las vistas de planificacion del proyecto llevan el filtro', () => {
    const enElMenu = PROJECT_SECTIONS.flatMap((section) => section.items)
    const filtradas = enElMenu.filter((view) => view.projectIn === 'query').map((view) => view.name)

    expect(filtradas).toEqual(['capacity', 'gantt', 'calendar'])
  })

  it('las vistas del proyecto no estan en el menu global', () => {
    const enElMenu = GLOBAL_SECTIONS.flatMap((section) => section.items).map((view) => view.name)

    expect(enElMenu).not.toContain('kanban')
    expect(enElMenu).not.toContain('members')
    expect(enElMenu).not.toContain('project-settings')
  })

  it('la configuracion es una seccion solo del gerente', () => {
    const administracion = GLOBAL_SECTIONS.find((section) => section.managerOnly)

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
    expect(viewLabel('project')).toBe('Resumen')
    expect(viewLabel('kanban')).toBe('Tablero')
    expect(viewLabel('members')).toBe('Miembros')
    expect(viewLabel('project-settings')).toBe('Ajustes')
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
