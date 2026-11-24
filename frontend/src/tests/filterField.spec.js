import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FilterField from '../components/common/FilterField.vue'

const OPCIONES = [
  { value: '', label: 'Todos' },
  { value: '1', label: 'Alimentacion' },
  { value: '2', label: 'Energia' },
]

function montar(overrides = {}) {
  return mount(FilterField, {
    props: {
      label: 'Departamento',
      options: OPCIONES,
      modelValue: '',
      testid: 'capacity-filter-department',
      ...overrides,
    },
  })
}

describe('FilterField', () => {
  it('el select lleva el valor del modelValue y su testid', () => {
    const wrapper = montar()

    const select = wrapper.get('select')
    expect(select.attributes('value')).toBe('')
    expect(select.attributes('data-testid')).toBe('capacity-filter-department')
    expect(select.findAll('option').map((opcion) => opcion.text())).toEqual([
      'Todos',
      'Alimentacion',
      'Energia',
    ])

    const actualizado = montar({ modelValue: '2' })
    expect(actualizado.get('select').attributes('value')).toBe('2')
  })

  it('el label envuelve al select y nombra el campo', () => {
    const wrapper = montar()

    const label = wrapper.get('label')
    expect(label.text()).toContain('Departamento')
    expect(label.element.querySelector('select')).toBe(wrapper.get('select').element)
  })

  it('al cambiar el select emite update:modelValue con el valor nuevo', async () => {
    const wrapper = montar()

    await wrapper.get('select').setValue('2')

    expect(wrapper.emitted('update:modelValue')).toEqual([['2']])
  })
})
