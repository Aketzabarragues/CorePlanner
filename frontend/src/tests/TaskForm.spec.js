import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TaskForm from '../components/TaskForm.vue'

const members = [
  { user_id: 1, name: 'Ana', role_name: 'Project Manager' },
  { user_id: 2, name: 'Sebastián', role_name: 'Ingeniero' },
]

function montar(props = {}) {
  return mount(TaskForm, { props: { members, ...props } })
}

describe('TaskForm', () => {
  it('pinta los campos y da una opcion por miembro en "Asignada a"', () => {
    const wrapper = montar()

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('input[type="text"]').exists()).toBe(true)
    expect(wrapper.findAll('input[type="date"]')).toHaveLength(2)
    expect(wrapper.find('input[type="number"]').exists()).toBe(true)

    const opciones = wrapper.find('select').findAll('option')
    expect(opciones).toHaveLength(members.length + 1)
    expect(opciones.map((opcion) => opcion.text())).toContain('Ana (Project Manager)')
  })

  it('enviar sin titulo pinta el error y no emite save', async () => {
    const wrapper = montar()

    await wrapper.find('form').trigger('submit')

    expect(wrapper.text()).toContain('El título es obligatorio.')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('enviar con todo rellenado emite save con el payload esperado', async () => {
    const wrapper = montar()

    await wrapper.find('input[type="text"]').setValue('  Revisión del PLC  ')
    await wrapper.find('select').setValue(2)
    const fechas = wrapper.findAll('input[type="date"]')
    await fechas[0].setValue('2026-11-16')
    await fechas[1].setValue('2026-11-18')
    await wrapper.find('input[type="number"]').setValue('40')

    await wrapper.find('form').trigger('submit')

    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('save')[0][0]).toEqual({
      title: 'Revisión del PLC',
      assigned_to: 2,
      start_date: '2026-11-16',
      end_date: '2026-11-18',
      estimated_hours: '40.00',
    })
  })

  it('el form lleva el id que se le pasa por formId', () => {
    const porDefecto = montar()
    expect(porDefecto.find('form').attributes('id')).toBe('task-form')

    const explicit = montar({ formId: 'task-form-celda' })
    expect(explicit.find('form').attributes('id')).toBe('task-form-celda')
  })
})
