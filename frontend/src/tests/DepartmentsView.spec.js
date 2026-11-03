import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import DepartmentsView from '../views/DepartmentsView.vue'

const departments = [
  { id: 1, name: 'Automatización & SCADA', manager_id: 1, manager_name: 'Ana' },
  { id: 2, name: 'Oficina Técnica / EPLAN', manager_id: 3, manager_name: 'Jorge' },
]

const projects = [
  { id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active', department_id: 1 },
  { id: 2, name: 'Red de tuberias linea 2', status: 'on_hold', department_id: 2 },
  { id: 3, name: 'Ampliacion linea 3', status: 'active', department_id: null },
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
    if (url.endsWith('/departments')) return jsonResponse(departments)
    if (url.endsWith('/projects')) return jsonResponse(projects)
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/projects/:id', name: 'project', component: { render: () => null } }],
  })
  await router.push('/projects/1')
  await router.isReady()
  const wrapper = mount(DepartmentsView, {
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('DepartmentsView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
  })

  it('lista los departamentos con su responsable', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Automatización & SCADA')
    expect(wrapper.text()).toContain('Oficina Técnica / EPLAN')
    expect(wrapper.text()).toContain('Responsable: Ana')
    expect(wrapper.text()).toContain('Responsable: Jorge')
  })

  it('coloca bajo cada departamento sus proyectos', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Linea Pasteurizadora SIVE')
    expect(wrapper.text()).toContain('Red de tuberias linea 2')
    expect(wrapper.text()).toContain('Activo')
    expect(wrapper.text()).toContain('Pausado')
  })

  it('deja aparte los proyectos sin departamento', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Sin departamento')
    expect(wrapper.text()).toContain('Ampliacion linea 3')
  })

  it('enlaza cada proyecto con su resumen', async () => {
    const wrapper = await mountView()

    const enlace = wrapper.findAll('a').find((a) => a.text().includes('Linea Pasteurizadora'))
    expect(enlace.attributes('href')).toBe('/projects/1')
  })
})
