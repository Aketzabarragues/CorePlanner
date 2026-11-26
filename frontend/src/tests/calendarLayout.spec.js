import { describe, expect, it } from 'vitest'

import {
  barraDeTarea,
  buildWeekLayout,
  celdasDeCarril,
  carrilesDe,
  primeraColumnaLaborable,
  repartirEnCarriles,
  ultimaColumnaLaborable,
} from '../utils/calendarLayout'
import { weekDays } from '../utils/weeks'

// 2026-W45: lunes 2 de noviembre a domingo 8 de noviembre de 2026.
const SEMANA = '2026-W45'
const DIAS = weekDays(SEMANA)

function persona(id, name, department_name = null) {
  return { id, name, department_name }
}

function tarea(id, start, end, extra = {}) {
  return { id, title: `Tarea ${id}`, start, end, ...extra }
}

describe('columnas laborables de la semana', () => {
  it('el primer dia laborable es el lunes y el ultimo el viernes', () => {
    expect(primeraColumnaLaborable(DIAS, '2026-11-02')).toBe(0)
    expect(ultimaColumnaLaborable(DIAS, '2026-11-06')).toBe(4)
  })

  it('salta el fin de semana: el sabado entra el lunes y el domingo sale el viernes', () => {
    // Una tarea que empieza el sabado 7 no cabe en esta semana (no hay dia
    // laborable posterior): su barra cae en la siguiente. Una que acaba el
    // domingo 8 sale el viernes.
    expect(primeraColumnaLaborable(DIAS, '2026-11-07')).toBe(-1)
    expect(primeraColumnaLaborable(DIAS, '2026-11-08')).toBe(-1)
    expect(ultimaColumnaLaborable(DIAS, '2026-11-08')).toBe(4)
    expect(ultimaColumnaLaborable(DIAS, '2026-11-07')).toBe(4)
  })

  it('fuera de la semana no hay columna', () => {
    expect(primeraColumnaLaborable(DIAS, '2026-11-09')).toBe(-1)
    expect(ultimaColumnaLaborable(DIAS, '2026-11-01')).toBe(-1)
  })
})

describe('barra de una tarea dentro de la semana', () => {
  it('una tarea de lunes a viernes ocupa las cinco columnas laborables', () => {
    const barra = barraDeTarea(DIAS, tarea(1, '2026-11-02', '2026-11-06'))
    expect(barra.inicio).toBe(0)
    expect(barra.fin).toBe(4)
    expect(barra.tarea.id).toBe(1)
  })

  it('recorta a los dias laborables por los dos lados', () => {
    // Empieza el sabado 7: en la semana W46 entra el lunes 9. Acaba el
    // domingo 8: en la semana W45 sale el viernes 6.
    const diasSiguiente = weekDays('2026-W46')
    const entrada = barraDeTarea(diasSiguiente, tarea(2, '2026-11-07', '2026-11-10'))
    expect(entrada).not.toBeNull()
    expect(entrada.inicio).toBe(0)
    expect(entrada.fin).toBe(1)
    const salida = barraDeTarea(DIAS, tarea(3, '2026-11-04', '2026-11-08'))
    expect(salida).not.toBeNull()
    expect(salida.inicio).toBe(2)
    expect(salida.fin).toBe(4)
  })

  it('una tarea fuera de la semana no produce barra', () => {
    expect(barraDeTarea(DIAS, tarea(3, '2026-11-09', '2026-11-13'))).toBeNull()
    expect(barraDeTarea(DIAS, tarea(4, '2026-10-26', '2026-10-30'))).toBeNull()
  })
})

describe('reparto de barras en carriles', () => {
  it('dos tareas que se pisan van a carriles distintos y la mas larga primero', () => {
    const larga = { tarea: tarea(1, '2026-11-02', '2026-11-06'), inicio: 0, fin: 4 }
    const corta = { tarea: tarea(2, '2026-11-03', '2026-11-05'), inicio: 1, fin: 3 }

    const repartidas = repartirEnCarriles([corta, larga])

    // La larga empieza antes: gana el carril 0 aunque la corta se pase.
    expect(repartidas.find((barra) => barra.tarea.id === 1).carril).toBe(0)
    expect(repartidas.find((barra) => barra.tarea.id === 2).carril).toBe(1)
  })

  it('tareas que no se pisan comparten el primer carril', () => {
    const repartidas = repartirEnCarriles([
      { tarea: tarea(1, '2026-11-02', '2026-11-03'), inicio: 0, fin: 1 },
      { tarea: tarea(2, '2026-11-04', '2026-11-06'), inicio: 3, fin: 4 },
    ])

    expect(repartidas.map((barra) => barra.carril)).toEqual([0, 0])
  })

  it('una persona sin tareas tiene un carril vacio', () => {
    expect(carrilesDe([])).toEqual([[]])
  })
})

