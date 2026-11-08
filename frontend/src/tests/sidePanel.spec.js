import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import SidePanel from '../components/common/SidePanel.vue'

let montajes = []

function montar(props = {}) {
  const wrapper = mount(SidePanel, {
    props: { open: true, title: 'Detalle', ...props },
    slots: { default: '<p data-testid="contenido">Contenido</p>' },
    attachTo: document.body,
  })
  montajes.push(wrapper)
  return wrapper
}

afterEach(() => {
  for (const wrapper of montajes) wrapper.unmount()
  montajes = []
  document.body.style.overflow = ''
})

describe('SidePanel', () => {
  it('es un dialogo con su titulo', () => {
    const wrapper = montar()

    const dialogo = wrapper.get('[role="dialog"]')
    expect(dialogo.attributes('aria-modal')).toBe('true')
    expect(dialogo.attributes('aria-label')).toBe('Detalle')
    expect(wrapper.text()).toContain('Detalle')
  })

  it('el contenido va dentro del panel', () => {
    const wrapper = montar()

    expect(wrapper.get('[role="dialog"]').find('[data-testid="contenido"]').exists()).toBe(true)
  })

  it('cerrado no se ve', () => {
    const wrapper = montar({ open: false })

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('Esc pide el cierre', async () => {
    const wrapper = mount(SidePanel, {
      props: { open: true, title: 'Detalle' },
      attachTo: document.body,
    })
    montajes.push(wrapper)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('el boton Cerrar pide el cierre', async () => {
    const wrapper = montar()

    await wrapper.get('[data-testid="side-panel-close"]').trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('el subtitulo va bajo el titulo', () => {
    const wrapper = montar({ subtitle: '48 h de 40 h base' })

    const texto = wrapper.get('[role="dialog"]').text()
    expect(texto).toContain('Detalle')
    expect(texto).toContain('48 h de 40 h base')
  })

  it('sin subtitulo no sale un parrafo vacio', () => {
    const wrapper = montar()

    expect(wrapper.find('[data-testid="side-panel-subtitle"]').exists()).toBe(false)
  })

  it('el fondo deja de desplazarse mientras esta abierto', () => {
    montar()

    expect(document.body.style.overflow).toBe('hidden')
  })
})
