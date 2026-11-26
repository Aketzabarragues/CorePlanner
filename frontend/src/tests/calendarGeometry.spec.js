import { describe, expect, it } from 'vitest'

import {
  columnaDesdeX,
  diaLaborable,
  desplazarLaborable,
  diasLaborablesEntre,
  esLaborable,
  hitTestDia,
  moverRangoLaborable,
} from '../utils/calendarGeometry'
import { weekDays } from '../utils/weeks'

// 2026-W45: lunes 2 de noviembre a domingo 8 de noviembre de 2026. La
// segunda semana es la de W46, para la geometria de dos semanas.
const DIAS = [weekDays('2026-W45'), weekDays('2026-W46')]

// La tabla mide 200 de nombres y siete columnas de 96: el rectangulo va de
// 0 a 872. Las semanas no se tocan (hueco entre la primera y la segunda),
// para poder comprobar el caso sin semana.
const GEOMETRIA = {
  izquierda: 0,
  derecha: 872,
  arriba: 0,
  abajo: 240,
  anchoNombres: 200,
  anchoDia: 96,
  dias: DIAS,
  semanas: [
    { indice: 0, top: 0, bottom: 100 },
    { indice: 1, top: 140, bottom: 240 },
  ],
}

describe('columna desde la x del puntero', () => {
  it('devuelve la columna 0..6 dentro de la rejilla', () => {
    expect(columnaDesdeX({ x: 201, geometria: GEOMETRIA })).toBe(0)
    expect(columnaDesdeX({ x: 295, geometria: GEOMETRIA })).toBe(0)
    expect(columnaDesdeX({ x: 296, geometria: GEOMETRIA })).toBe(1)
    expect(columnaDesdeX({ x: 871, geometria: GEOMETRIA })).toBe(6)
  })

  it('es null en la zona de nombres y fuera del rectangulo', () => {
    expect(columnaDesdeX({ x: 100, geometria: GEOMETRIA })).toBeNull()
    expect(columnaDesdeX({ x: -1, geometria: GEOMETRIA })).toBeNull()
    expect(columnaDesdeX({ x: 873, geometria: GEOMETRIA })).toBeNull()
  })
})

describe('dia bajo el puntero', () => {
  it('devuelve la semana, la columna y la fecha del dia', () => {
    expect(hitTestDia({ x: 250, y: 60, geometria: GEOMETRIA })).toEqual({
      semana: 0,
      columna: 0,
      fecha: '2026-11-02',
    })
    expect(hitTestDia({ x: 250, y: 180, geometria: GEOMETRIA })).toEqual({
      semana: 1,
      columna: 0,
      fecha: '2026-11-09',
    })
    expect(hitTestDia({ x: 700, y: 180, geometria: GEOMETRIA })).toEqual({
      semana: 1,
      columna: 5,
      fecha: '2026-11-14',
    })
  })

  it('es null fuera del rectangulo y en la zona de nombres', () => {
    expect(hitTestDia({ x: -1, y: 60, geometria: GEOMETRIA })).toBeNull()
    expect(hitTestDia({ x: 873, y: 60, geometria: GEOMETRIA })).toBeNull()
    expect(hitTestDia({ x: 250, y: -1, geometria: GEOMETRIA })).toBeNull()
    expect(hitTestDia({ x: 250, y: 241, geometria: GEOMETRIA })).toBeNull()
    expect(hitTestDia({ x: 100, y: 60, geometria: GEOMETRIA })).toBeNull()
  })

  it('es null si ninguna semana contiene la altura del puntero', () => {
    expect(hitTestDia({ x: 250, y: 130, geometria: GEOMETRIA })).toBeNull()
  })
})

