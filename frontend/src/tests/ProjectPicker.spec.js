import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ProjectPicker from '../components/ProjectPicker.vue'

const projects = [
  { id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active', department_id: 1 },
  { id: 2, name: 'Red de tuberias linea 2', status: 'on_hold', department_id: 2 },
]

const departments = [
  { id: 1, name: 'Automatización & SCADA' },
  { id: 2, name: 'Oficina Técnica / EPLAN' },
]

function mountPicker(props = {}) {
  return mount(ProjectPicker, {
    props: { projects, departments, currentId: 1, ...props },
    attachTo: document.body,
  })
}

describe('ProjectPicker', () => {
  it('muestra el proyecto abierto con su departamento', () => {
    const wrapper = mountPicker()

    expect(wrapper.text()).toContain('Linea Pasteurizadora SIVE')
    expect(wrapper.text()).toContain('Automatización & SCADA')
  })

  it('avisa cuando no hay ningun proyecto visible', () => {
    const wrapper = mountPicker({ projects: [], currentId: null })

    expect(wrapper.text()).toContain('Sin proyecto')
  })

  it('abre la lista de proyectos al pulsar el boton', async () => {
    const wrapper = mountPicker()

    expect(wrapper.find('[role=listbox]').exists()).toBe(false)

    await wrapper.find('button').trigger('click')

    expect(wrapper.find('[role=listbox]').exists()).toBe(true)
    expect(wrapper.findAll('[role=option]')).toHaveLength(2)
  })

  it('marca como seleccionado el proyecto abierto', async () => {
    const wrapper = mountPicker()

    await wrapper.find('button').trigger('click')

    const opciones = wrapper.findAll('[role=option]')
    expect(opciones[0].attributes('aria-selected')).toBe('true')
    expect(opciones[1].attributes('aria-selected')).toBe('false')
  })

  it('elige un proyecto y cierra la lista', async () => {
    const wrapper = mountPicker()

    await wrapper.find('button').trigger('click')
    await wrapper.findAll('[role=option]')[1].trigger('click')

    expect(wrapper.emitted('select')).toEqual([[2]])
    expect(wrapper.find('[role=listbox]').exists()).toBe(false)
  })

  it('cierra la lista al pulsar fuera', async () => {
    const wrapper = mountPicker()

    await wrapper.find('button').trigger('click')
    expect(wrapper.find('[role=listbox]').exists()).toBe(true)

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[role=listbox]').exists()).toBe(false)
  })

  it('en modo compacto solo muestra el icono', async () => {
    const wrapper = mountPicker({ compact: true })

    expect(wrapper.text()).not.toContain('Linea Pasteurizadora SIVE')

    await wrapper.find('button').trigger('click')
    expect(wrapper.findAll('[role=option]')).toHaveLength(2)
  })
})
