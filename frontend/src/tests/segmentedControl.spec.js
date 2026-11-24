import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SegmentedControl from '../components/common/SegmentedControl.vue'

const OPCIONES = [
  { value: 'Day', label: 'Día' },
  { value: 'Week', label: 'Semana' },
  { value: 'Month', label: 'Mes' },
]

function montar(overrides = {}) {
  return mount(SegmentedControl, {
    props: {
      options: OPCIONES,
      modelValue: 'Week',
      label: 'Escala temporal',
      testidPrefix: 'gantt-scale',
      ...overrides,
    },
  })
}

describe('SegmentedControl', () => {
  it('el grupo lleva role group y su nombre accesible', () => {
    const wrapper = montar()

    const grupo = wrapper.get('[role="group"]')
    expect(grupo.attributes('aria-label')).toBe('Escala temporal')
    expect(wrapper.findAll('button').map((boton) => boton.attributes('type'))).toEqual(
      ['button', 'button', 'button'],
    )
  })

  it('marca el boton activo con aria-pressed y el resto sin ella', () => {
    const wrapper = montar()

    const botones = wrapper.findAll('button')
    expect(botones.map((boton) => boton.attributes('aria-pressed'))).toEqual([
      'false',
      'true',
      'false',
    ])
    expect(wrapper.get('[data-testid="gantt-scale-Week"]').classes()).toContain(
      'bg-siemens-900',
    )
  })

  it('al pulsar un boton emite update:modelValue con su valor', async () => {
    const wrapper = montar()

    await wrapper.get('[data-testid="gantt-scale-Month"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([['Month']])
  })

  it('los testids salen del prefijo y no hay ninguno sin prefijo', () => {
    const wrapper = montar()

    expect(
      wrapper.findAll('button').map((boton) => boton.attributes('data-testid')),
    ).toEqual(['gantt-scale-Day', 'gantt-scale-Week', 'gantt-scale-Month'])

    const sinPrefijo = montar({ testidPrefix: '' })
    expect(
      sinPrefijo.findAll('button').map((boton) => boton.attributes('data-testid')),
    ).toEqual([undefined, undefined, undefined])
  })
})
