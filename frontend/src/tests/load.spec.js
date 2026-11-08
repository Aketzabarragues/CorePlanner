import { describe, expect, it } from 'vitest'

import {
  LOAD_STATE,
  isOverloaded,
  loadAspect,
  loadBarWidth,
  loadLabel,
  loadRatio,
  loadRatioText,
  loadState,
  teamUsage,
} from '../utils/load'

describe('escala de carga', () => {
  it('sin horas no hay nada que pintar', () => {
    expect(loadState(0, 40)).toBe(LOAD_STATE.EMPTY)
    expect(loadState(0, null)).toBe(LOAD_STATE.EMPTY)
  })

  it('por debajo del 50 % la carga es libre', () => {
    expect(loadState(10, 40)).toBe(LOAD_STATE.FREE)
    expect(loadState(19.9, 40)).toBe(LOAD_STATE.FREE)
  })

  it('del 50 % al 85 % la carga es media', () => {
    expect(loadState(20, 40)).toBe(LOAD_STATE.MID)
    expect(loadState(33.9, 40)).toBe(LOAD_STATE.MID)
  })

  it('del 85 % al 100 % la carga es optima', () => {
    expect(loadState(34, 40)).toBe(LOAD_STATE.OPTIMAL)
    expect(loadState(40, 40)).toBe(LOAD_STATE.OPTIMAL)
  })

  it('por encima del 100 % hay sobrecarga leve', () => {
    expect(loadState(40.1, 40)).toBe(LOAD_STATE.OVERLOAD)
    expect(loadState(44, 40)).toBe(LOAD_STATE.OVERLOAD)
  })

  it('por encima del 110 % la sobrecarga es alta', () => {
    expect(loadState(44.1, 40)).toBe(LOAD_STATE.HIGH_OVERLOAD)
    expect(loadState(60, 40)).toBe(LOAD_STATE.HIGH_OVERLOAD)
  })

  it('con capacidad desconocida no se marca como libre ni como sobrecargada', () => {
    expect(loadState(30, null)).toBe(LOAD_STATE.UNKNOWN)
    expect(loadState(30, undefined)).toBe(LOAD_STATE.UNKNOWN)
    expect(loadState(30, 0)).toBe(LOAD_STATE.UNKNOWN)
    expect(loadState(60, null)).toBe(LOAD_STATE.UNKNOWN)
  })

  it('la sobrecarga lleva triangulo y el resto no', () => {
    expect(isOverloaded(LOAD_STATE.OVERLOAD)).toBe(true)
    expect(isOverloaded(LOAD_STATE.HIGH_OVERLOAD)).toBe(true)
    expect(isOverloaded(LOAD_STATE.OPTIMAL)).toBe(false)
    expect(isOverloaded(LOAD_STATE.UNKNOWN)).toBe(false)
  })

  it('cada estado tiene su etiqueta', () => {
    expect(loadLabel(LOAD_STATE.EMPTY)).toBe('Sin carga')
    expect(loadLabel(LOAD_STATE.FREE)).toBe('Libre')
    expect(loadLabel(LOAD_STATE.MID)).toBe('Carga media')
    expect(loadLabel(LOAD_STATE.OPTIMAL)).toBe('Óptimo')
    expect(loadLabel(LOAD_STATE.OVERLOAD)).toBe('Sobrecarga leve')
    expect(loadLabel(LOAD_STATE.HIGH_OVERLOAD)).toBe('Sobrecarga alta')
  })

  it('el aspecto trae las clases de fondo, texto y barra', () => {
    const aspecto = loadAspect(LOAD_STATE.HIGH_OVERLOAD)
    expect(aspecto.cell).toContain('bg-red-200')
    expect(aspecto.text).toContain('text-red-900')
    expect(aspecto.bar).toContain('bg-red-700')
  })

  it('el porcentaje se redondea', () => {
    expect(loadRatio(36, 40)).toBe(90)
    expect(loadRatio(1, 3)).toBe(33)
    expect(loadRatioText(36, 40)).toBe('90 %')
  })

  it('sin capacidad no hay porcentaje', () => {
    expect(loadRatio(36, null)).toBeNull()
    expect(loadRatioText(36, null)).toBe('')
  })

  it('la barra se llena del todo en sobrecarga', () => {
    expect(loadBarWidth(20, 40)).toBe(50)
    expect(loadBarWidth(60, 40)).toBe(100)
    expect(loadBarWidth(30, null)).toBe(0)
  })
})

describe('uso del equipo', () => {
  const rows = [
    {
      user_id: 1,
      cells: [
        { week: '2026-W46', hours: 36, capacity: 40 },
        { week: '2026-W47', hours: 10, capacity: 40 },
      ],
    },
    {
      user_id: 2,
      cells: [
        { week: '2026-W46', hours: 24, capacity: 40 },
        { week: '2026-W47', hours: 0, capacity: 40 },
      ],
    },
  ]

  it('suma las horas y las capacidades de la semana', () => {
    const uso = teamUsage(rows, '2026-W46')
    expect(uso.hours).toBe(60)
    expect(uso.capacity).toBe(80)
  })

  it('si alguien no tiene capacidad, la del equipo se desconoce', () => {
    const conHueco = [
      rows[0],
      { user_id: 2, cells: [{ week: '2026-W46', hours: 24, capacity: null }] },
    ]

    const uso = teamUsage(conHueco, '2026-W46')
    expect(uso.hours).toBe(60)
    expect(uso.capacity).toBeNull()
    expect(uso.unknown).toBe(true)
  })

  it('una semana sin celdas no rompe nada', () => {
    const uso = teamUsage(rows, '2026-W99')
    expect(uso.hours).toBe(0)
    expect(uso.capacity).toBe(0)
  })
})
