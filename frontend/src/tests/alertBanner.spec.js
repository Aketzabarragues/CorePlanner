import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AlertBanner from '../components/common/AlertBanner.vue'

describe('AlertBanner', () => {
  it('muestra el mensaje del slot', () => {
    const wrapper = mount(AlertBanner, { slots: { default: 'Tarea «Cableado» creada.' } })

    expect(wrapper.text()).toContain('Tarea «Cableado» creada.')
  })

  it('el error se anuncia de inmediato', () => {
    const wrapper = mount(AlertBanner, {
      props: { variant: 'error' },
      slots: { default: 'No se ha podido cargar la matriz' },
    })

    expect(wrapper.attributes('role')).toBe('alert')
  })

  it('los demas avisos no interrumpen al lector de pantalla', () => {
    for (const variant of ['success', 'warning', 'info']) {
      const wrapper = mount(AlertBanner, { props: { variant }, slots: { default: 'Aviso' } })

      expect(wrapper.attributes('role')).toBe('status')
    }
  })

  it('cada variante lleva su icono', () => {
    const trazos = new Set()

    for (const variant of ['success', 'warning', 'info', 'error']) {
      const wrapper = mount(AlertBanner, { props: { variant } })

      expect(wrapper.find('svg').exists()).toBe(true)
      trazos.add(wrapper.find('svg path').attributes('d'))
    }

    expect(trazos.size).toBe(4)
  })

  it('el titulo va en su propia linea', () => {
    const wrapper = mount(AlertBanner, {
      props: { title: 'No se ha podido cargar la matriz' },
      slots: { default: 'El servidor ha respondido con un error.' },
    })

    const parrafos = wrapper.findAll('p')

    expect(parrafos).toHaveLength(2)
    expect(parrafos[0].text()).toBe('No se ha podido cargar la matriz')
    expect(parrafos[1].text()).toBe('El servidor ha respondido con un error.')
  })

  it('la accion aparece con su etiqueta y avisa al pulsar', async () => {
    const wrapper = mount(AlertBanner, { props: { actionLabel: 'Reintentar' } })

    const boton = wrapper.get('button')
    expect(boton.text()).toBe('Reintentar')

    await boton.trigger('click')

    expect(wrapper.emitted('action')).toHaveLength(1)
  })

  it('sin accion no hay boton', () => {
    const wrapper = mount(AlertBanner)

    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('un aviso descartable ofrece el boton de cerrar', async () => {
    const wrapper = mount(AlertBanner, { props: { dismissible: true } })

    const cerrar = wrapper.get('[title="Cerrar aviso"]')
    await cerrar.trigger('click')

    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('un aviso que no se descarta no ofrece el boton de cerrar', () => {
    const wrapper = mount(AlertBanner)

    expect(wrapper.find('[title="Cerrar aviso"]').exists()).toBe(false)
  })

  it('el mensaje no depende del color para entenderse', () => {
    const wrapper = mount(AlertBanner, {
      props: { variant: 'error', title: 'No se ha podido cargar la matriz' },
      slots: { default: 'El servidor ha respondido con un error (500).' },
    })

    expect(wrapper.text()).toContain('No se ha podido cargar la matriz')
    expect(wrapper.text()).toContain('(500)')
  })
})
