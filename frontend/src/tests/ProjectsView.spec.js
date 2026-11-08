import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ProjectsView from '../views/ProjectsView.vue'

const projects = [
  { id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active', department_id: 1 },
  { id: 2, name: 'Red de tuberias linea 2', status: 'on_hold', department_id: 2 },
]

const departments = [
  { id: 1, name: 'Automatización & SCADA', manager_id: 1, manager_name: 'Ana' },
  { id: 2, name: 'Oficina Técnica / EPLAN', manager_id: 3, manager_name: 'Jorge' },
]

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch() {
  global.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok-demo',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.endsWith('/projects')) return jsonResponse(projects)
    if (url.endsWith('/departments')) return jsonResponse(departments)
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects', name: 'projects', component: { template: '<div />' } },
      { path: '/projects/:id', name: 'project', component: { template: '<div />' } },
      { path: '/capacity', name: 'capacity', component: { template: '<div />' } },
      { path: '/gantt', name: 'gantt', component: { template: '<div />' } },
      { path: '/projects/:id/kanban', name: 'kanban', component: { template: '<div />' } },
    ],
  })
  await router.push('/projects')
  await router.isReady()

  const wrapper = mount(ProjectsView, {
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('ProjectsView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
  })

  it('lista los proyectos agrupados por su departamento', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Linea Pasteurizadora SIVE')
    expect(wrapper.text()).toContain('Red de tuberias linea 2')
    expect(wrapper.text()).toContain('Automatización & SCADA')
    expect(wrapper.text()).toContain('Oficina Técnica / EPLAN')
  })

  it('el nombre del proyecto lleva a su pagina', async () => {
    const wrapper = await mountView()

    const enlace = wrapper.findAll('a').find((link) => link.text() === 'Linea Pasteurizadora SIVE')
    expect(enlace.attributes('href')).toBe('/projects/1')
  })

  it('los enlaces de capacidad y Gantt llevan el filtro del proyecto', async () => {
    const wrapper = await mountView()

    const capacidad = wrapper.findAll('a').find((link) => link.text() === 'Capacidad')
    const gantt = wrapper.findAll('a').find((link) => link.text() === 'Gantt')

    // El filtro viaja en la query: el parametro de la ruta no vale, porque
    // estas vistas ya no son del proyecto.
    expect(capacidad.attributes('href')).toBe('/capacity?project=1')
    expect(gantt.attributes('href')).toBe('/gantt?project=1')
  })

  it('el enlace del tablero lleva a la pestana del proyecto', async () => {
    const wrapper = await mountView()

    const kanban = wrapper.findAll('a').find((link) => link.text() === 'Kanban')
    expect(kanban.attributes('href')).toBe('/projects/1/kanban')
  })
})
