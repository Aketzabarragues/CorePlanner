import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PersonAvatar from '../components/common/PersonAvatar.vue'
import { NEUTRO_PILDORA, pildora } from '../utils/statusColor'

/** Hex a `rgb(r, g, b)`: como jsdom normaliza el estilo en el DOM. */
function aRgb(hex) {
  return `rgb(${[16, 8, 0]
    .map((shift) => (parseInt(hex.slice(1), 16) >> shift) & 0xff)
    .join(', ')})`
}

function montar(overrides = {}) {
  return mount(PersonAvatar, {
    props: {
      nombre: 'Ana García',
      ...overrides,
    },
  })
}

describe('PersonAvatar', () => {
  it('las iniciales salen de utils/people: dos letras con una palabra, una por palabra con varias', () => {
    expect(montar({ nombre: 'Ana' }).text()).toBe('AN')
    expect(montar({ nombre: 'Ana García' }).text()).toBe('AG')
    expect(montar({ nombre: 'ana garcia lopez' }).text()).toBe('AG')
  })

  it('el tamano por prop: sm, md por defecto y lg', () => {
    const sm = montar({ tamano: 'sm' })
    expect(sm.classes()).toContain('h-6')
    expect(sm.classes()).toContain('w-6')
    expect(sm.classes()).toContain('text-cp-micro')

    const md = montar()
    expect(md.classes()).toContain('h-8')
    expect(md.classes()).toContain('w-8')
    expect(md.classes()).toContain('text-cp-sm')

    const lg = montar({ tamano: 'lg' })
    expect(lg.classes()).toContain('h-10')
    expect(lg.classes()).toContain('w-10')
    expect(lg.classes()).toContain('text-cp-base')
  })

  it('con color, el estilo es la pildora: fondo pastel y texto con contraste', () => {
    const wrapper = montar({ color: '#005566' })

    const estilo = pildora('#005566')
    expect(wrapper.attributes('style')).toContain(`background-color: ${aRgb(estilo.backgroundColor)}`)
    expect(wrapper.attributes('style')).toContain(`color: ${aRgb(estilo.color)}`)
  })

  it('sin color, el neutro por token', () => {
    const wrapper = montar()

    expect(wrapper.attributes('style')).toContain(`background-color: ${NEUTRO_PILDORA.backgroundColor}`)
    expect(wrapper.attributes('style')).toContain(`color: ${NEUTRO_PILDORA.color}`)
  })

  it('es decorativo: aria-hidden, y hereda class desde fuera', () => {
    const wrapper = montar()
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(wrapper.classes()).toContain('rounded-avatar')
    expect(wrapper.classes()).toContain('shrink-0')

    // Herencia de la class de uso: la del apilado, junto a la del tamano.
    const apilado = mount(PersonAvatar, {
      props: { nombre: 'Ana' },
      attrs: { class: 'ring-2 ring-tarjeta' },
    })
    expect(apilado.classes()).toContain('ring-2')
    expect(apilado.classes()).toContain('ring-tarjeta')
    expect(apilado.classes()).toContain('h-8')
  })
})
