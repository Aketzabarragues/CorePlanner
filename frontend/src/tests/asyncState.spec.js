import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AsyncState from '../components/common/AsyncState.vue'

const CONTENIDO = 'Tabla de tareas'

function montar(props = {}, slots = {}) {
  return mount(AsyncState, {
    props,
    slots: { default: CONTENIDO, ...slots },
  })
}

describe('AsyncState', () => {
  it('cargando, se anuncia y no pinta el contenido', () => {
    const wrapper = montar({ loading: true })

    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain(CONTENIDO)
  })

  it('cargando, el esqueleto respeta la preferencia de reducir el movimiento', () => {
    const wrapper = montar({ loading: true })

    expect(wrapper.find('.motion-reduce\\:animate-none').exists()).toBe(true)
  })

  it('cargando, dice que esta cargando', () => {
    const wrapper = montar({ loading: true, loadingLabel: 'Cargando la matriz' })

    expect(wrapper.text()).toContain('Cargando la matriz')
  })

  it('con error, se anuncia de inmediato y no pinta el contenido', () => {
    const wrapper = montar({ error: 'No se ha podido cargar la matriz' })

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No se ha podido cargar la matriz')
    expect(wrapper.text()).not.toContain(CONTENIDO)
  })

  it('con error, ofrece reintentar', async () => {
    const wrapper = montar({ error: 'Fallo del servidor' })

    const boton = wrapper.get('button')
    expect(boton.text()).toBe('Reintentar')

    await boton.trigger('click')

    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('con error, el identificador de prueba queda en el aviso', () => {
    const wrapper = montar({ error: 'Fallo del servidor', errorTestId: 'panel-error' })

    expect(wrapper.find('[data-testid="panel-error"]').exists()).toBe(true)
  })

  it('vacio, sale el texto y la accion', () => {
    const wrapper = montar({
      empty: true,
      emptyTitle: 'Todavia no hay proyectos',
      emptyText: 'Crea el primero para empezar a planificar.',
      emptyAction: 'Crear proyecto',
    })

    expect(wrapper.text()).toContain('Todavia no hay proyectos')
    expect(wrapper.text()).toContain('Crea el primero para empezar a planificar.')
    expect(wrapper.text()).not.toContain(CONTENIDO)
  })

  it('vacio, la accion avisa al pulsarla', async () => {
    const wrapper = montar({ empty: true, emptyTitle: 'Todavia no hay proyectos', emptyAction: 'Crear proyecto' })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('empty-action')).toHaveLength(1)
  })

  it('sin estados, se pinta el contenido', () => {
    const wrapper = montar()

    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain(CONTENIDO)
  })

  it('el error manda sobre el estado vacio', () => {
    const wrapper = montar({ error: 'Fallo del servidor', empty: true, emptyTitle: 'Todavia no hay proyectos' })

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Todavia no hay proyectos')
  })

  it('cargando, el error aun no ha llegado', () => {
    const wrapper = montar({ loading: true, error: 'Fallo del servidor' })

    expect(wrapper.find('[role="status"]').exists()).toBe(true)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
})
