import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import PageHeader from '../components/common/PageHeader.vue'

function grupos(wrapper) {
  const raiz = wrapper.get('[data-testid="vista-cabecera"]')
  // Dos grupos a lo sumo: el izquierdo (titulo + filtros) y el derecho (acciones).
  return { raiz, izquierdo: raiz.element.children[0], derecho: raiz.element.children[1] }
}

describe('PageHeader', () => {
  it('el titulo va en el encabezado de primer nivel', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Panel' } })

    expect(wrapper.find('h1').text()).toBe('Panel')
  })

  it('el texto de ayuda va en el boton de ayuda', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Panel', ayuda: 'Estado de la organización.' },
    })

    expect(wrapper.find('button[aria-label="Ayuda"]').exists()).toBe(true)
    expect(wrapper.find('[role="tooltip"]').text()).toContain(
      'Estado de la organización.',
    )
  })

  it('el grupo izquierdo lleva el titulo, y las acciones van en su grupo derecho', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Panel' },
      slots: { actions: '<button type="button">Hoy</button>' },
    })

    const { raiz, izquierdo, derecho } = grupos(wrapper)
    // Dos grupos: el izquierdo con el titulo y el derecho con las acciones.
    expect(raiz.element.children).toHaveLength(2)
    expect(izquierdo.querySelector('h1').textContent).toBe('Panel')
    // La accion no va suelta en la raiz: esta dentro del grupo derecho.
    expect(derecho.querySelector('button').textContent).toBe('Hoy')
    expect(izquierdo.querySelector('button')).toBeNull()
  })

  it('la raiz reparte los dos grupos con justify-between, sin estirar el izquierdo', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Panel' },
      slots: {
        filters: '<select data-testid="filtro"></select>',
        actions: '<button type="button">Hoy</button>',
      },
    })

    const { raiz, izquierdo } = grupos(wrapper)
    // `justify-between` es lo que pega el grupo derecho al borde cuando los
    // dos grupos caben en la linea, y lo deja a la izquierda si baja de linea.
    expect([...raiz.element.classList]).toContain('justify-between')
    // Si el grupo izquierdo se estirara (`flex-1`), las acciones nunca bajarian
    // de linea: el salto de linea decide el ancho natural del grupo.
    expect([...izquierdo.classList]).not.toContain('flex-1')
    expect([...izquierdo.classList]).toContain('flex-wrap')
  })

  it('los filtros van dentro del grupo izquierdo, antes que las acciones', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Gantt', filtersTestid: 'gantt-filters' },
      slots: {
        filters: '<select data-testid="filtro"></select>',
        actions: '<button type="button">Hoy</button>',
      },
    })

    const { raiz, izquierdo, derecho } = grupos(wrapper)
    const grupo = wrapper.get('[data-testid="gantt-filters"]')
    expect(grupo.element.tagName).toBe('DIV')
    expect(grupo.classes()).toContain('flex-wrap')
    // El grupo de filtros es hijo del izquierdo: cuando el izquierdo no cabe,
    // los filtros bajan de linea antes que las acciones.
    expect(grupo.element.parentElement).toBe(izquierdo)
    // Orden en la raiz: primero el grupo izquierdo (titulo + filtros) y
    // despues el de acciones.
    expect(raiz.element.children[0]).toBe(izquierdo)
    expect(raiz.element.children[1]).toBe(derecho)
  })

  it('sin acciones no sale el grupo derecho', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Panel' } })

    expect(wrapper.find('button').exists()).toBe(false)
    const { raiz } = grupos(wrapper)
    expect(raiz.element.children).toHaveLength(1)
  })

  it('el titulo lleva su aspecto', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Panel' } })

    expect(wrapper.find('h1').classes()).toContain('text-cp-titulo')
    expect(wrapper.find('h1').classes()).toContain('text-texto-marca')
  })

  it('sin filtros no sale el grupo ni el separador', () => {
    const wrapper = mount(PageHeader, { props: { title: 'Panel' } })

    expect(wrapper.find('[data-testid="gantt-filters"]').exists()).toBe(false)
    expect(wrapper.find('span[aria-hidden="true"]').exists()).toBe(false)
  })
})
