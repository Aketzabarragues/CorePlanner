import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ProjectSummaryView from '../views/ProjectSummaryView.vue'

const departments = [
  { id: 1, name: 'Automatización & SCADA', manager_id: 1, manager_name: 'Ana' },
]

const projects = [
  { id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active', department_id: 1 },
]

const members = [
  {
    user_id: 1,
    name: 'Ana',
    email: 'ana@example.com',
    role_id: 1,
    role_name: 'Project Manager',
    weekly_base_hours: 40,
  },
]

const capacityReport = {
  weeks: ['2026-W45'],
  rows: [
    {
      user_id: 1,
      name: 'Ana',
      weekly_base_hours: 40,
      total_hours: 24,
      has_overload: false,
      cells: [{ week: '2026-W45', hours: 24, is_overloaded: false }],
    },
  ],
}

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch() {
  global.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.includes('/capacity')) return jsonResponse(capacityReport)
    if (url.includes('/members')) return jsonResponse(members)
    if (url.endsWith('/departments')) return jsonResponse(departments)
    if (url.endsWith('/projects')) return jsonResponse(projects)
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects/:id', name: 'project', component: { render: () => null } },
      { path: '/projects/:id/capacity', name: 'capacity', component: { render: () => null } },
      { path: '/projects/:id/gantt', name: 'gantt', component: { render: () => null } },
      { path: '/projects/:id/kanban', name: 'kanban', component: { render: () => null } },
      { path: '/projects/:id/members', name: 'members', component: { render: () => null } },
      { path: '/projects/:id/settings', name: 'settings', component: { render: () => null } },
    ],
  })
  await router.push('/projects/1')
  await router.isReady()
  const wrapper = mount(ProjectSummaryView, {
    props: { id: 1 },
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('ProjectSummaryView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
  })

  it('muestra el nombre del proyecto y su departamento', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Linea Pasteurizadora SIVE')
    expect(wrapper.text()).toContain('Automatización & SCADA')
  })

  it('resume estado, personas y horas cargadas', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Activo')
    expect(wrapper.text()).toContain('24 h')
  })

  it('enseña el reparto de carga', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('24 h de 40 h base')
  })

  it('ofrece las vistas del proyecto', async () => {
    const wrapper = await mountView()

    const enlaces = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(enlaces).toContain('/projects/1/capacity')
    expect(enlaces).toContain('/projects/1/kanban')
  })
})
