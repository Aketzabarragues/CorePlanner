import { describe, expect, it } from 'vitest'

import {
  GANTT_SCALES,
  addDays,
  dateAtIndex,
  dateChangePayload,
  dayIndex,
  diffDays,
  escalaAjustada,
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

describe('escala ajustada al ancho del panel', () => {
  const semana = { id: 'Week', label: 'Semana', pxPerDay: 14, header: 'week' }
  const dia = { id: 'Day', label: 'Día', pxPerDay: 44, header: 'day' }
  const mes = { id: 'Month', label: 'Mes', pxPerDay: 5, header: 'month' }

  it('sin ancho utilizable devuelve la escala natural sin tocarla', () => {
    expect(escalaAjustada(semana, 42, 0)).toBe(semana)
    expect(escalaAjustada(semana, 42, NaN)).toBe(semana)
    expect(escalaAjustada(semana, 42)).toBe(semana)
    expect(escalaAjustada(semana, 0, 2000)).toBe(semana)
  })

  it('con ancho grande sube los pixeles por dia hasta floor(ancho / dias)', () => {
    // 2000 / 42 = 47.6: floor 47, por encima del natural 14 de Semana.
    expect(escalaAjustada(semana, 42, 2000).pxPerDay).toBe(47)
    expect(escalaAjustada(semana, 42, 2000)).toEqual({
      id: 'Week',
      label: 'Semana',
      pxPerDay: 47,
      header: 'week',
    })
  })

  it('con ancho pequeño no baja del pxPerDay natural', () => {
    // 100 / 42 = 2.38: el natural 14 de Semana no se baja.
    expect(escalaAjustada(semana, 42, 100).pxPerDay).toBe(14)
    // 200 / 42 = 4.7: por debajo del natural 5 de Mes, que se conserva.
    expect(escalaAjustada(mes, 42, 200).pxPerDay).toBe(5)
    // 2000 / 42 = 47: sube del natural 44 de Día.
    expect(escalaAjustada(dia, 42, 2000).pxPerDay).toBe(47)
  })

  it('cuando no sube devuelve la misma escala y conserva sus campos', () => {
    expect(escalaAjustada(semana, 42, 100)).toBe(semana)
    expect(escalaAjustada(semana, 42, 574)).toBe(semana)
    const ajustada = escalaAjustada(semana, 42, 2000)
    expect(ajustada).not.toBe(semana)
    expect(ajustada).toEqual({ id: 'Week', label: 'Semana', pxPerDay: 47, header: 'week' })
  })

  it('con zoom = 1 el resultado es el de siempre', () => {
    expect(escalaAjustada(semana, 42, 2000, 1)).toEqual(escalaAjustada(semana, 42, 2000))
    expect(escalaAjustada(semana, 42, 2000, 1).pxPerDay).toBe(47)
    // Con el minimo natural el zoom de 1 no cambia nada ni copia la escala.
    expect(escalaAjustada(semana, 42, 100, 1)).toBe(semana)
  })

  it('zoom = 2 duplica los pixeles por dia', () => {
    expect(escalaAjustada(semana, 42, 2000, 2).pxPerDay).toBe(94)
    expect(escalaAjustada(dia, 42, 2000, 2).pxPerDay).toBe(94)
  })

  it('un factor por debajo de 1 reduce los pixeles por dia', () => {
    expect(escalaAjustada(semana, 42, 2000, 0.5).pxPerDay).toBe(23.5)
  })

  it('el factor multiplica la escala base, tambien cuando manda el minimo natural', () => {
    // 100 / 42 no sube del natural 14; el factor de 2 lo duplica igual.
    expect(escalaAjustada(semana, 42, 100, 2).pxPerDay).toBe(28)
  })

  it('sin ancho utilizable manda la natural, sin multiplicar', () => {
    expect(escalaAjustada(semana, 42, 0, 2)).toBe(semana)
    expect(escalaAjustada(semana, 0, 2000, 2)).toBe(semana)
    expect(escalaAjustada(semana, 42, NaN, 2)).toBe(semana)
  })

  it('un factor que no es numero positivo se toma como 1', () => {
    expect(escalaAjustada(semana, 42, 2000, 0).pxPerDay).toBe(47)
    expect(escalaAjustada(semana, 42, 2000, -2).pxPerDay).toBe(47)
    expect(escalaAjustada(semana, 42, 2000, NaN).pxPerDay).toBe(47)
  })
})
