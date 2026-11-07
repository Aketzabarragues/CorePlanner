import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import WorkCalendarView from '../views/WorkCalendarView.vue'

const informe = {
  days: [
    {
      id: 1,
      date: '2026-11-02',
      name: 'Todos los Santos',
      scope: 'global',
      department_id: null,
      department_name: null,
      user_id: null,
      user_name: null,
      half_day: false,
      affected_task_count: 6,
    },
    {
      id: 2,
      date: '2026-11-16',
      name: 'Formacion interna',
      scope: 'department',
      department_id: 1,
      department_name: 'Automatizacion & SCADA',
      user_id: null,
      user_name: null,
      half_day: true,
      affected_task_count: 3,
    },
    {
      id: 3,
      date: '2026-11-23',
      name: 'Permiso individual',
      scope: 'person',
      department_id: null,
      department_name: null,
      user_id: 5,
      user_name: 'Marta Ruiz',
      half_day: false,
      affected_task_count: 1,
    },
  ],
  impact: [
    {
      user_id: 5,
      user_name: 'Marta Ruiz',
      week: '2026-W46',
      capacity_without: 40,
      capacity_effective: 32,
      difference: 8,
      reasons: ['Todos los Santos'],
    },
  ],
}

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch({ payload = informe, status = 200 } = {}) {
  const llamadas = []
  global.fetch = vi.fn(async (url) => {
    llamadas.push(url)
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.includes('/work-calendar')) {
      return jsonResponse(payload, status < 400, status)
    }
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
  return llamadas
}

async function mountView() {
  const wrapper = mount(WorkCalendarView, {
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('WorkCalendarView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lista los dias no laborables con su alcance y las tareas afectadas', async () => {
    setupFetch()

    const wrapper = await mountView()

    const filas = wrapper.findAll('[data-testid="labor-day"]')
    expect(filas).toHaveLength(3)
    expect(filas[0].text()).toContain('Todos los Santos')
    expect(filas[0].text()).toContain('Global')
    expect(filas[0].text()).toContain('6')
    expect(filas[1].text()).toContain('Automatizacion & SCADA')
    expect(filas[1].text()).toContain('Media jornada')
    expect(filas[2].text()).toContain('Marta Ruiz')
  })

  it('muestra el impacto en la capacidad semanal', async () => {
    setupFetch()

    const wrapper = await mountView()

    const filas = wrapper.findAll('[data-testid="labor-impact-row"]')
    expect(filas).toHaveLength(1)
    expect(filas[0].text()).toContain('Marta Ruiz')
    expect(filas[0].text()).toContain('2026-W46')
    expect(filas[0].text()).toContain('Todos los Santos')
    expect(filas[0].text()).toContain('40.00')
    expect(filas[0].text()).toContain('32.00')
    expect(filas[0].text()).toContain('8.00')
  })

  it('marca los dias no laborables en la rejilla del mes', async () => {
    setupFetch()

    const wrapper = await mountView()

    const marcados = wrapper.findAll('[data-testid="labor-month-day"]')
    expect(marcados).toHaveLength(3)
    expect(marcados[0].text()).toContain('Todos los Santos')
    expect(marcados[0].classes()).toContain('bg-slate-200')
    expect(marcados[1].classes()).toContain('bg-amber-100')
    expect(marcados[2].classes()).toContain('bg-violet-100')
  })

  it('pide el informe de nuevo al cambiar de mes', async () => {
    const llamadas = setupFetch()

    const wrapper = await mountView()
    const antes = llamadas.filter((url) => url.includes('/work-calendar')).length

    await wrapper.find('[data-testid="labor-next"]').trigger('click')
    await flushPromises()
    await flushPromises()

    const despues = llamadas.filter((url) => url.includes('/work-calendar')).length
    expect(despues).toBe(antes + 1)
    expect(wrapper.find('[data-testid="labor-month"]').text()).toBe('Diciembre 2026')
  })

  it('avisa cuando no hay dias no laborables', async () => {
    setupFetch({ payload: { days: [], impact: [] } })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="labor-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="labor-impact-empty"]').exists()).toBe(true)
  })

  it('muestra el error si el servidor no responde', async () => {
    setupFetch({ payload: { detail: 'Fallo del servidor' }, status: 500 })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="labor-error"]').text()).toContain('Fallo del servidor')
  })
})
