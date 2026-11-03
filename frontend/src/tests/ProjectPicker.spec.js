import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ProjectPicker from '../components/ProjectPicker.vue'

const projects = [
  { id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active', department_id: 1 },
  { id: 2, name: 'Red de tuberias linea 2', status: 'on_hold', department_id: 2 },
  { id: 3, name: 'Ampliacion linea 3', status: 'active', department_id: 1 },
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

  it('en el espacio global muestra la vista global', () => {
    const wrapper = mountPicker({ currentId: null })

    expect(wrapper.text()).toContain('Todos los proyectos')
    expect(wrapper.text()).toContain('Vista global')
  })

  it('avisa cuando no hay ningun proyecto visible', () => {
    const wrapper = mountPicker({ projects: [], currentId: null })

    expect(wrapper.text()).toContain('Sin proyectos')
  })

  it('abre la lista de proyectos al pulsar el boton', async () => {
    const wrapper = mountPicker()

    expect(wrapper.find('[role=listbox]').exists()).toBe(false)

    await wrapper.find('button').trigger('click')

    expect(wrapper.find('[role=listbox]').exists()).toBe(true)
  })

  it('ofrece el espacio global como primera opcion', async () => {
    const wrapper = mountPicker()

    await wrapper.find('button').trigger('click')

    const opciones = wrapper.findAll('[role=option]')
    expect(opciones[0].text()).toContain('Todos los proyectos')
  })

  it('elige el espacio global y avisa con null', async () => {
    const wrapper = mountPicker()

    await wrapper.find('button').trigger('click')
    await wrapper.findAll('[role=option]')[0].trigger('click')

    expect(wrapper.emitted('select')).toEqual([[null]])
    expect(wrapper.find('[role=listbox]').exists()).toBe(false)
  })

  it('agrupa los proyectos por departamento', async () => {
    const wrapper = mountPicker()

    await wrapper.find('button').trigger('click')

    const texto = wrapper.find('[role=listbox]').text()
    expect(texto).toContain('Automatización & SCADA')
    expect(texto).toContain('Oficina Técnica / EPLAN')
    expect(wrapper.findAll('[role=option]')).toHaveLength(4)
  })

  it('marca como seleccionado el proyecto abierto', async () => {
    const wrapper = mountPicker()

    await wrapper.find('button').trigger('click')

    const opciones = wrapper.findAll('[role=option]')
    expect(opciones[0].attributes('aria-selected')).toBe('false')
    expect(opciones[1].attributes('aria-selected')).toBe('true')
  })

  it('marca el espacio global cuando es el contexto abierto', async () => {
    const wrapper = mountPicker({ currentId: null })

    await wrapper.find('button').trigger('click')

    expect(wrapper.findAll('[role=option]')[0].attributes('aria-selected')).toBe('true')
  })

  it('elige un proyecto y cierra la lista', async () => {
    const wrapper = mountPicker()

    await wrapper.find('button').trigger('click')
    // El primero es el espacio global; despues van los proyectos agrupados
    // por departamento, y el ultimo pertenece al segundo departamento.
    await wrapper.findAll('[role=option]')[3].trigger('click')

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
})
