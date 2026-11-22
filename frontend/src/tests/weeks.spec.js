import { describe, expect, it } from 'vitest'

import { weekRangeLabel, weekWithTasksNear, weekWorkdays } from '../utils/weeks'

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

describe('weekWithTasksNear', () => {
  /** Tarea de un solo dia; su semana es la de su primer dia. */
  const tareaEn = (fecha) => ({ start: fecha, end: fecha })

  it('devuelve la semana de referencia si tiene tareas', () => {
    expect(weekWithTasksNear('2026-W45', [tareaEn('2026-11-02')])).toBe('2026-W45')
  })

  it('mira primero hacia adelante', () => {
    // Hay tareas en W45 y W47: desde W44 gana W45.
    expect(weekWithTasksNear('2026-W44', [tareaEn('2026-11-02'), tareaEn('2026-11-16')])).toBe(
      '2026-W45',
    )
  })

  it('si no hay ninguna por delante, salta a la anterior', () => {
    expect(weekWithTasksNear('2026-W46', [tareaEn('2026-11-02')])).toBe('2026-W45')
  })

  it('gana la mas cercana, no la mas temprana', () => {
    // Desde W47, W46 esta por delante de W45.
    expect(weekWithTasksNear('2026-W47', [tareaEn('2026-11-02'), tareaEn('2026-11-09')])).toBe(
      '2026-W46',
    )
  })

  it('respeita el rango visible', () => {
    // W44 esta fuera del rango: con el limite por delante no cuenta.
    expect(
      weekWithTasksNear('2026-W45', [tareaEn('2026-10-28'), tareaEn('2026-11-09')], '2026-W45'),
    ).toBe('2026-W46')
    // La unica tarea esta atras, fuera del rango: sin semana.
    expect(
      weekWithTasksNear('2026-W45', [tareaEn('2026-10-28')], '2026-W45', '2026-W49'),
    ).toBe(null)
  })

  it('sin tareas, null', () => {
    expect(weekWithTasksNear('2026-W45', [])).toBe(null)
  })
})