describe('dia laborable', () => {
  it('lunes a viernes es laborable, sabado y domingo no', () => {
    expect(esLaborable('2026-11-02')).toBe(true) // lunes
    expect(esLaborable('2026-11-03')).toBe(true) // martes
    expect(esLaborable('2026-11-04')).toBe(true) // miercoles
    expect(esLaborable('2026-11-05')).toBe(true) // jueves
    expect(esLaborable('2026-11-06')).toBe(true) // viernes
    expect(esLaborable('2026-11-07')).toBe(false) // sabado
    expect(esLaborable('2026-11-08')).toBe(false) // domingo
  })

  it('si ya es laborable, devuelve la misma fecha', () => {
    expect(diaLaborable('2026-11-02')).toBe('2026-11-02')
    expect(diaLaborable('2026-11-06')).toBe('2026-11-06')
  })

  it('el sabado cae en el viernes anterior', () => {
    expect(diaLaborable('2026-11-07')).toBe('2026-11-06')
  })

  it('el domingo cae en el lunes siguiente', () => {
    expect(diaLaborable('2026-11-08')).toBe('2026-11-09')
  })

  it('el domingo a principios de mes cae en el lunes de ese mes', () => {
    // 2026-11-01 es domingo; el lunes siguiente es 2026-11-02.
    expect(diaLaborable('2026-11-01')).toBe('2026-11-02')
  })

  it('el sabado a fin de mes cae en el viernes de ese mes', () => {
    // 2026-12-05 es sabado; el viernes anterior es 2026-12-04.
    expect(diaLaborable('2026-12-05')).toBe('2026-12-04')
  })
})

describe('desplazar en dias laborables', () => {
  it('nulo devuelve la propia fecha', () => {
    expect(desplazarLaborable('2026-11-02', 0)).toBe('2026-11-02')
  })

  it('viernes mas uno es el lunes siguiente', () => {
    expect(desplazarLaborable('2026-11-06', 1)).toBe('2026-11-09')
  })

  it('lunes menos uno es el viernes anterior', () => {
    expect(desplazarLaborable('2026-11-09', -1)).toBe('2026-11-06')
  })

  it('jueves mas cuatro es el miercoles siguiente', () => {
    expect(desplazarLaborable('2026-11-05', 4)).toBe('2026-11-11')
  })

  it('la partida en sabado o domingo se normaliza con el dia laborable', () => {
    // Sabado 7 -> viernes 6, y de ahi un dia adelante: lunes 9.
    expect(desplazarLaborable('2026-11-07', 1)).toBe('2026-11-09')
    // Domingo 8 -> lunes 9, y de ahi un dia atras: viernes 6.
    expect(desplazarLaborable('2026-11-08', -1)).toBe('2026-11-06')
  })
})

describe('dias laborables entre dos fechas', () => {
  it('lunes a viernes cuenta cinco', () => {
    expect(diasLaborablesEntre('2026-11-02', '2026-11-06')).toBe(5)
  })

  it('viernes a lunes siguiente cuenta dos', () => {
    expect(diasLaborablesEntre('2026-11-06', '2026-11-09')).toBe(2)
  })

  it('un rango solo de fin de semana cuenta cero', () => {
    expect(diasLaborablesEntre('2026-11-07', '2026-11-08')).toBe(0)
  })

  it('si el inicio no va antes del fin, cuenta cero', () => {
    expect(diasLaborablesEntre('2026-11-06', '2026-11-02')).toBe(0)
  })
})

describe('mover un rango conservando los dias laborables', () => {
  it('lunes a viernes con destino jueves cae jueves a miercoles siguiente', () => {
    expect(moverRangoLaborable('2026-11-02', '2026-11-06', '2026-11-05')).toEqual({
      start: '2026-11-05',
      end: '2026-11-11',
    })
  })

  it('el caso del bug: lunes 30 nov a viernes 4 dic con destino jueves 3 dic', () => {
    expect(moverRangoLaborable('2026-11-30', '2026-12-04', '2026-12-03')).toEqual({
      start: '2026-12-03',
      end: '2026-12-09',
    })
  })

  it('una tarea de un solo dia se mueve sin estirarse', () => {
    expect(moverRangoLaborable('2026-11-02', '2026-11-02', '2026-11-05')).toEqual({
      start: '2026-11-05',
      end: '2026-11-05',
    })
  })

  it('una tarea que empieza en sabado conserva los dias laborables', () => {
    // Del sabado 7 al miercoles 11 hay tres dias laborables (9, 10 y 11);
    // con destino jueves 5 cae del 5 al 9.
    expect(moverRangoLaborable('2026-11-07', '2026-11-11', '2026-11-05')).toEqual({
      start: '2026-11-05',
      end: '2026-11-09',
    })
  })
})
