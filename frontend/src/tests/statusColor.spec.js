import { describe, expect, it } from 'vitest'

import { PALETTE } from '../utils/palette'
import {
  barra,
  conBlanco,
  contraste,
  luminancia,
  NEUTRO_BARRA,
  NEUTRO_PILDORA,
  pildora,
  textoSobre,
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

describe('conBlanco', () => {
  it('mezcla el color con blanco: la fraccion del color y el resto blanco', () => {
    expect(conBlanco('#1f6feb', 0.12)).toBe('#e4eefd')
  })

  it('fraccion 1 deja el color tal cual y fraccion 0 deja el blanco', () => {
    expect(conBlanco('#1f6feb', 1)).toBe('#1f6feb')
    expect(conBlanco('#1f6feb', 0)).toBe('#ffffff')
  })

  it('sin color valido, null', () => {
    expect(conBlanco(null, 0.12)).toBeNull()
    expect(conBlanco('#zzzzzz', 0.12)).toBeNull()
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

/**
 * Dato de test: el valor de los dos colores que devuelve `textoSobre` en hex,
 * para que `contraste` pueda parsearlos (el oscuro es `--cp-texto`, rgb 15
 * 23 42).
 */
function resolverTexto(texto) {
  return texto === 'rgb(var(--cp-texto))' ? '#0f172a' : '#ffffff'
}

describe('textoSobre', () => {
  it('fondo oscuro: el texto se queda blanco', () => {
    expect(textoSobre('#0a3d91')).toBe('rgb(255 255 255)')
    expect(textoSobre('#1f6feb')).toBe('rgb(255 255 255)')
    expect(textoSobre('#3f4c5a')).toBe('rgb(255 255 255)')
  })

  it('fondo claro donde el blanco no llega a 4.5:1: texto oscuro', () => {
    expect(textoSobre('#bf8700')).toBe('rgb(var(--cp-texto))')
  })

  it('fondo donde el blanco si llega a 4.5:1: se queda blanco', () => {
    expect(textoSobre('#b45309')).toBe('rgb(255 255 255)')
    expect(textoSobre('#4d7c0f')).toBe('rgb(255 255 255)')
  })

  it('sin color valido, el blanco por defecto', () => {
    expect(textoSobre(null)).toBe('rgb(255 255 255)')
    expect(textoSobre('nada')).toBe('rgb(255 255 255)')
  })

  it('todos los colores de la paleta cerrada: el texto devuelto llega a 4.5:1', () => {
    for (const { hex, label } of PALETTE) {
      const texto = textoSobre(hex)
      const ratio = contraste(resolverTexto(texto), hex)
      expect(ratio, label).toBeGreaterThanOrEqual(4.5)
    }
  })
})
