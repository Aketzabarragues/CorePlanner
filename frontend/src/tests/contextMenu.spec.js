import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import ContextMenu from '../components/common/ContextMenu.vue'

const ITEMS = [
  { label: 'Abrir detalle', accion: 'detalle', dato: 10 },
  { label: 'Ir al tablero', accion: 'tablero' },
  {
    label: 'Reasignar a...',
    accion: 'reasignar',
    submenu: [
      { label: 'Ana', accion: 'reasignar', dato: { persona: 1 } },
      { label: 'Jorge', accion: 'reasignar', dato: { persona: 2 } },
    ],
  },
  { label: 'Copiar las fechas', accion: 'copiar', disabled: true },
]

// Con attachTo en document.body: jsdom no mueve document.activeElement en
// montajes sueltos, y el foco de apertura/cierre del menu lo exige.
function montar(overrides = {}) {
  return mount(ContextMenu, {
    attachTo: document.body,
    props: {
      items: ITEMS,
      x: 120,
      y: 80,
      label: 'Menú de la tarea',
      ...overrides,
    },
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('ContextMenu', () => {
  it('el menu lleva role menu y su nombre accesible, y los items role menuitem', () => {
    const wrapper = montar()

    const menu = wrapper.get('[data-testid="context-menu"]')
    expect(menu.attributes('role')).toBe('menu')
    expect(menu.attributes('aria-label')).toBe('Menú de la tarea')

    const items = wrapper.findAll('[data-testid="context-menu-item"]')
    expect(items).toHaveLength(4)
    for (const item of items) {
      expect(item.attributes('role')).toBe('menuitem')
    }
  })

  it('los items desactivados se distinguen con aria-disabled y el resto no lleva la marca', () => {
    const wrapper = montar()

    const items = wrapper.findAll('[data-testid="context-menu-item"]')
    expect(items.map((item) => item.attributes('aria-disabled'))).toEqual([
      undefined,
      undefined,
      undefined,
      'true',
    ])
  })

  it('el foco entra en el menu al abrirse y vuelve al abridor al cerrarse', async () => {
    const abridor = document.createElement('button')
    document.body.appendChild(abridor)
    const wrapper = montar({ abridor })
    await flushPromises()

    // El foco entra solo en el menu: al primer item habilitado.
    expect(document.activeElement).toBe(
      wrapper.findAll('[data-testid="context-menu-item"]')[0].element,
    )

    await wrapper.get('[data-testid="context-menu"]').trigger('keydown', { key: 'Escape' })
    expect(document.activeElement).toBe(abridor)
    abridor.remove()
  })

  it('la flecha abajo mueve la seleccion y salta los desactivados', async () => {
    const wrapper = montar()
    await flushPromises()
    expect(wrapper.findAll('[data-testid="context-menu-item"]')).toHaveLength(4)

    const foco = () => {
      const activos = wrapper.findAll('[data-testid="context-menu-item"]')
      return activos.findIndex((item) => item.element === document.activeElement)
    }

    expect(foco()).toBe(0)
    await wrapper.get('[data-testid="context-menu"]').trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    expect(foco()).toBe(1)
    await wrapper.get('[data-testid="context-menu"]').trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    expect(foco()).toBe(2)
    // El item 3 esta desactivado: se salta y la flecha da la vuelta al 0.
    await wrapper.get('[data-testid="context-menu"]').trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    expect(foco()).toBe(0)
  })

  it('Enter emite select con el item y close', async () => {
    const wrapper = montar()
    await flushPromises()

    // Enter y Espacio en un boton producen el clic nativo: ese es el camino
    // de activacion que el menu no re-implementa.
    await wrapper.findAll('[data-testid="context-menu-item"]')[1].trigger('click')

    expect(wrapper.emitted('select')).toEqual([
      [{ label: 'Ir al tablero', accion: 'tablero' }],
    ])
    expect(wrapper.emitted('close')).toEqual([[]])
  })

  it('un item desactivado no emite select aunque se pulse', async () => {
    const wrapper = montar()
    await flushPromises()

    await wrapper.findAll('[data-testid="context-menu-item"]')[3].trigger('click')

    expect(wrapper.emitted('select')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('Escape emite close', async () => {
    const wrapper = montar()
    await flushPromises()

    await wrapper.get('[data-testid="context-menu"]').trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('close')).toEqual([[]])
    expect(wrapper.emitted('select')).toBeUndefined()
  })

  it('ArrowRight abre el submenu del item activo y el foco entra en el', async () => {
    const wrapper = montar()
    await flushPromises()

    await wrapper.findAll('[data-testid="context-menu-item"]')[2].trigger('focus')
    await wrapper
      .get('[data-testid="context-menu"]')
      .trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()

    const submenu = wrapper.get('[data-testid="context-menu-submenu"]')
    expect(submenu.attributes('role')).toBe('menu')
    expect(submenu.attributes('aria-label')).toBe('Reasignar a...')
    const hijos = submenu.findAll('[data-testid="context-menu-item"]')
    expect(hijos.map((item) => item.text())).toEqual(['Ana', 'Jorge'])
    expect(document.activeElement).toBe(hijos[0].element)
    // El item que lo abre se marca como abierto.
    expect(
      wrapper.findAll('[data-testid="context-menu-item"]')[2].attributes('aria-expanded'),
    ).toBe('true')
  })

  it('ArrowLeft cierra el submenu y el foco vuelve al item que lo abrio', async () => {
    const wrapper = montar()
    await flushPromises()

    await wrapper.findAll('[data-testid="context-menu-item"]')[2].trigger('focus')
    await wrapper
      .get('[data-testid="context-menu"]')
      .trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    expect(wrapper.get('[data-testid="context-menu-submenu"]').exists()).toBe(true)

    await wrapper.get('[data-testid="context-menu"]').trigger('keydown', { key: 'ArrowLeft' })
    await flushPromises()

    expect(wrapper.find('[data-testid="context-menu-submenu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(
      wrapper.findAll('[data-testid="context-menu-item"]')[2].element,
    )
  })
})
