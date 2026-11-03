import { describe, expect, it } from 'vitest'

import { GANTT_VIEW_MODES, dateChangePayload, toIsoDate } from '../utils/gantt'

describe('utilidades del Gantt', () => {
  it('ofrece las escalas dia, semana y mes', () => {
    expect(GANTT_VIEW_MODES.map((mode) => mode.id)).toEqual(['Day', 'Week', 'Month'])
  })

  it('convierte una fecha local en ISO', () => {
    expect(toIsoDate(new Date(2026, 10, 9))).toBe('2026-11-09')
  })

  it('no desplaza el dia al leer los campos locales', () => {
    // Si se usara toISOString(), en un desfase horario negativo la fecha
    // saltaria al dia anterior.
    const fecha = new Date(2026, 0, 1, 0, 30)
    expect(toIsoDate(fecha)).toBe('2026-01-01')
  })

  it('arma el cuerpo del PATCH con las fechas nuevas', () => {
    const payload = dateChangePayload(
      new Date(2026, 10, 9),
      new Date(2026, 10, 11, 23, 59, 59),
    )

    expect(payload).toEqual({ start_date: '2026-11-09', end_date: '2026-11-11' })
  })

  it('acepta tambien cadenas ISO', () => {
    expect(toIsoDate('2026-11-09')).toBe('2026-11-09')
  })
})
