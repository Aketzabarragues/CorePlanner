import { describe, expect, it } from 'vitest'

import { NIVEL_COMPETENCIA, initials, nivelTexto } from '../utils/people'

describe('people', () => {
  it('initials coge las dos primeras letras, en mayusculas', () => {
    expect(initials('Ana García López')).toBe('AG')
    expect(initials('Ana')).toBe('A')
  })

  it('el mapa de niveles cubre el 1, el 2 y el 3', () => {
    expect(NIVEL_COMPETENCIA).toEqual({
      1: 'Básico',
      2: 'Intermedio',
      3: 'Experto',
    })
  })

  it('nivelTexto va siempre con el numero', () => {
    expect(nivelTexto(3)).toBe('3 · Experto')
    expect(nivelTexto(2)).toBe('2 · Intermedio')
    expect(nivelTexto(1)).toBe('1 · Básico')
    expect(nivelTexto(0)).toBe('0 · Sin asignar')
  })

  it('un nivel fuera de escala no inventa etiqueta', () => {
    expect(nivelTexto(undefined)).toBe('0 · Sin asignar')
    expect(nivelTexto(4)).toBe('0 · Sin asignar')
  })
})
