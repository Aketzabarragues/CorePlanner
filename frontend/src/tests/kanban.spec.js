import { describe, expect, it } from 'vitest'

import {
  columnAt,
  columnLabel,
  DEFAULT_TASK_STATUSES,
  estadosCon,
  formatHours,
  stateOf,
  statusBar,
  statusPill,
} from '../utils/kanban'

const MIESTADOS = [
  { key: 'review', label: 'Revisión', color: '#7c3aed', progress: 60 },
  { key: 'done', label: 'Listo', color: '#15803d', progress: 100 },
]

describe('estados por defecto', () => {
  it('tiene los cuatro estados sembrados, en orden y con color y avance', () => {
    expect(DEFAULT_TASK_STATUSES.map((estado) => estado.key)).toEqual([
      'backlog',
      'in_progress',
      'testing',
      'done',
    ])
    expect(DEFAULT_TASK_STATUSES.map((estado) => estado.label)).toEqual([
      'Backlog',
      'En Desarrollo',
      'Pruebas (FAT/SAT)',
      'Completado',
    ])
    expect(DEFAULT_TASK_STATUSES.map((estado) => estado.progress)).toEqual([0, 50, 75, 100])
    for (const estado of DEFAULT_TASK_STATUSES) {
      expect(estado.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('stateOf', () => {
  it('devuelve el estado por su clave, o null si no esta', () => {
    expect(stateOf('testing')?.label).toBe('Pruebas (FAT/SAT)')
    expect(stateOf('inventado')).toBeNull()
  })

  it('resuelve contra la lista que se pasa, no contra los por defecto', () => {
    expect(stateOf('review', MIESTADOS)?.label).toBe('Revisión')
    expect(stateOf('backlog', MIESTADOS)).toBeNull()
  })
})

describe('columnLabel', () => {
  it('devuelve la etiqueta del estado, o la clave si la lista no la trae', () => {
    expect(columnLabel('testing')).toBe('Pruebas (FAT/SAT)')
    expect(columnLabel('inventado')).toBe('inventado')
    expect(columnLabel('review', MIESTADOS)).toBe('Revisión')
    expect(columnLabel('backlog', MIESTADOS)).toBe('backlog')
  })
})

describe('statusPill y statusBar', () => {
  it('devuelven estilos en linea con el color del estado, legibles', () => {
    const pildora = statusPill('done', MIESTADOS)
    expect(pildora.backgroundColor).not.toBe('#15803d')
    expect(pildora.color).not.toBe(pildora.backgroundColor)
    const barra = statusBar('done', MIESTADOS)
    expect(barra.backgroundColor).toBe('#15803d')
  })

  it('sin lista o sin color, el estilo neutro', () => {
    const pildora = statusPill('backlog', [])
    expect(pildora.backgroundColor).toBe('#f1f5f9')
    expect(statusBar('no-existe', MIESTADOS).backgroundColor).toBe('#94a3b8')
  })
})

describe('columnAt', () => {
  const rects = [
    { left: 0, right: 100, top: 0, bottom: 200 },
    { left: 100, right: 200, top: 0, bottom: 200 },
  ]

  it('devuelve el estado que hay bajo un punto', () => {
    expect(columnAt(50, 50, rects, MIESTADOS)?.key).toBe('review')
    expect(columnAt(150, 50, rects, MIESTADOS)?.key).toBe('done')
  })

  it('sin lista, los estados por defecto en el orden de la lista', () => {
    expect(columnAt(50, 50, rects)?.key).toBe('backlog')
    expect(columnAt(150, 50, rects)?.key).toBe('in_progress')
  })

  it('fuera del tablero no hay estado', () => {
    expect(columnAt(500, 50, rects)).toBeNull()
  })
})

describe('estadosCon', () => {
  it('anade al final los estados que usan las tareas y no estan en la lista', () => {
    const union = estadosCon(MIESTADOS, ['backlog', 'review'])
    expect(union.map((item) => item.key)).toEqual(['review', 'done', 'backlog'])
    expect(union[2].label).toBe('backlog')
  })

  it('no repite los estados que ya estan en la lista y sin claves no anade nada', () => {
    expect(estadosCon(MIESTADOS, ['review', 'done']).map((item) => item.key)).toEqual([
      'review',
      'done',
    ])
    expect(estadosCon(MIESTADOS, []).map((item) => item.key)).toEqual(['review', 'done'])
    expect(estadosCon(null, ['x']).map((item) => item.key)).toEqual(['x'])
  })

  it('los estados anadidos no llevan color ni avance', () => {
    const union = estadosCon(MIESTADOS, ['nuevo'])
    expect(union[2]).toEqual({ key: 'nuevo', label: 'nuevo', color: undefined, progress: undefined })
  })
})

describe('formatHours', () => {
  it('muestra las horas enteras sin decimales', () => {
    expect(formatHours(40)).toBe('40 h')
    expect(formatHours(12.5)).toBe('12.50 h')
    expect(formatHours('8')).toBe('8 h')
    expect(formatHours(undefined)).toBe('0 h')
  })
})
