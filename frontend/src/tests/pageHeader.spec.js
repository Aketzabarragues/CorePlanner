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
      props: { title: 'Panel', subtitle: 'Estado de la organización.' },
    })

    const texto = wrapper.find('header').text()
    expect(texto).toContain('Panel')
    expect(texto).toContain('Estado de la organización.')
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

    expect(wrapper.find('h1').classes()).toContain('text-cp-titulo')
    expect(wrapper.find('h1').classes()).toContain('text-texto-marca')
  })

  it('los filtros van en su grupo, con el testid de la vista', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Gantt', filtersTestid: 'gantt-filters' },
      slots: { filters: '<select data-testid="filtro"></select>' },
    })

    const grupo = wrapper.get('[data-testid="gantt-filters"]')
    expect(grupo.find('select').exists()).toBe(true)
    expect(grupo.classes()).toContain('flex-wrap')
    expect(grupo.classes()).not.toContain('items-end')
  })

  it('sin filtros no sale el grupo ni el separador', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Panel' } })

    expect(wrapper.find('[data-testid="gantt-filters"]').exists()).toBe(false)
    expect(wrapper.find('header span[aria-hidden="true"]').exists()).toBe(false)
  })
})
