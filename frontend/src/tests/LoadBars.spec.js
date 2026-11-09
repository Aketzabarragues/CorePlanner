import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LoadBars from '../components/LoadBars.vue'

const semanas = [
  { week: '2026-W45', hours: 40, capacity: 40, utilization: 100, holidays: [] },
  { week: '2026-W46', hours: 45.28, capacity: 40, utilization: 113, is_overloaded: true, holidays: [] },
  { week: '2026-W47', hours: 22.72, capacity: 36, utilization: 63, holidays: [{ name: 'Formacion interna', half_day: true }] },
]

function montar(props = {}) {
  return mount(LoadBars, { props: { weeks: semanas, ...props } })
}

describe('LoadBars', () => {
  it('las columnas se anclan arriba para que la linea del 100 % no se mueva', () => {
    const wrapper = montar()

    // Con items-end, una columna sin badges se empujaba hacia abajo y su caja
    // de grafico (y la linea del 100 %) quedaba mas baja que las demas.
    expect(wrapper.attributes('class')).toContain('items-start')
    expect(wrapper.attributes('class')).not.toContain('items-end')
  })

  it('el triangulo de sobrecarga tiene tamano fijo', () => {
    const wrapper = montar()

    // AppIcon dibuja el SVG con h-full w-full: sin un tamano en el contenedor
    // que lo envuelve, el icono sale con su tamano intrinseco.
    const triangulo = wrapper.find('span[aria-hidden="true"]')
    expect(triangulo.exists()).toBe(true)
    expect(triangulo.classes()).toContain('h-3.5')
    expect(triangulo.classes()).toContain('w-3.5')
  })

  it('solo la semana sobrecargada lleva el triangulo', () => {
    const wrapper = montar()

    const triangulos = wrapper.findAll('span[aria-hidden="true"]')
    expect(triangulos).toHaveLength(1)
  })

  it('cada columna tiene su caja de grafico con la misma altura', () => {
    const wrapper = montar({ height: 136 })

    const cajas = wrapper.findAll('[data-testid="load-bars-bar"]')
    expect(cajas).toHaveLength(3)
    for (const caja of cajas) {
      expect(caja.element.parentElement.style.height).toBe('136px')
    }
  })

  it('la linea del 100 % esta a la misma altura en todas las cajas', () => {
    const wrapper = montar()

    const lineas = wrapper.findAll('.border-dashed')
    expect(lineas).toHaveLength(3)
    for (const linea of lineas) {
      expect(linea.element.style.bottom).toBe('73.52941176470588%')
    }
  })

  it('el grafico es una imagen con su descripcion', () => {
    const wrapper = montar({ title: 'Carga por semana' })

    expect(wrapper.attributes('role')).toBe('img')
    expect(wrapper.attributes('aria-label')).toContain('semana 45')
    expect(wrapper.attributes('aria-label')).toContain('113 %')
  })
})
