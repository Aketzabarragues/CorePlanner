import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'

import GanttRangePanel from '../components/gantt/GanttRangePanel.vue'
import { addDays, diffDays, parseIsoDate, toIsoDate } from '../utils/ganttScale'
import { localDateKey } from '../utils/month'
import { isoWeekKey, weekMonday } from '../utils/weeks'

function montar(props = {}) {
  return mount(GanttRangePanel, { props })
}

/**
 * Pulsar fuera del panel.
 *
 * El listener esta en `document`; un evento `click` que burbujea desde un
 * elemento ajeno al panel lo cierra, como un clic real fuera.
 */
function clicFuera() {
  const elemento = document.createElement('div')
  document.body.appendChild(elemento)
  elemento.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  elemento.remove()
}

describe('GanttRangePanel', () => {
  it('abre al pulsar el boton y se cierra al pulsar fuera', async () => {
    const wrapper = montar()
    expect(wrapper.find('[data-testid="gantt-range-panel"]').exists()).toBe(false)

    await wrapper.get('[data-testid="gantt-toggle-range"]').trigger('click')
    expect(wrapper.find('[data-testid="gantt-range-panel"]').exists()).toBe(true)

    clicFuera()
    await nextTick()
    expect(wrapper.find('[data-testid="gantt-range-panel"]').exists()).toBe(false)
  })

  it('reabrir lo rellena con el rango de las props', async () => {
    const wrapper = montar({ desde: '2026-11-02', hasta: '2026-11-15', texto: 'Del 2 de noviembre al 15 de noviembre' })

    await wrapper.get('[data-testid="gantt-toggle-range"]').trigger('click')

    expect(wrapper.get('[data-testid="gantt-range-from"]').element.value).toBe('2026-11-02')
    expect(wrapper.get('[data-testid="gantt-range-to"]').element.value).toBe('2026-11-15')
    expect(wrapper.get('[data-testid="gantt-range-texto"]').text()).toBe('Del 2 de noviembre al 15 de noviembre')
    expect(wrapper.get('[data-testid="gantt-range-modo"]').text()).toBe('Rango elegido')
  })

  it('el contador del boton suma los dias del rango elegido', () => {
    const wrapper = montar({ desde: '2026-11-02', hasta: '2026-11-15' })
    expect(wrapper.get('[data-testid="gantt-range-days"]').text()).toBe('14')

    const sinRango = montar()
    expect(sinRango.find('[data-testid="gantt-range-days"]').exists()).toBe(false)
  })

  it('Aplicar emite las dos fechas y cierra el panel', async () => {
    const wrapper = montar()

    await wrapper.get('[data-testid="gantt-toggle-range"]').trigger('click')
    await wrapper.get('[data-testid="gantt-range-from"]').setValue('2026-11-05')
    await wrapper.get('[data-testid="gantt-range-to"]').setValue('2026-11-10')
    await wrapper.get('[data-testid="gantt-range-apply"]').trigger('click')

    expect(wrapper.emitted('aplicar')).toEqual([[{ desde: '2026-11-05', hasta: '2026-11-10' }]])
    expect(wrapper.find('[data-testid="gantt-range-panel"]').exists()).toBe(false)
  })

  it('con un extremo sin fecha no emite y avisa en el panel', async () => {
    const wrapper = montar()

    await wrapper.get('[data-testid="gantt-toggle-range"]').trigger('click')
    await wrapper.get('[data-testid="gantt-range-from"]').setValue('2026-11-05')
    await wrapper.get('[data-testid="gantt-range-apply"]').trigger('click')

    expect(wrapper.find('[data-testid="gantt-range-error"]').text()).toBe('Elige las dos fechas del rango.')
    expect(wrapper.emitted('aplicar')).toBeUndefined()
    expect(wrapper.find('[data-testid="gantt-range-panel"]').exists()).toBe(true)
  })

  it('con el rango al reves no emite y avisa en el panel', async () => {
    const wrapper = montar()

    await wrapper.get('[data-testid="gantt-toggle-range"]').trigger('click')
    await wrapper.get('[data-testid="gantt-range-from"]').setValue('2026-11-10')
    await wrapper.get('[data-testid="gantt-range-to"]').setValue('2026-11-05')
    await wrapper.get('[data-testid="gantt-range-apply"]').trigger('click')

    expect(wrapper.find('[data-testid="gantt-range-error"]').text()).toBe(
      'El rango está al revés: la fecha inicial es posterior a la final.',
    )
    expect(wrapper.emitted('aplicar')).toBeUndefined()
  })

  it('Todo el plan emite rango vacio', async () => {
    const wrapper = montar()

    await wrapper.get('[data-testid="gantt-toggle-range"]').trigger('click')
    await wrapper.get('[data-testid="gantt-range-shortcut-plan"]').trigger('click')

    expect(wrapper.emitted('aplicar')).toEqual([[{ desde: '', hasta: '' }]])
    expect(wrapper.find('[data-testid="gantt-range-panel"]').exists()).toBe(false)
  })

  it('Esta semana emite la semana ISO en curso, de lunes a domingo', async () => {
    const lunes = weekMonday(isoWeekKey(parseIsoDate(localDateKey())))
    const esperado = { desde: toIsoDate(lunes), hasta: toIsoDate(addDays(lunes, 6)) }

    const wrapper = montar()
    await wrapper.get('[data-testid="gantt-toggle-range"]').trigger('click')
    await wrapper.get('[data-testid="gantt-range-shortcut-week"]').trigger('click')

    expect(wrapper.emitted('aplicar')).toEqual([[esperado]])
    // El lunes es lunes y el domingo es domingo: la semana ISO entera.
    expect(parseIsoDate(esperado.desde).getUTCDay()).toBe(1)
    expect(parseIsoDate(esperado.hasta).getUTCDay()).toBe(0)
  })

  it('Este mes emite el mes natural, del dia 1 al ultimo', async () => {
    const hoy = parseIsoDate(localDateKey())
    const primero = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1))
    const ultimo = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0))
    const esperado = { desde: toIsoDate(primero), hasta: toIsoDate(ultimo) }

    const wrapper = montar()
    await wrapper.get('[data-testid="gantt-toggle-range"]').trigger('click')
    await wrapper.get('[data-testid="gantt-range-shortcut-month"]').trigger('click')

    expect(wrapper.emitted('aplicar')).toEqual([[esperado]])
    expect(parseIsoDate(esperado.desde).getUTCDate()).toBe(1)
    expect(parseIsoDate(esperado.hasta).getUTCDate()).toBe(ultimo.getUTCDate())
    expect(diffDays(parseIsoDate(esperado.desde), parseIsoDate(esperado.hasta)) + 1).toBe(ultimo.getUTCDate())
  })

  it('Próximas 4 semanas emite hoy mas 28 dias naturales', async () => {
    const hoy = parseIsoDate(localDateKey())
    const esperado = { desde: toIsoDate(hoy), hasta: toIsoDate(addDays(hoy, 27)) }

    const wrapper = montar()
    await wrapper.get('[data-testid="gantt-toggle-range"]').trigger('click')
    await wrapper.get('[data-testid="gantt-range-shortcut-4weeks"]').trigger('click')

    expect(wrapper.emitted('aplicar')).toEqual([[esperado]])
    expect(parseIsoDate(esperado.desde).getTime()).toBe(hoy.getTime())
    expect(diffDays(parseIsoDate(esperado.desde), parseIsoDate(esperado.hasta))).toBe(27)
  })
})
