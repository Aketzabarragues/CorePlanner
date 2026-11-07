import { describe, expect, it } from 'vitest'

import { isoDate, projectSplit, usageRatio, weeksRange } from '../utils/planner'

describe('utilidades del planificador', () => {
  it('passa un instante UTC a fecha ISO', () => {
    expect(isoDate(new Date(Date.UTC(2026, 10, 9)))).toBe('2026-11-09')
  })

  it('acota el rango a las semanas completas', () => {
    expect(weeksRange(['2026-W46', '2026-W47'])).toEqual({
      from: '2026-11-09',
      to: '2026-11-22',
    })
  })

  it('devuelve null si no hay rango', () => {
    expect(weeksRange([])).toBeNull()
  })

  it('calcula el porcentaje de ocupacion', () => {
    expect(usageRatio({ hours: 10, capacity: 40 })).toBe(25)
    expect(usageRatio({ hours: 45, capacity: 40 })).toBe(113)
    expect(usageRatio({ hours: 10, capacity: null })).toBeNull()
  })

  it('reparte las tareas por proyecto', () => {
    const names = new Map([
      [1, 'Linea Pasteurizadora SIVE'],
      [2, 'Red de tuberias linea 2'],
    ])
    const tasks = [
      { project_id: 1 },
      { project_id: 1 },
      { project_id: 2 },
    ]

    const split = projectSplit(tasks, names)

    expect(split).toEqual([
      { projectId: 1, name: 'Linea Pasteurizadora SIVE', count: 2 },
      { projectId: 2, name: 'Red de tuberias linea 2', count: 1 },
    ])
  })

  it('pone un nombre al proyecto que no se conoce', () => {
    const split = projectSplit([{ project_id: 9 }], new Map())

    expect(split[0].name).toBe('Proyecto 9')
  })
})
