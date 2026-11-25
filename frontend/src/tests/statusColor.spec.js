import { describe, expect, it } from 'vitest'

import { PALETTE } from '../utils/palette'
import {
  barra,
  contraste,
  luminancia,
  NEUTRO_BARRA,
  NEUTRO_PILDORA,
  pildora,
} from '../utils/statusColor'

describe('luminancia y contraste (WCAG 2.1)', () => {
  it('el contraste de un color consigo mismo es 1 y de negro sobre blanco 21', () => {
    expect(contraste('#1f6feb', '#1f6feb')).toBeCloseTo(1, 5)
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('sin color valido, null', () => {
    expect(contraste('#1f6feb', 'nada')).toBeNull()
    expect(luminancia('#zzzzzz')).toBeNull()
  })
})

describe('pildora', () => {
  it('todos los colores de la paleta cerrada quedan legibles: texto >= 4.5:1 contra el fondo', () => {
    for (const { hex, label } of PALETTE) {
      const estilo = pildora(hex)
      const ratio = contraste(estilo.color, estilo.backgroundColor)
      expect(ratio, label).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('mezcla el color con blanco para el fondo y oscurece el color para el texto', () => {
    const estilo = pildora('#1f6feb')
    expect(estilo.backgroundColor).toBe('#e4eefd')
    expect(estilo.color).toBe('#1c64d4')
  })

  it('si el color ya da contraste, se deja como esta', () => {
    expect(pildora('#57606a').color).toBe('#57606a')
  })

  it('con color blanco la pildora no queda blanca ni con texto invisible', () => {
    const estilo = pildora('#ffffff')
    expect(estilo.backgroundColor).toBe('#ffffff')
    expect(estilo.color).not.toBe('#ffffff')
    expect(contraste(estilo.color, estilo.backgroundColor)).toBeGreaterThanOrEqual(4.5)
  })

  it('sin color valido, el neutro', () => {
    expect(pildora(null)).toEqual(NEUTRO_PILDORA)
    expect(pildora('nada')).toEqual(NEUTRO_PILDORA)
    expect(pildora('#123')).toEqual(NEUTRO_PILDORA)
  })
})

describe('barra', () => {
  it('pinta el color tal cual', () => {
    expect(barra('#1f6feb')).toEqual({ backgroundColor: '#1f6feb' })
  })

  it('sin color valido, el neutro', () => {
    expect(barra(null)).toEqual(NEUTRO_BARRA)
    expect(barra('#zzzzzz')).toEqual(NEUTRO_BARRA)
  })
})
