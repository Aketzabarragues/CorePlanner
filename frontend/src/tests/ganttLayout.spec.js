import { describe, expect, it } from 'vitest'

import { buildLayout, buildTimeAxis, moveRange, resizeRange, snapDelta, weekendIndex } from '../utils/ganttLayout'
import { GANTT_SCALES } from '../utils/ganttScale'
import { parseIsoDate } from '../utils/ganttScale'

const dia = GANTT_SCALES[0]
const semana = GANTT_SCALES[1]
const mes = GANTT_SCALES[2]

function tarea(id, inicio, fin, extra = {}) {
  return { id, name: `Tarea ${id}`, start: inicio, end: fin, ...extra }
}

describe('eje temporal del Gantt', () => {
  it('pinta una celda por dia en escala dia', () => {
    const eje = buildTimeAxis({
      start: parseIsoDate('2026-11-02'),
      end: parseIsoDate('2026-11-08'),
      scale: dia,
    })

    expect(eje.days).toBe(7)
    expect(eje.width).toBe(7 * 44)
    expect(eje.cells).toHaveLength(7)
    expect(eje.cells[0]).toEqual({
      key: '2026-11-02',
      label: '2',
      sublabel: 'L',
      x: 0,
      width: 44,
      kind: 'day',
    })
    expect(eje.cells[5].sublabel).toBe('S')
    expect(eje.cells[6].sublabel).toBe('D')
    expect(eje.ticks).toHaveLength(7)
    expect(eje.ticks[1]).toEqual({ x: 44, kind: 'day' })
  })

  it('pinta una celda por semana ISO en escala semana', () => {
    const eje = buildTimeAxis({
      start: parseIsoDate('2026-12-28'),
      end: parseIsoDate('2027-01-03'),
      scale: semana,
    })

    expect(eje.cells.map((celda) => celda.key)).toEqual(['2026-W53'])
    expect(eje.cells[0].label).toBe('S53')
    expect(eje.cells[0].width).toBe(7 * 14)
    expect(eje.cells.every((celda) => celda.kind === 'week')).toBe(true)
  })

  it('etiqueta el rango de la semana en la subcabecera', () => {
    const eje = buildTimeAxis({
      start: parseIsoDate('2026-11-09'),
      end: parseIsoDate('2026-11-15'),
      scale: semana,
    })

    expect(eje.cells[0].sublabel).toBe('9 - 15 nov')
  })

  it('cuenta el dia del 31 de diciembre de 2026 en la semana 2026-W53', () => {
    const eje = buildTimeAxis({
      start: parseIsoDate('2026-12-31'),
      end: parseIsoDate('2026-12-31'),
      scale: semana,
    })

    expect(eje.cells[0].key).toBe('2026-W53')
  })

  it('pinta una celda por mes en escala mes', () => {
    const eje = buildTimeAxis({
      start: parseIsoDate('2026-11-01'),
      end: parseIsoDate('2027-01-31'),
      scale: mes,
    })

    expect(eje.cells.map((celda) => celda.key)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(eje.cells[0]).toEqual({
      key: '2026-11',
      label: 'nov',
      sublabel: '2026',
      x: 0,
      width: 30 * 5,
      kind: 'month',
    })
    expect(eje.cells[1].width).toBe(31 * 5)
    expect(eje.cells[2].x).toBe(61 * 5)
    expect(eje.days).toBe(92)
    expect(eje.width).toBe(92 * 5)
  })

  it('cuenta 365 celdas en el ano 2027 completo en escala dia', () => {
    const eje = buildTimeAxis({
      start: parseIsoDate('2027-01-01'),
      end: parseIsoDate('2027-12-31'),
      scale: dia,
    })

    expect(eje.cells).toHaveLength(365)
    expect(eje.cells[364].key).toBe('2027-12-31')
  })
})

describe('layout del Gantt', () => {
  const items = [
    {
      task: tarea(10, '2026-11-02', '2026-11-04', {
        project_color: '#005566',
        custom_class: 'persona-1',
        assigned_name: 'Ana',
      }),
      grupo: 'Alfas',
    },
    {
      task: tarea(11, '2026-11-05', '2026-11-06', {
        project_color: '#005566',
        custom_class: 'persona-2',
        assigned_name: 'Luis',
      }),
      grupo: 'Alfas',
    },
  ]

  function layout(extra = {}) {
    return buildLayout({
      items,
      groupMode: 'proyecto',
      scale: dia,
      start: '2026-11-02',
      end: '2026-11-08',
      nonWorkingDays: [],
      today: parseIsoDate('2026-11-04'),
      ...extra,
    })
  }

  it('encabeza el grupo una vez y ordena las filas de barra en correlativo', () => {
    const { rows, bars } = layout()

    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ type: 'group', label: 'Alfas', rowIndex: 0 })
    expect(rows[1].rowIndex).toBe(1)
    expect(rows[2].rowIndex).toBe(2)
    expect(bars[0].rowIndex).toBe(1)
    expect(bars[1].rowIndex).toBe(2)
  })

  it('sin agrupar no hay filas de grupo', () => {
    const { rows } = layout({ groupMode: 'sin' })

    expect(rows).toHaveLength(2)
    expect(rows.every((fila) => fila.type === 'bar')).toBe(true)
  })

  it('encabeza cada grupo por separado', () => {
    const otros = [
      { task: tarea(12, '2026-11-02', '2026-11-02'), grupo: 'Bravo' },
      ...items,
    ]
    const { rows } = layout({ items: otros })

    expect(rows).toHaveLength(5)
    expect(rows.filter((fila) => fila.type === 'group').map((fila) => fila.label)).toEqual([
      'Bravo',
      'Alfas',
    ])
  })

  it('pinta la barra de tres dias al inicio del rango con x 0 y ancho 132', () => {
    const { bars } = layout()

    expect(bars[0].x).toBe(0)
    expect(bars[0].width).toBe(132)
    expect(bars[0].startIso).toBe('2026-11-02')
    expect(bars[0].endIso).toBe('2026-11-04')
    expect(bars[0].taskId).toBe(10)
    expect(bars[0].color).toBe('persona-1')
    expect(bars[0].projectColor).toBe('#005566')
    expect(bars[0].assignedName).toBe('Ana')
    expect(bars[1].x).toBe(3 * 44)
    expect(bars[1].width).toBe(88)
  })

  it('sombrea los fines de semana y los festivos que se le pasan', () => {
    const { shaded } = layout({ nonWorkingDays: ['2026-11-05'] })

    const porDia = Object.fromEntries(shaded.map((recta) => [recta.x, recta.kind]))
    expect(porDia[0 * 44]).toBeUndefined()
    expect(porDia[3 * 44]).toBe('festivo')
    expect(porDia[5 * 44]).toBe('weekend')
    expect(porDia[6 * 44]).toBe('weekend')
    expect(shaded.every((recta) => recta.width === 44)).toBe(true)
  })

  it('marca el dia de hoy dentro del rango o null fuera', () => {
    expect(layout({ today: parseIsoDate('2026-11-04') }).todayIndex).toBe(2)
    expect(layout({ today: parseIsoDate('2026-12-01') }).todayIndex).toBeNull()
    expect(layout({ today: parseIsoDate('2026-11-02') }).todayIndex).toBe(0)
    expect(layout({ today: parseIsoDate('2026-11-08') }).todayIndex).toBe(6)
  })

  it('repite el sombreado del festivo aunque caiga en fin de semana', () => {
    // El 7 de noviembre de 2026 es domingo: solo sale como fin de semana.
    const { shaded } = layout({ nonWorkingDays: ['2026-11-07'] })

    const domingo = shaded.filter((recta) => recta.x === 5 * 44)
    expect(domingo).toHaveLength(1)
    expect(domingo[0].kind).toBe('weekend')
  })
})

