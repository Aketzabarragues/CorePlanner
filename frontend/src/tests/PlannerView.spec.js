import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PlannerView from '../views/PlannerView.vue'

const capacity = {
  weeks: [
    { week: '2026-W46', holidays: [] },
    { week: '2026-W47', holidays: [] },
  ],
  rows: [
    {
      user_id: 2,
      name: 'Ana',
      weekly_base_hours: 40,
      total_hours: 55,
      has_overload: true,
      cells: [
        { week: '2026-W46', hours: 10, capacity: 40, is_overloaded: false },
        { week: '2026-W47', hours: 45, capacity: 40, is_overloaded: true },
      ],
    },
    {
      user_id: 3,
      name: 'Jorge',
      weekly_base_hours: 40,
      total_hours: 16,
      has_overload: false,
      cells: [
        { week: '2026-W46', hours: 16, capacity: 40, is_overloaded: false },
        { week: '2026-W47', hours: 0, capacity: 40, is_overloaded: false },
      ],
    },
  ],
}

const tasks = [
  {
    id: 1,
    project_id: 1,
    assigned_to: 2,
    title: 'Programacion SCADA',
    status: 'in_progress',
    start_date: '2026-11-09',
    end_date: '2026-11-13',
    estimated_hours: 20,
  },
  {
    id: 2,
    project_id: 2,
    assigned_to: 2,
    title: 'Cableado de campo',
    status: 'backlog',
    start_date: '2026-11-09',
    end_date: '2026-11-10',
    estimated_hours: 8,
  },
  {
    id: 3,
    project_id: 1,
    assigned_to: 3,
    title: 'Schemas',
    status: 'backlog',
    start_date: '2026-11-09',
    end_date: '2026-11-20',
    estimated_hours: 30,
  },
]

const projects = [
  { id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active', department_id: 1 },
  { id: 2, name: 'Red de tuberias linea 2', status: 'active', department_id: 1 },
]

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch() {
  const llamadas = []
  global.fetch = vi.fn(async (url, options = {}) => {
    llamadas.push({ url, method: options.method ?? 'GET', body: options.body })
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.includes('/capacity')) return jsonResponse(capacity)
    if (url.includes('/projects')) return jsonResponse(projects)
    if (url.includes('/tasks')) return jsonResponse(tasks)
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
  return llamadas
}

async function mountView() {
  const wrapper = mount(PlannerView, {
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('PlannerView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('muestra la carga por persona y semana', async () => {
    setupFetch()

    const wrapper = await mountView()

    expect(wrapper.findAll('[data-testid="planner-row"]')).toHaveLength(2)
    const matriz = wrapper.find('[data-testid="planner-matrix"]').text()
    expect(matriz).toContain('Ana')
    expect(matriz).toContain('10')
    expect(matriz).toContain('45')
    expect(matriz).toContain('113%')
  })

  it('lista las asignaciones por persona con sus tareas', async () => {
    setupFetch()

    const wrapper = await mountView()

    const filas = wrapper.findAll('[data-testid="planner-assignment"]')
    expect(filas.length).toBeGreaterThan(0)
    expect(filas[0].text()).toContain('Ana')
    expect(filas[0].text()).toContain('2026-W46')
    expect(filas[0].text()).toContain('Programacion SCADA')
  })

  it('la vista por persona lista las tareas de cada celda', async () => {
    setupFetch()

    const wrapper = await mountView()
    await wrapper.find('[data-testid="planner-view-person"]').trigger('click')

    const chips = wrapper.findAll('[data-testid="planner-task"]')
    // Ana tiene dos tareas en la primera semana y Jorge una que cruza las dos.
    expect(chips).toHaveLength(4)
    expect(chips[0].text()).toContain('Programacion SCADA')
    expect(chips.filter((chip) => chip.text().includes('Schemas'))).toHaveLength(2)
  })

  it('la tabla de planificacion reparte por proyecto', async () => {
    setupFetch()

    const wrapper = await mountView()
    await wrapper.find('[data-testid="planner-view-table"]').trigger('click')

    const reparto = wrapper.findAll('[data-testid="planner-split"]')
    expect(reparto.length).toBeGreaterThan(0)
    expect(reparto[0].text()).toContain('Linea Pasteurizadora SIVE ×1')
  })

  it('arrastrar una tarea a otra persona la reasigna', async () => {
    const llamadas = setupFetch()

    const wrapper = await mountView()
    await wrapper.find('[data-testid="planner-view-person"]').trigger('click')

    const tarea = wrapper.findAll('[data-testid="planner-task"]')[0]
    await tarea.trigger('dragstart', {
      dataTransfer: { setData: vi.fn(), effectAllowed: '' },
    })
    // La segunda celda es la de Jorge en la primera semana.
    await wrapper.findAll('[data-testid="planner-drop"]')[2].trigger('drop')
    await flushPromises()

    const parche = llamadas.find((llamada) => llamada.method === 'PATCH')
    expect(parche).toBeDefined()
    expect(parche.url).toContain('/api/tasks/1')
    expect(JSON.parse(parche.body)).toEqual({ assigned_to: 3 })
  })

  it('al cambiar las tareas se recarga sin perder la vista activa', async () => {
    const llamadas = setupFetch()

    const wrapper = await mountView()
    await wrapper.find('[data-testid="planner-view-table"]').trigger('click')
    const tareasAntes = llamadas.filter((llamada) => llamada.url.includes('/tasks')).length

    const { useProjectsStore } = await import('../stores/projects')
    useProjectsStore().notifyTasksChanged()
    await flushPromises()
    await flushPromises()

    // La vista se queda en la pestana de la tabla: ya no se remonta.
    expect(wrapper.findAll('[data-testid="planner-split"]').length).toBeGreaterThan(0)
    // Y los datos se vuelven a pedir.
    const tareasDespues = llamadas.filter((llamada) => llamada.url.includes('/tasks')).length
    expect(tareasDespues).toBeGreaterThan(tareasAntes)
  })

  it('avisa cuando el servidor no responde', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ access_token: 'tok', token_type: 'bearer', user: {} })
      }
      return jsonResponse({ detail: 'Fallo del servidor' }, false, 500)
    })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="planner-error"]').text()).toContain('Fallo del servidor')
  })
})