describe('celdas de un carril', () => {
  it('las celdas son contiguas y cubren las siete columnas sin solaparse', () => {
    const barras = [
      { tarea: tarea(1, '2026-11-02', '2026-11-04'), inicio: 0, fin: 2, carril: 0 },
    ]
    const celdas = celdasDeCarril(DIAS, barras)

    let cursor = 0
    for (const celda of celdas) {
      expect(celda.inicio).toBe(cursor)
      cursor += celda.span
    }
    expect(cursor).toBe(7)
    expect(celdas[0].tipo).toBe('barra')
    expect(celdas[0].span).toBe(3)
  })

  it('los huecos salen de uno en uno y las barras con su colspan', () => {
    const barras = [
      { tarea: tarea(1, '2026-11-02', '2026-11-03'), inicio: 0, fin: 1, carril: 0 },
      { tarea: tarea(2, '2026-11-05', '2026-11-06'), inicio: 3, fin: 4, carril: 0 },
    ]
    const celdas = celdasDeCarril(DIAS, barras)

    expect(celdas.map((celda) => [celda.tipo, celda.inicio, celda.span])).toEqual([
      ['barra', 0, 2],
      ['hueco', 2, 1],
      ['barra', 3, 2],
      ['hueco', 5, 1],
      ['hueco', 6, 1],
    ])
  })

  it('una barra que empieza donde acaba la anterior no se pinta', () => {
    const celdas = celdasDeCarril(DIAS, [
      { tarea: tarea(1, '2026-11-02', '2026-11-03'), inicio: 0, fin: 1, carril: 0 },
      { tarea: tarea(2, '2026-11-02', '2026-11-05'), inicio: 0, fin: 3, carril: 0 },
    ])

    expect(celdas.filter((celda) => celda.tipo === 'barra')).toHaveLength(1)
    expect(celdas[0].span).toBe(2)
    expect(celdas[0].barra.tarea.id).toBe(1)
  })

  it('carril vacio: siete huecos, uno por columna', () => {
    expect(celdasDeCarril(DIAS, [])).toEqual(
      Array.from({ length: 7 }, (_, indice) => ({ tipo: 'hueco', span: 1, inicio: indice })),
    )
  })
})

describe('rejilla de la semana', () => {
  it('pone una fila por persona en el orden en que vienen', () => {
    const { filas } = buildWeekLayout({
      days: DIAS,
      people: [persona(1, 'Ana'), persona(2, 'Luis')],
      tasks: [tarea(1, '2026-11-02', '2026-11-03', { assigned_to: 1 })],
    })

    expect(filas).toHaveLength(2)
    expect(filas[0]).toEqual({
      id: 1,
      name: 'Ana',
      department_name: null,
      carriles: [
        [
          {
            tarea: expect.objectContaining({ id: 1, start: '2026-11-02', end: '2026-11-03' }),
            inicio: 0,
            fin: 1,
            carril: 0,
          },
        ],
      ],
    })
    expect(filas[1].carriles).toEqual([[]])
  })

  it('una tarea sin persona crea la fila Sin asignar al final', () => {
    const { filas } = buildWeekLayout({
      days: DIAS,
      people: [persona(1, 'Ana')],
      tasks: [
        tarea(1, '2026-11-02', '2026-11-03', { assigned_to: null }),
        tarea(2, '2026-11-04', '2026-11-05', { assigned_to: 1 }),
      ],
    })

    expect(filas).toHaveLength(2)
    expect(filas[1]).toEqual({
      id: null,
      name: 'Sin asignar',
      department_name: null,
      carriles: [
        [
          {
            tarea: expect.objectContaining({ id: 1 }),
            inicio: 0,
            fin: 1,
            carril: 0,
          },
        ],
      ],
    })
  })

  it('sin tareas sin asignar no hay fila Sin asignar', () => {
    const { filas } = buildWeekLayout({
      days: DIAS,
      people: [persona(1, 'Ana')],
      tasks: [tarea(1, '2026-11-02', '2026-11-03', { assigned_to: 1 })],
    })

    expect(filas).toHaveLength(1)
    expect(filas[0].id).toBe(1)
  })

  it('sin dias no hay rejilla y no lanza', () => {
    expect(buildWeekLayout({ days: [], people: [persona(1, 'Ana')], tasks: [] })).toEqual({
      days: [],
      filas: [],
    })
  })
})
