import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CapacityMatrix from '../components/CapacityMatrix.vue'

const report = {
  weeks: ['2026-W45', '2026-W46'],
  rows: [
    {
      user_id: 1,
      name: 'Ana',
      weekly_base_hours: 40,
      total_hours: 10,
      has_overload: false,
      cells: [
        { week: '2026-W45', hours: 10, is_overloaded: false },
        { week: '2026-W46', hours: 0, is_overloaded: false },
      ],
    },
    {
      user_id: 2,
      name: 'Sebastian',
      weekly_base_hours: 40,
      total_hours: 72,
      has_overload: true,
      cells: [
        { week: '2026-W45', hours: 24, is_overloaded: false },
        { week: '2026-W46', hours: 48, is_overloaded: true },
      ],
    },
  ],
}

function mockFetch() {
  global.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'tok-demo',
          token_type: 'bearer',
          user: { id: 9, name: 'Admin', email: 'admin@example.com' },
        }),
      }
    }
    if (url.endsWith('/projects')) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active' }],
      }
    }
    if (url.includes('/capacity')) {
      return { ok: true, status: 200, json: async () => report }
    }
    return { ok: false, status: 404, json: async () => ({ detail: 'no encontrado' }) }
  })
}

describe('CapacityMatrix', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    mockFetch()
  })

  it('hace login automatico y guarda el token', async () => {
    const wrapper = mount(CapacityMatrix, { global: { plugins: [createPinia()] } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Sebastian'))

    const loginCall = global.fetch.mock.calls.find(([url]) => url.endsWith('/auth/login'))
    expect(loginCall).toBeDefined()
    expect(localStorage.getItem('coreplanner_token')).toBe('tok-demo')
  })

  it('pinta en rojo la celda sobrecargada', async () => {
    const wrapper = mount(CapacityMatrix, { global: { plugins: [createPinia()] } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Sebastian'))

    const overloaded = wrapper.findAll('td.bg-red-200')
    expect(overloaded).toHaveLength(1)
    expect(overloaded[0].text()).toBe('48')
    expect(overloaded[0].classes()).toContain('text-red-900')
  })

  it('deja las celdas dentro de la base sin marcar', async () => {
    const wrapper = mount(CapacityMatrix, { global: { plugins: [createPinia()] } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Sebastian'))

    expect(wrapper.findAll('td.bg-red-200')).toHaveLength(1)
    expect(wrapper.findAll('td.bg-red-100')).toHaveLength(0)
  })

  it('muestra una celda por persona y semana', async () => {
    const wrapper = mount(CapacityMatrix, { global: { plugins: [createPinia()] } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Sebastian'))

    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers[1]).toBe('2026-W45')
    expect(headers[2]).toBe('2026-W46')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('muestra un aviso cuando hay sobrecarga', async () => {
    const wrapper = mount(CapacityMatrix, { global: { plugins: [createPinia()] } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Sebastian'))

    expect(wrapper.text()).toContain('En rojo')
  })

  it('informa cuando no hay proyectos visibles', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'tok', user: { name: 'Admin' } }),
        }
      }
      return { ok: true, status: 200, json: async () => [] }
    })

    const wrapper = mount(CapacityMatrix, { global: { plugins: [createPinia()] } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('No hay proyectos'))

    expect(wrapper.text()).toContain('backend/seed.py')
  })
})
