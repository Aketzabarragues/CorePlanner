import { describe, expect, it } from 'vitest'

import { KANBAN_COLUMNS, columnAt, columnLabel, formatHours } from '../utils/kanban'

describe('utilidades del Kanban', () => {
  it('tiene las cuatro columnas en orden', () => {
    expect(KANBAN_COLUMNS.map((column) => column.status)).toEqual([
      'backlog',
      'in_progress',
      'testing',
      'done',
    ])
  })

  it('devuelve la etiqueta de un estado', () => {
    expect(columnLabel('testing')).toBe('Pruebas (FAT/SAT)')
    expect(columnLabel('inventado')).toBe('inventado')
  })

  it('muestra las horas enteras sin decimales', () => {
    expect(formatHours(40)).toBe('40 h')
    expect(formatHours(12.5)).toBe('12.50 h')
    expect(formatHours('8')).toBe('8 h')
    expect(formatHours(undefined)).toBe('0 h')
  })

  it('encuentra la columna que hay bajo un punto', () => {
    const rects = [
      { left: 0, right: 100, top: 0, bottom: 200 },
      { left: 100, right: 200, top: 0, bottom: 200 },
    ]

    expect(columnAt(50, 50, rects).status).toBe('backlog')
    expect(columnAt(150, 50, rects).status).toBe('in_progress')
  })

  it('no encuentra columna fuera del tablero', () => {
    const rects = [{ left: 0, right: 100, top: 0, bottom: 200 }]

    expect(columnAt(500, 50, rects)).toBeNull()
  })
})
