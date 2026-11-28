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

  it('la insignia sin tono se queda con su aspecto neutro por defecto', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Panel', contexto: { texto: 'Sin departamento' } },
    })

    const insignia = wrapper.find('.rounded-pastilla')
    expect(insignia.text()).toBe('Sin departamento')
    expect(insignia.classes()).toEqual(
      expect.arrayContaining(['border-borde', 'bg-tarjeta-suave', 'text-texto-suave']),
    )
    // Sin punto no sale el punto.
    expect(insignia.find('span[aria-hidden="true"]').exists()).toBe(false)
  })

  it('la insignia toma fondo, borde y texto del tono y el punto su color', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Calendario', contexto: { texto: 'Solo lectura', tono: 'aviso', punto: true } },
    })

    const insignia = wrapper.find('.rounded-pastilla')
    expect(insignia.text()).toBe('Solo lectura')
    expect(insignia.classes()).toEqual(
      expect.arrayContaining(['border-aviso-borde', 'bg-aviso-fondo', 'text-aviso-texto']),
    )
    expect(insignia.find('span[aria-hidden="true"]').classes()).toContain('bg-aviso-punto')
  })

  it('cada tono da su clase al fondo, al borde y al punto', () => {
    for (const tono of ['ok', 'peligro', 'info', 'neutro']) {
      const wrapper = mount(PageHeader, {
        props: { title: 'Panel', contexto: { texto: 'x', tono, punto: true } },
      })

      const insignia = wrapper.find('.rounded-pastilla')
      expect(insignia.classes()).toEqual(
        expect.arrayContaining([`border-${tono}-borde`, `bg-${tono}-fondo`, `text-${tono}-texto`]),
      )
      expect(insignia.find('span[aria-hidden="true"]').classes()).toContain(`bg-${tono}-punto`)
    }
  })

  it('con fila2: la insignia va al extremo derecho de la primera linea y la fila2 en la segunda', () => {
    const wrapper = mount(PageHeader, {
      props: {
        title: 'Calendario',
        contexto: { texto: 'Solo lectura', tono: 'aviso', punto: true },
      },
      slots: {
        filters: '<select data-testid="filtro"></select>',
        fila2: '<button type="button" data-testid="fila2">Mes</button>',
      },
    })

    const raiz = wrapper.get('[data-testid="vista-cabecera"]')
    expect(raiz.element.children).toHaveLength(2)
    const [filaUno, filaDos] = raiz.element.children
    // Titulo y filtros en la primera linea...
    expect(filaUno.querySelector('h1').textContent).toBe('Calendario')
    expect(filaUno.querySelector('[data-testid="filtro"]')).not.toBeNull()
    // ...la insignia al extremo derecho de la primera linea, no en la segunda.
    const insignia = filaUno.querySelector('.rounded-pastilla')
    expect(insignia.textContent).toContain('Solo lectura')
    expect(filaDos.querySelector('.rounded-pastilla')).toBeNull()
    // La fila2 va en la segunda linea.
    expect(filaDos.querySelector('[data-testid="fila2"]').textContent).toBe('Mes')
    expect(filaUno.querySelector('[data-testid="fila2"]')).toBeNull()
  })

  it('un punto sin tono toma el color neutro', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Panel', contexto: { texto: 'x', punto: true } },
    })

    expect(wrapper.find('.rounded-pastilla').find('span[aria-hidden="true"]').classes()).toContain(
      'bg-neutro-punto',
    )
  })

  it('el slot de contexto sigue pintandose dentro de la insignia, sin tonos propios', () => {
    const wrapper = mount(PageHeader, {
      props: { title: 'Panel' },
      slots: {
        contexto:
          'Periodo activo · <span data-testid="panel-period-range">S48 – S03</span>',
      },
    })

    const insignia = wrapper.find('.rounded-pastilla')
    expect(insignia.text()).toContain('Periodo activo ·')
    expect(insignia.text()).toContain('S48 – S03')
    expect(
      insignia.classes(),
    ).toEqual(expect.arrayContaining(['border-borde', 'bg-tarjeta-suave', 'text-texto-suave']))
  })
})
