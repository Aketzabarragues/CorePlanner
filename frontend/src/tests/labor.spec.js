import { describe, expect, it } from 'vitest'

import { hoursText, jornadaLabel, scopeLabel, scopeText, shortDate } from '../utils/labor'

describe('formato del calendario laboral', () => {
  it('dice a quien aplica cada alcance', () => {
    expect(scopeText({ scope: 'global' })).toBe('Global')
    expect(scopeText({ scope: 'department', department_name: 'Oficina' })).toBe('Oficina')
    expect(scopeText({ scope: 'person', user_name: 'Ana' })).toBe('Ana')
  })

  it('usa el nombre del destino si falta', () => {
    expect(scopeText({ scope: 'department' })).toBe('Departamento')
    expect(scopeText({ scope: 'person' })).toBe('Persona')
  })

  it('tiene etiqueta corta para cada alcance', () => {
    expect(scopeLabel('global')).toBe('Global')
    expect(scopeLabel('department')).toBe('Departamento')
    expect(scopeLabel('person')).toBe('Persona')
  })

  it('distingue la jornada completa de la de medio dia', () => {
    expect(jornadaLabel(false)).toBe('Jornada completa')
    expect(jornadaLabel(true)).toBe('Media jornada')
  })

  it('abrevia la fecha', () => {
    expect(shortDate('2026-11-09')).toBe('9 nov 2026')
  })

  it('muestra las horas con dos decimales', () => {
    expect(hoursText(40)).toBe('40.00')
    expect(hoursText(32.5)).toBe('32.50')
    expect(hoursText(null)).toBe('-')
  })
})
