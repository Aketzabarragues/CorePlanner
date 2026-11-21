import { describe, expect, it } from 'vitest'

import {
  GANTT_SCALES,
  addDays,
  dateAtIndex,
  dateChangePayload,
  dayIndex,
  diffDays,
  inclusiveDays,
  parseIsoDate,
  scaleById,
  toIsoDate,
} from '../utils/ganttScale'

describe('escala temporal del Gantt', () => {
  it('ofrece las escalas dia, semana y mes con sus anchos', () => {
    expect(GANTT_SCALES).toEqual([
      { id: 'Day', label: 'Día', pxPerDay: 44, header: 'day' },
      { id: 'Week', label: 'Semana', pxPerDay: 14, header: 'week' },
      { id: 'Month', label: 'Mes', pxPerDay: 5, header: 'month' },
    ])
  })

  it('devuelve la escala por id y la de semana si el id no existe', () => {
    expect(scaleById('Day').id).toBe('Day')
    expect(scaleById('desconocida')).toBe(GANTT_SCALES[1])
    expect(scaleById('desconocida').id).toBe('Week')
  })

  it('parsea una fecha ISO a UTC a medianoche', () => {
    const fecha = parseIsoDate('2026-11-05')
    expect(fecha).toBeInstanceOf(Date)
    expect(fecha.getUTCFullYear()).toBe(2026)
    expect(fecha.getUTCMonth()).toBe(10)
    expect(fecha.getUTCDate()).toBe(5)
    expect(fecha.getUTCHours()).toBe(0)
    expect(fecha.getUTCMinutes()).toBe(0)
  })

  it('vuelve a la cadena ISO sin desplazar el dia', () => {
    expect(toIsoDate(parseIsoDate('2026-11-05'))).toBe('2026-11-05')
  })

  it('no desplaza el dia en fecha de fin de mes', () => {
    expect(toIsoDate(parseIsoDate('2026-11-30'))).toBe('2026-11-30')
    expect(toIsoDate(parseIsoDate('2026-02-28'))).toBe('2026-02-28')
  })

  it('no desplaza el dia el 31 de diciembre de 2026', () => {
    expect(toIsoDate(parseIsoDate('2026-12-31'))).toBe('2026-12-31')
  })

  it('cuenta el dia que cruza el cambio de ano', () => {
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1)
    expect(diffDays('2027-01-01', '2026-12-31')).toBe(-1)
  })

  it('cuenta los dias inclusivos de un rango', () => {
    expect(inclusiveDays('2026-11-05', '2026-11-05')).toBe(1)
    expect(inclusiveDays('2026-11-05', '2026-11-08')).toBe(4)
  })

  it('desplaza dias sobre una fecha UTC', () => {
    expect(toIsoDate(addDays(parseIsoDate('2026-12-30'), 3))).toBe('2027-01-02')
    expect(toIsoDate(addDays(parseIsoDate('2027-01-02'), -3))).toBe('2026-12-30')
  })

  it('indice de dia y fecha en un indice van por pares', () => {
    const inicio = parseIsoDate('2026-11-02')
    expect(dayIndex(parseIsoDate('2026-11-02'), inicio)).toBe(0)
    expect(dayIndex(parseIsoDate('2026-12-01'), inicio)).toBe(29)
    expect(toIsoDate(dateAtIndex(inicio, 29))).toBe('2026-12-01')
    expect(toIsoDate(dateAtIndex(inicio, 0))).toBe('2026-11-02')
  })

  it('arma el cuerpo del PATCH con las fechas ISO', () => {
    expect(dateChangePayload('2026-11-05', '2026-11-11')).toEqual({
      start_date: '2026-11-05',
      end_date: '2026-11-11',
    })
  })
})
