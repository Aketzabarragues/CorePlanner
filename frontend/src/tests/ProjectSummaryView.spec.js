import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ProjectSummaryView from '../views/ProjectSummaryView.vue'

const departments = [
  { id: 1, name: 'Automatización & SCADA', manager_id: 1, manager_name: 'Ana' },
]

const projects = [
  {
    id: 1,
    name: 'Linea Pasteurizadora SIVE',
    status: 'active',
    department_id: 1,
    owner_id: 1,
    owner_name: 'Ana Beltrán',
  },
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
  {
    user_id: 2,
    name: 'Jorge',
    email: 'jorge@example.com',
    role_id: 2,
    role_name: 'Ingeniero',
    weekly_base_hours: 40,
  },
]

const capacityReport = {
  weeks: [
    { week: '2026-W45', holidays: [] },
    { week: '2026-W46', holidays: [] },
  ],
  rows: [
    {
      user_id: 1,
      name: 'Ana',
      weekly_base_hours: 40,
      total_hours: 24,
      has_overload: false,
      cells: [
        { week: '2026-W45', hours: 16, is_overloaded: false },
        { week: '2026-W46', hours: 8, is_overloaded: false },
      ],
    },
    {
      user_id: 2,
      name: 'Jorge',
      weekly_base_hours: 40,
      total_hours: 8,
      has_overload: false,
      cells: [
        { week: '2026-W45', hours: 8, is_overloaded: false },
        { week: '2026-W46', hours: 0, is_overloaded: false },
      ],
    },
  ],
}

const tasks = [
  { id: 1, project_id: 1, assigned_to: 1, title: 'Programacion SCADA', status: 'in_progress' },
  { id: 2, project_id: 1, assigned_to: 2, title: 'Planos', status: 'backlog' },
  { id: 3, project_id: 1, assigned_to: 1, title: 'Pruebas', status: 'done' },
]

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
    if (url.includes('/tasks')) return jsonResponse(tasks)
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
      { path: '/projects/:id/kanban', name: 'kanban', component: { render: () => null } },
      { path: '/projects/:id/tasks', name: 'task-list', component: { render: () => null } },
      { path: '/projects/:id/members', name: 'members', component: { render: () => null } },
      { path: '/projects/:id/settings', name: 'project-settings', component: { render: () => null } },
      { path: '/capacity', name: 'capacity', component: { render: () => null } },
      { path: '/gantt', name: 'gantt', component: { render: () => null } },
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
  return { wrapper, router }
}

describe('ProjectSummaryView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
  })

  it('muestra el nombre, el departamento, el estado y el responsable', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('Linea Pasteurizadora SIVE')
    expect(wrapper.text()).toContain('Automatización & SCADA')
    expect(wrapper.find('[data-testid="project-status"]').text()).toContain('Activo')
    expect(wrapper.text()).toContain('Ana Beltrán')
  })

  it('ofrece las secciones del proyecto', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="project-tab-resumen"]').attributes('href')).toBe(
      '/projects/1',
    )
    expect(wrapper.find('[data-testid="project-tab-tablero"]').attributes('href')).toBe(
      '/projects/1/kanban',
    )
    expect(wrapper.find('[data-testid="project-tab-lista"]').attributes('href')).toBe(
      '/projects/1/tasks',
    )
    expect(wrapper.find('[data-testid="project-tab-miembros"]').attributes('href')).toBe(
      '/projects/1/members',
    )
    expect(wrapper.find('[data-testid="project-tab-ajustes"]').attributes('href')).toBe(
      '/projects/1/settings',
    )
  })

  it('enlaza con la capacidad y el Gantt filtrados por proyecto', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="project-go-capacity"]').attributes('href')).toBe(
      '/capacity?project=1',
    )
    expect(wrapper.find('[data-testid="project-go-gantt"]').attributes('href')).toBe(
      '/gantt?project=1',
    )
  })

  it('el enlace al Gantt lleva de verdad a la vista con el filtro', async () => {
    const { wrapper, router } = await mountView()

    await wrapper.find('[data-testid="project-go-gantt"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/gantt')
    expect(router.currentRoute.value.query.project).toBe('1')
  })

  it('el enlace a la capacidad lleva de verdad a la vista con el filtro', async () => {
    const { wrapper, router } = await mountView()

    await wrapper.find('[data-testid="project-go-capacity"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/capacity')
    expect(router.currentRoute.value.query.project).toBe('1')
  })

  it('cuenta las tareas por estado', async () => {
    const { wrapper } = await mountView()

    const contadores = wrapper.findAll('[data-testid="project-status-count"]')
    expect(contadores).toHaveLength(4)
    expect(contadores[0].text()).toContain('Backlog')
    expect(contadores[0].text()).toContain('1')
    expect(contadores[1].text()).toContain('En Desarrollo')
    expect(contadores[1].text()).toContain('1')
    expect(contadores[3].text()).toContain('Completado')
    expect(contadores[3].text()).toContain('1')
  })

  it('enseña las horas del proyecto por semana', async () => {
    const { wrapper } = await mountView()

    const grafico = wrapper.find('[data-testid="project-week-bars"]')
    expect(grafico.exists()).toBe(true)
    expect(grafico.attributes('aria-label')).toContain('semana 45')
    expect(grafico.attributes('aria-label')).toContain('24 horas')
  })

  it('lista el equipo con su rol y sus horas', async () => {
    const { wrapper } = await mountView()

    const equipo = wrapper.findAll('[data-testid="project-team-row"]')
    expect(equipo).toHaveLength(2)
    expect(equipo[0].text()).toContain('Ana')
    expect(equipo[0].text()).toContain('Project Manager')
    expect(equipo[0].text()).toContain('24 h')
    expect(equipo[1].text()).toContain('Jorge')
    expect(equipo[1].text()).toContain('Ingeniero')
  })
})