describe('movimiento de barras', () => {
  it('redondea los pixeles a dias', () => {
    expect(snapDelta(30, 44)).toBe(1)
    expect(snapDelta(-30, 44)).toBe(-1)
    expect(snapDelta(10, 44)).toBe(0)
  })

  it('mueve el rango conservando la duracion', () => {
    expect(moveRange('2026-11-02', '2026-11-04', 3)).toEqual({
      start: '2026-11-05',
      end: '2026-11-07',
    })
    expect(moveRange('2026-12-30', '2027-01-02', 5)).toEqual({
      start: '2027-01-04',
      end: '2027-01-07',
    })
  })

  it('recorta el inicio al final si el delta se pasa', () => {
    expect(resizeRange('2026-11-02', '2026-11-04', 'start', 2)).toEqual({
      start: '2026-11-04',
      end: '2026-11-04',
    })
    expect(resizeRange('2026-11-02', '2026-11-04', 'start', -1)).toEqual({
      start: '2026-11-01',
      end: '2026-11-04',
    })
  })

  it('recorta el final al inicio si el delta se pasa', () => {
    expect(resizeRange('2026-11-02', '2026-11-04', 'end', -5)).toEqual({
      start: '2026-11-02',
      end: '2026-11-02',
    })
    expect(resizeRange('2026-11-02', '2026-11-04', 'end', 3)).toEqual({
      start: '2026-11-02',
      end: '2026-11-07',
    })
  })

  it('rechaza un lado desconocido', () => {
    expect(() => resizeRange('2026-11-02', '2026-11-04', 'medio', 1)).toThrow()
  })
})

describe('fin de semana del Gantt', () => {
  it('marca sabado y domingo', () => {
    expect(weekendIndex(6)).toBe(true)
    expect(weekendIndex(0)).toBe(true)
    expect(weekendIndex(1)).toBe(false)
    expect(weekendIndex(4)).toBe(false)
  })
})
