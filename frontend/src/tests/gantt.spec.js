import { describe, expect, it } from 'vitest'

import { GANTT_VIEW_MODES, dateChangePayload } from '../utils/gantt'
import { toIsoDate } from '../utils/ganttScale'

describe('utilidades del Gantt', () => {
  it('ofrece las escalas dia, semana y mes', () => {
    expect(GANTT_VIEW_MODES.map((mode) => mode.id)).toEqual(['Day', 'Week', 'Month'])
  })

  it('convierte una fecha ISO a UTC sin desplazar el dia', () => {
    expect(toIsoDate('2026-11-09')).toBe('2026-11-09')
  })

  it('no desplaza el dia en el 31 de diciembre de 2026', () => {
    expect(toIsoDate('2026-12-31')).toBe('2026-12-31')
  })

  it('arma el cuerpo del PATCH con las fechas nuevas', () => {
    const payload = dateChangePayload('2026-11-09', '2026-11-11')

    expect(payload).toEqual({ start_date: '2026-11-09', end_date: '2026-11-11' })
  })
})
