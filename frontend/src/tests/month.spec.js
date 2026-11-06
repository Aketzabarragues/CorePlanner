import { describe, expect, it } from 'vitest'

import {
  currentMonthKey,
  localDateKey,
  longDateLabel,
  monthGrid,
  monthKey,
  monthLabel,
  shiftDay,
  shiftMonth,
  tasksOnDay,
  weekdayNames,
} from '../utils/month'

describe('utilidades de mes', () => {
  it('identifica el mes de una fecha', () => {
    expect(monthKey(new Date(2026, 10, 6))).toBe('2026-11')
    expect(monthKey(new Date(2026, 0, 1))).toBe('2026-01')
  })

  it('etiqueta el mes con su nombre', () => {
    expect(monthLabel('2026-11')).toBe('Noviembre 2026')
    expect(monthLabel('2026-01')).toBe('Enero 2026')
  })

  it('salta de mes hacia delante y hacia atras', () => {
    expect(shiftMonth('2026-11', 1)).toBe('2026-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('la semana va de lunes a domingo', () => {
    expect(weekdayNames()).toEqual(['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'])
  })

  it('la rejilla empieza en lunes y termina en domingo', () => {
    const semanas = monthGrid('2026-11')

    expect(semanas).toHaveLength(6)
    expect(semanas[0][0].date).toBe('2026-10-26')
    expect(semanas[0][6].date).toBe('2026-11-01')
    expect(semanas[5][6].date).toBe('2026-12-06')
  })

  it('la rejilla lleva los dias del mes y los de al lado', () => {
    const celdas = monthGrid('2026-11').flat()

    expect(celdas.filter((celda) => celda.inMonth)).toHaveLength(30)
    expect(celdas.find((celda) => celda.date === '2026-11-01').weekday).toBe(6)
    expect(celdas.find((celda) => celda.date === '2026-11-02').weekday).toBe(0)
  })

  it('marca el fin de semana', () => {
    const celdas = monthGrid('2026-11').flat()

    expect(celdas.find((celda) => celda.date === '2026-11-07').weekend).toBe(true)
    expect(celdas.find((celda) => celda.date === '2026-11-08').weekend).toBe(true)
    expect(celdas.find((celda) => celda.date === '2026-11-06').weekend).toBe(false)
  })

  it('devuelve las tareas que ocupan un dia', () => {
    const tareas = [
      { id: 1, start: '2026-11-02', end: '2026-11-06' },
      { id: 2, start: '2026-11-09', end: '2026-11-10' },
    ]

    expect(tasksOnDay(tareas, '2026-11-04')).toHaveLength(1)
    expect(tasksOnDay(tareas, '2026-11-06')).toHaveLength(1)
    expect(tasksOnDay(tareas, '2026-11-07')).toHaveLength(0)
    expect(tasksOnDay(tareas, '2026-11-10')).toHaveLength(1)
  })

  it('el mes en curso es el de hoy', () => {
    expect(currentMonthKey(new Date(2026, 10, 6))).toBe('2026-11')
  })

  it('la fecha de hoy en formato corto', () => {
    expect(localDateKey(new Date(2026, 10, 6))).toBe('2026-11-06')
  })

  it('salta de dia hacia delante y hacia atras', () => {
    expect(shiftDay('2026-11-06', 1)).toBe('2026-11-07')
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('etiqueta la fecha en texto largo', () => {
    expect(longDateLabel('2026-11-09')).toBe('Lunes 9 de noviembre de 2026')
    expect(longDateLabel('2026-11-14')).toBe('Sábado 14 de noviembre de 2026')
  })
})
