import { describe, expect, it } from 'vitest'

import { weekRangeLabel, weekWorkdays } from '../utils/weeks'

describe('utilidades de semana', () => {
  it('devuelve los dias laborables de lunes a viernes', () => {
    const dias = weekWorkdays('2026-W45')

    expect(dias.map((dia) => dia.date)).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ])
    expect(dias[0].day).toBe(2)
    expect(dias[4].day).toBe(6)
  })

  it('cruza el cambio de ano', () => {
    const dias = weekWorkdays('2026-W53')

    expect(dias[0].date).toBe('2026-12-28')
    expect(dias[4].date).toBe('2027-01-01')
  })

  it('empieza el ano en la semana que contiene el primer jueves', () => {
    const dias = weekWorkdays('2026-W01')

    expect(dias[0].date).toBe('2025-12-29')
    expect(dias[4].date).toBe('2026-01-02')
  })

  it('etiqueta el rango de la semana', () => {
    expect(weekRangeLabel('2026-W45')).toBe('2 - 6 nov 2026')
  })

  it('etiqueta el rango cuando cambia el mes', () => {
    expect(weekRangeLabel('2026-W53')).toBe('28 dic - 1 ene 2027')
  })
})
