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

  it('sin etiquetaVisible la etiqueta es para el lector de pantalla', () => {
    const wrapper = montar()

    const span = wrapper.get('label span')
    expect(span.classes()).toContain('sr-only')
    expect(span.text()).toBe('Departamento')
  })

  it('con etiquetaVisible la etiqueta se ve a la izquierda, nunca encima', () => {
    const wrapper = montar({ etiquetaVisible: true })

    const label = wrapper.get('label')
    expect(label.classes()).toContain('inline-flex')
    expect(label.classes()).not.toContain('flex-col')

    const span = wrapper.get('label span')
    expect(span.classes()).not.toContain('sr-only')
    expect(span.text()).toBe('Departamento')
  })

  it('el desplegable lleva el ancho pasado por prop y el title con el valor', () => {
    const wrapper = montar({ ancho: 'max-w-[160px]', modelValue: '2' })

    const select = wrapper.get('select')
    expect(select.classes()).toContain('max-w-[160px]')
    expect(select.attributes('title')).toBe('Departamento: Energia')
  })

  it('sin prop de ancho el desplegable queda en el maximo por defecto', () => {
    const wrapper = montar()

    expect(wrapper.get('select').classes()).toContain('max-w-[176px]')
  })
})
