import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CapacityMatrix from '../components/CapacityMatrix.vue'

const members = [
  { user_id: 1, name: 'Ana', email: 'ana@example.com', role_id: 1, role_name: 'Project Manager', weekly_base_hours: 40 },
  { user_id: 2, name: 'Sebastian', email: 's@example.com', role_id: 2, role_name: 'Ingeniero', weekly_base_hours: 40 },
]

const capacityReport = {
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

const projectTasks = [
  { id: 10, project_id: 1, assigned_to: 2, title: 'Puesta en marcha', status: 'todo', start_date: '2026-11-09', end_date: '2026-11-11', estimated_hours: 12 },
  { id: 11, project_id: 1, assigned_to: 1, title: 'Esquemas EPLAN', status: 'todo', start_date: '2026-11-02', end_date: '2026-11-04', estimated_hours: 10 },
]

const departments = [
  { id: 1, name: 'Automatización & SCADA', manager_id: 1, manager_name: 'Ana' },
  { id: 2, name: 'Oficina Técnica / EPLAN', manager_id: 3, manager_name: 'Jorge' },
]

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch(overrides = {}) {
  const calls = []
  global.fetch = vi.fn(async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', body: options.body })
    if (overrides[url]) return overrides[url](options)
    if (url.endsWith('/auth/login')) {
      return jsonResponse({ access_token: 'tok-demo', token_type: 'bearer', user: { id: 9, name: 'Admin' } })
    }
    if (url.includes('/capacity')) return jsonResponse(capacityReport)
    if (url.includes('/members')) return jsonResponse(members)
    if (url.includes('/tasks')) return jsonResponse(projectTasks)
    if (url.endsWith('/departments')) return jsonResponse(departments)
    if (url.endsWith('/projects')) {
      return jsonResponse([
        { id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active', department_id: 1 },
        { id: 2, name: 'Ampliacion linea 2', status: 'active', department_id: 2 },
      ])
    }
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
  return calls
}

async function mountMatrix(props = {}) {
  const wrapper = mount(CapacityMatrix, { props, global: { plugins: [createPinia()] } })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('CapacityMatrix', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('hace login automatico y guarda el token', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    expect(wrapper.text()).toContain('Sebastian')
    expect(localStorage.getItem('coreplanner_token')).toBe('tok-demo')
  })

  it('pinta en rojo la celda sobrecargada', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    const overloaded = wrapper.findAll('td.bg-red-200')
    expect(overloaded).toHaveLength(1)
    expect(overloaded[0].text()).toBe('48')
    expect(overloaded[0].classes()).toContain('text-red-900')
  })

  it('el alta de tareas no se duplica en la matriz', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    // El alta vive en la cabecera del armazon, no dentro de la matriz.
    expect(wrapper.text()).not.toContain('Nueva Tarea')
    expect(wrapper.findAll('button').filter((b) => b.text().includes('Nueva'))).toHaveLength(0)
  })

  it('al pulsar una celda abre el desglose de tareas', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    const celda = wrapper.findAll('tbody td button').find((b) => b.text() === '48')
    await celda.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Sebastian en 2026-W46')
    expect(wrapper.text()).toContain('Puesta en marcha')
  })

  it('el desglose permite editar una tarea', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix()

    const celda = wrapper.findAll('tbody td button').find((b) => b.text() === '48')
    await celda.trigger('click')
    await flushPromises()

    const editar = wrapper.findAll('button').find((b) => b.text() === 'Editar')
    await editar.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Editar tarea')

    await wrapper.find('input[type="number"]').setValue('6')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body).estimated_hours).toBe('6.00')
  })

  it('el selector de reasignar solo aparece en una tarea', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    const celda = wrapper.findAll('tbody td button').find((b) => b.text() === '48')
    await celda.trigger('click')
    await flushPromises()

    const reasignar = wrapper.findAll('button').find((b) => b.text() === 'Reasignar')
    await reasignar.trigger('click')
    await flushPromises()

    // Un solo selector abierto, no uno por tarea.
    const selects = wrapper.findAll('select')
    expect(selects).toHaveLength(1)
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Mover')).toHaveLength(1)
  })

  it('el desglose permite reasignar una tarea a otra persona', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix()

    const celda = wrapper.findAll('tbody td button').find((b) => b.text() === '48')
    await celda.trigger('click')
    await flushPromises()

    const reasignar = wrapper.findAll('button').find((b) => b.text() === 'Reasignar')
    await reasignar.trigger('click')
    await flushPromises()

    // Se abre un selector con el resto de miembros del proyecto.
    const select = wrapper.findAll('select').at(-1)
    expect(select.exists()).toBe(true)
    expect(select.findAll('option').map((o) => o.text())).toContain('Ana')

    const mover = wrapper.findAll('button').find((b) => b.text() === 'Mover')
    await mover.trigger('click')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body).assigned_to).toBe(1)
  })

  it('el desglose permite eliminar una tarea', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix()

    const celda = wrapper.findAll('tbody td button').find((b) => b.text() === '48')
    await celda.trigger('click')
    await flushPromises()

    const eliminar = wrapper.findAll('button').find((b) => b.text() === 'Eliminar')
    await eliminar.trigger('click')
    await flushPromises()

    const del = calls.find((c) => c.method === 'DELETE')
    expect(del).toBeDefined()
    expect(del.url).toContain('/tasks/10')
  })

  it('informa cuando no hay proyectos visibles', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ access_token: 'tok', user: { name: 'Admin' } })
      }
      return jsonResponse([])
    })

    const wrapper = await mountMatrix()
    expect(wrapper.text()).toContain('No hay proyectos')
    expect(wrapper.text()).toContain('backend/seed.py')
  })

  it('al cambiar de proyecto vuelve a pedir la matriz de ese proyecto', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix({ id: 1 })

    await wrapper.setProps({ id: 2 })
    await flushPromises()
    await flushPromises()

    const urls = calls.filter((call) => call.url.includes('/capacity')).map((call) => call.url)
    expect(urls.some((url) => url.includes('/projects/1/capacity'))).toBe(true)
    expect(urls.some((url) => url.includes('/projects/2/capacity'))).toBe(true)
  })
})
