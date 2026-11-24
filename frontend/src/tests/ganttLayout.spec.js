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

  it('la escala de semana lleva sublineas solo por los dias interiores', () => {
    const eje = buildTimeAxis({
      start: parseIsoDate('2026-11-09'),
      end: parseIsoDate('2026-11-15'),
      scale: semana,
    })

    // La semana completa, sin borde visible: lunes (x 0) y domingo (x 98)
    // son lineas de celda, asi que solo caen los seis dias interiores.
    expect(eje.subticks).toEqual([
      { x: 14, kind: 'day' },
      { x: 28, kind: 'day' },
      { x: 42, kind: 'day' },
      { x: 56, kind: 'day' },
      { x: 70, kind: 'day' },
      { x: 84, kind: 'day' },
    ])
    expect(eje.bands).toEqual([])
  })

  it('la escala de semana recorta las sublineas fuera del rango visible', () => {
    const eje = buildTimeAxis({
      start: parseIsoDate('2026-11-10'),
      end: parseIsoDate('2026-11-15'),
      scale: semana,
    })

    // El lunes 9, que arranca antes del rango, deja interior todo: su
    // sublinea del martes cae en x 14 y las demas tambien. El domingo 15 es
    // el borde (x 84 = width) y no es interior: su sublinea no entra.
    expect(eje.subticks).toEqual([
      { x: 14, kind: 'day' },
      { x: 28, kind: 'day' },
      { x: 42, kind: 'day' },
      { x: 56, kind: 'day' },
      { x: 70, kind: 'day' },
    ])
  })

  it('la escala de mes lleva sublineas por los lunes del mes', () => {
    const eje = buildTimeAxis({
      start: parseIsoDate('2026-11-01'),
      end: parseIsoDate('2026-11-30'),
      scale: mes,
    })

    // Nov de 2026: el 1 es domingo, asi que los lunes son 2, 9, 16, 23 y 30,
    // a 5 px/dia desde el 1 (x 0). El 30 cae dentro del mes, no es borde:
    // entra.
    expect(eje.subticks).toEqual([
      { x: 5, kind: 'week' },
      { x: 40, kind: 'week' },
      { x: 75, kind: 'week' },
      { x: 110, kind: 'week' },
      { x: 145, kind: 'week' },
    ])
    expect(eje.bands).toEqual([])
  })

  it('la escala de mes recorta las sublineas fuera del rango visible', () => {
    const eje = buildTimeAxis({
      start: parseIsoDate('2026-11-02'),
      end: parseIsoDate('2026-12-01'),
      scale: mes,
    })

    // El lunes 2 de noviembre queda fuera del rango: su sublinea no entra.
    // En noviembre entran los lunes 9, 16, 23 y 30; el 1 de diciembre (tambien
    // lunes) cae justo en el borde del rango (x 145 = width) y no entra.
    expect(eje.subticks.map((subtick) => subtick.x)).toEqual([7 * 5, 14 * 5, 21 * 5, 28 * 5])
    expect(eje.subticks.every((subtick) => subtick.kind === 'week')).toBe(true)
  })

  it('la escala de dia lleva una banda por mes y sin sublineas', () => {
    const eje = buildTimeAxis({
      start: parseIsoDate('2026-11-29'),
      end: parseIsoDate('2026-12-01'),
      scale: dia,
    })

    // El rango cruza mes: la banda de noviembre empieza donde se ve, no en
    // el dia 1, y la de diciembre empieza donde acaba la anterior.
    expect(eje.subticks).toEqual([])
    expect(eje.bands).toEqual([
      {
        key: '2026-11',
        label: 'nov 2026',
        x: 0,
        width: 2 * 44,
      },
      {
        key: '2026-12',
        label: 'dic 2026',
        x: 2 * 44,
        width: 1 * 44,
      },
    ])
  })

  it('una sola banda engloba el mes entero cuando el rango no cruza mes', () => {
    const eje = buildTimeAxis({
      start: parseIsoDate('2026-11-09'),
      end: parseIsoDate('2026-11-15'),
      scale: dia,
    })

    expect(eje.bands).toEqual([
      { key: '2026-11', label: 'nov 2026', x: 0, width: 7 * 44 },
    ])
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

  it('la fila de grupo lleva su clave y la extension de sus tareas', () => {
    const { rows } = layout()

    const grupo = rows.find((fila) => fila.type === 'group')
    // La clave es el identificador del grupo: es lo que va a la URL para el
    // colapso, y en este layout es el nombre porque la vista ya lo decide.
    expect(grupo.clave).toBe('Alfas')
    expect(grupo.label).toBe('Alfas')
    expect(grupo.inicio).toBe('2026-11-02')
    expect(grupo.fin).toBe('2026-11-06')
    expect(grupo.cuantas).toBe(2)
    // La barra de resumen ocupa la extension de las tareas: del 2 al 6 de
    // noviembre son cinco dias a 44 px.
    expect(grupo.x).toBe(0)
    expect(grupo.width).toBe(5 * 44)
    expect(grupo.color).toBe('#005566')
    expect(grupo.colorClass).toBeNull()
  })

  it('cada grupo lleva su propio resumen, no el del anterior', () => {
    const otros = [
      { task: tarea(12, '2026-11-02', '2026-11-02'), grupo: 'Bravo' },
      ...items,
    ]
    const { rows } = layout({ items: otros })
    const grupos = rows.filter((fila) => fila.type === 'group')

    expect(grupos[0]).toMatchObject({
      clave: 'Bravo',
      inicio: '2026-11-02',
      fin: '2026-11-02',
      cuantas: 1,
      x: 0,
      width: 1 * 44,
    })
    // Alfas no hereda el rango de Bravo: su extension es la de sus dos
    // tareas, aunque Bravo empiece antes que ellas.
    expect(grupos[1]).toMatchObject({
      clave: 'Alfas',
      inicio: '2026-11-02',
      fin: '2026-11-06',
      cuantas: 2,
      x: 0,
      width: 5 * 44,
    })
  })

  it('un grupo colapsado no emite sus filas de barra y la fila del grupo sigue con su resumen', () => {
    const { rows, bars } = layout({ collapsed: ['Alfas'] })

    expect(rows).toHaveLength(1)
    const grupo = rows[0]
    expect(grupo.type).toBe('group')
    expect(grupo.rowIndex).toBe(0)
    expect(grupo).toMatchObject({
      clave: 'Alfas',
      inicio: '2026-11-02',
      fin: '2026-11-06',
      cuantas: 2,
      x: 0,
      width: 5 * 44,
    })
    // El resumen no se calcula sobre las barras visibles: el grupo colapsado
    // sigue llevando el de sus dos tareas.
    expect(bars).toEqual([])
  })

  it('con un grupo colapsado las filas siguientes se renumeran y las demas barras salen', () => {
    const tresGrupos = [
      { task: tarea(12, '2026-11-02', '2026-11-02'), grupo: 'Bravo' },
      ...items,
      {
        task: tarea(13, '2026-11-07', '2026-11-07', {
          project_color: '#112233',
          custom_class: 'persona-3',
        }),
        grupo: 'Charly',
      },
    ]
    const { rows, bars } = layout({ items: tresGrupos, collapsed: ['Alfas'] })

    // Bravo: grupo en la 0 y su barra en la 1, como sin colapsar. Alfas
    // solo deja su fila de grupo en la 2, sin barras. Charly baja de la 5
    // (sin colapsar) a la 3, y su barra a la 4.
    expect(rows.map((fila) => fila.rowIndex)).toEqual([0, 1, 2, 3, 4])
    expect(rows.map((fila) => fila.type)).toEqual(['group', 'bar', 'group', 'group', 'bar'])
    expect(rows.map((fila) => (fila.type === 'group' ? fila.clave : null))).toEqual([
      'Bravo',
      null,
      'Alfas',
      'Charly',
      null,
    ])
    expect(bars).toHaveLength(2)
    expect(bars.map((barra) => barra.taskId)).toEqual([12, 13])
    expect(bars.map((barra) => barra.rowIndex)).toEqual([1, 4])
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
