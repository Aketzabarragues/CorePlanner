import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PanelView from '../views/PanelView.vue'

const panel = {
  week: '2026-W45',
  is_current_week: true,
  planned_hours: 70,
  capacity_hours: 80,
  utilization: 88,
  overloaded: [
    {
      user_id: 3,
      name: 'Sebastián',
      week: '2026-W45',
      hours: 50,
      capacity: 40,
      excess_hours: 10,
    },
  ],
  projects_by_status: { active: 1, planning: 1 },
  tasks_by_status: { in_progress: 1, backlog: 2 },
  projects: [
    {
      id: 1,
      name: 'Linea Pasteurizadora SIVE',
      status: 'active',
      estimated_hours: 70,
      task_count: 2,
      people_count: 2,
    },
    {
      id: 2,
      name: 'Ampliacion linea 2',
      status: 'planning',
      estimated_hours: 8,
      task_count: 1,
      people_count: 1,
    },
  ],
  total_tasks: 3,
  total_people: 4,
}

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch(payload = panel) {
  global.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.endsWith('/panel')) return jsonResponse(payload)
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const wrapper = mount(PanelView, {
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('PanelView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
  })

  it('muestra la utilizacion de la semana de referencia', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-utilization"]').text()).toContain('88 %')
    expect(wrapper.text()).toContain('70 h planificadas')
    expect(wrapper.text()).toContain('80 h de capacidad')
    expect(wrapper.text()).toContain('2026-W45')
  })

  it('lista a quien supera su capacidad', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-overloaded-count"]').text()).toContain('1')
    const filas = wrapper.findAll('[data-testid="panel-overloaded-row"]')
    expect(filas).toHaveLength(1)
    expect(filas[0].text()).toContain('Sebastián')
    expect(filas[0].text()).toContain('50 h / 40 h')
    expect(filas[0].text()).toContain('10 h')
  })

  it('ordena los proyectos por carga', async () => {
    const wrapper = await mountView()

    const filas = wrapper.findAll('[data-testid="panel-project-row"]')
    expect(filas).toHaveLength(2)
    expect(filas[0].text()).toContain('Linea Pasteurizadora SIVE')
    expect(filas[0].text()).toContain('70 h')
    expect(filas[1].text()).toContain('Ampliacion linea 2')
  })

  it('cuenta los proyectos y las tareas por estado', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-projects-status"]').text()).toContain('Activo')
    expect(wrapper.find('[data-testid="panel-tasks-status"]').text()).toContain('En Desarrollo')
    expect(wrapper.text()).toContain('3')
  })

  it('avisa cuando no hay nada planificado', async () => {
    setupFetch({
      week: null,
      is_current_week: false,
      planned_hours: 0,
      capacity_hours: 0,
      utilization: null,
      overloaded: [],
      projects_by_status: {},
      tasks_by_status: {},
      projects: [],
      total_tasks: 0,
      total_people: 0,
    })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-utilization"]').text()).toContain('sin capacidad')
    expect(wrapper.text()).toContain('Nadie supera su capacidad en el período')
    expect(wrapper.text()).toContain('No hay proyectos visibles')
  })

  it('muestra el error si el servidor no responde', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ access_token: 'tok', token_type: 'bearer', user: {} })
      }
      return jsonResponse({ detail: 'Fallo del servidor' }, false, 500)
    })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-error"]').text()).toContain('Fallo del servidor')
  })
})
