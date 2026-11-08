import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PageHeader from '../components/common/PageHeader.vue'

describe('PageHeader', () => {
  it('el titulo va en el encabezado de primer nivel', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Panel' } })

    expect(wrapper.find('h1').text()).toBe('Panel')
  })

  it('el subtitulo va debajo del titulo', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Panel', subtitle: 'Estado de la organizacion.' },
    })

    const texto = wrapper.find('header').text()
    expect(texto).toContain('Panel')
    expect(texto).toContain('Estado de la organizacion.')
  })

  it('sin subtitulo no sale un parrafo vacio', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Panel' } })

    expect(wrapper.find('header p').exists()).toBe(false)
  })

  it('las acciones van en su hueco, a la derecha', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Panel' },
      slots: { actions: '<button type="button">Hoy</button>' },
    })

    expect(wrapper.find('button').text()).toBe('Hoy')
  })

  it('sin acciones no sale el hueco', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Panel' } })

    expect(wrapper.find('header button').exists()).toBe(false)
  })

  it('el titulo y el subtitulo tienen siempre el mismo aspecto', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Panel' } })

    expect(wrapper.find('h1').classes()).toContain('text-xl')
    expect(wrapper.find('h1').classes()).toContain('text-siemens-900')
  })
})
