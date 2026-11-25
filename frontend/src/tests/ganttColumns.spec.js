import { describe, expect, it } from 'vitest'

import {
  COLUMNAS_GANTT,
  columnasDeUrl,
  comparadorDeOrden,
  ordenDeUrl,
  textoDeColumna,
  valorDeColumna,
} from '../utils/ganttColumns'

const tarea = {
  title: 'Montajes',
  assigned_name: 'Ana',
  start: '2026-11-09',
  end: '2026-11-20',
  estimated_hours: '40.00',
  status: 'in_progress',
}

describe('catalogo de columnas', () => {
  it('tiene las seis columnas elegibles, en su orden, con etiqueta y ancho', () => {
    expect(COLUMNAS_GANTT.map((columna) => columna.key)).toEqual([
      'persona',
      'inicio',
      'fin',
      'duracion',
      'horas',
      'estado',
    ])
    for (const columna of COLUMNAS_GANTT) {
      expect(columna.label).toBeTruthy()
      expect(columna.ancho).toBeGreaterThan(0)
    }
  })
})

describe('columnasDeUrl', () => {
  it('lee las elegidas en el orden del catalogo, no en el del enlace', () => {
    expect(columnasDeUrl('horas,persona')).toEqual(['persona', 'horas'])
  })

  it('ignora las repetidas, las que no existen y la de la tarea', () => {
    expect(columnasDeUrl('persona,persona,fin')).toEqual(['persona', 'fin'])
    expect(columnasDeUrl('tarea,inicio,inventado, horas ,estado')).toEqual(['inicio', 'horas', 'estado'])
  })

  it('sin URL o vacia no hay columnas', () => {
    expect(columnasDeUrl('')).toEqual([])
    expect(columnasDeUrl(null)).toEqual([])
  })
})

describe('ordenDeUrl', () => {
  it('lee columna y sentido, tambien la de la tarea', () => {
    expect(ordenDeUrl('inicio:asc')).toEqual({ columna: 'inicio', sentido: 'asc' })
    expect(ordenDeUrl('horas:desc')).toEqual({ columna: 'horas', sentido: 'desc' })
    expect(ordenDeUrl('tarea:asc')).toEqual({ columna: 'tarea', sentido: 'asc' })
  })

  it('lo que no encaja es null', () => {
    expect(ordenDeUrl('inicio')).toBeNull()
    expect(ordenDeUrl('inicio:lateral')).toBeNull()
    expect(ordenDeUrl('inventado:asc')).toBeNull()
    expect(ordenDeUrl('')).toBeNull()
    expect(ordenDeUrl(null)).toBeNull()
  })
})

describe('valorDeColumna', () => {
  it('el valor es el que se compara al ordenar', () => {
    expect(valorDeColumna('tarea', tarea)).toBe('Montajes')
    expect(valorDeColumna('persona', tarea)).toBe('Ana')
    expect(valorDeColumna('inicio', tarea)).toBe('2026-11-09')
    expect(valorDeColumna('fin', tarea)).toBe('2026-11-20')
    expect(valorDeColumna('duracion', tarea)).toBe(12)
    expect(valorDeColumna('horas', tarea)).toBe(40)
    expect(valorDeColumna('estado', tarea)).toBe('En Desarrollo')
  })

  it('los huecos no rompen el comparador', () => {
    expect(valorDeColumna('persona', {})).toBe('')
    expect(valorDeColumna('duracion', {})).toBe(0)
    expect(valorDeColumna('horas', {})).toBe(0)
    expect(valorDeColumna('estado', {})).toBe('')
    expect(valorDeColumna('tarea', null)).toBe('')
    expect(valorDeColumna('inexistente', tarea)).toBe('')
  })

  it('el estado se etiqueta con los estados que se pasan', () => {
    const estados = [{ key: 'custom', label: 'Mi estado', color: '#000000', progress: 10 }]
    expect(valorDeColumna('estado', { status: 'custom' }, estados)).toBe('Mi estado')
    expect(textoDeColumna('estado', { status: 'custom' }, estados)).toBe('Mi estado')
    expect(valorDeColumna('estado', { status: 'custom' })).toBe('custom')
  })
})

describe('textoDeColumna', () => {
  it('el texto es lo que se lee en la celda', () => {
    expect(textoDeColumna('persona', tarea)).toBe('Ana')
    expect(textoDeColumna('inicio', tarea)).toBe('9 nov')
    expect(textoDeColumna('fin', tarea)).toBe('20 nov')
    expect(textoDeColumna('duracion', tarea)).toBe('12 d')
    expect(textoDeColumna('horas', tarea)).toBe('40.00')
    expect(textoDeColumna('estado', tarea)).toBe('En Desarrollo')
  })

  it('la persona sin asignar se lee "Sin asignar" y las horas sin feed salen a cero', () => {
    expect(textoDeColumna('persona', { assigned_name: null })).toBe('Sin asignar')
    expect(textoDeColumna('horas', { estimated_hours: null })).toBe('0.00')
    expect(textoDeColumna('inicio', { start: null })).toBe('')
  })
})

describe('comparadorDeOrden', () => {
  it('sin ordenacion no hay comparador', () => {
    expect(comparadorDeOrden(null)).toBeNull()
    expect(comparadorDeOrden(undefined)).toBeNull()
  })

  it('ordena las fechas como texto ISO y las horas como numero', () => {
    const porInicio = comparadorDeOrden({ columna: 'inicio', sentido: 'asc' })
    expect(porInicio(tarea, { ...tarea, start: '2026-11-10' })).toBeLessThan(0)

    const porHoras = comparadorDeOrden({ columna: 'horas', sentido: 'asc' })
    expect(porHoras({ ...tarea, estimated_hours: '5.00' }, tarea)).toBeLessThan(0)
  })

  it('desc invierte el sentido y las duraciones iguales empatan a cero', () => {
    const desc = comparadorDeOrden({ columna: 'inicio', sentido: 'desc' })
    expect(desc(tarea, { ...tarea, start: '2026-11-10' })).toBeGreaterThan(0)
    const duracion = comparadorDeOrden({ columna: 'duracion', sentido: 'asc' })
    expect(duracion(tarea, { ...tarea, end: '2026-11-20' })).toBe(0)
  })

  it('los textos se comparan en espanol', () => {
    const porPersona = comparadorDeOrden({ columna: 'persona', sentido: 'asc' })
    expect(porPersona({ assigned_name: 'Ana' }, { assigned_name: 'José' })).toBeLessThan(0)
  })
})
