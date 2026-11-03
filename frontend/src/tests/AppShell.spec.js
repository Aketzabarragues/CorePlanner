import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import AppShell from '../components/AppShell.vue'

const Empty = { render: () => null }

const projects = [
  { id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active', department_id: 1 },
  { id: 2, name: 'Ampliacion linea 2', status: 'active', department_id: 2 },
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
        user: { id: 9, name: 'Admin', email: 'admin@example.com', is_global_admin: true },
      })
    }
    if (url.endsWith('/departments')) return jsonResponse(departments)
    if (url.endsWith('/projects')) return jsonResponse(projects)
    if (url.includes('/members')) return jsonResponse([])
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

function buildRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Empty },
      { path: '/login', name: 'login', component: Empty },
      { path: '/projects', name: 'projects', component: Empty },
      { path: '/projects/:id/capacity', name: 'capacity', component: Empty },
      { path: '/projects/:id/gantt', name: 'gantt', component: Empty },
      { path: '/projects/:id/kanban', name: 'kanban', component: Empty },
    ],
  })
}

async function mountShell(path = '/projects/1/kanban') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = buildRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(AppShell, { global: { plugins: [pinia, router] } })
  await flushPromises()
  await flushPromises()
  return { wrapper, router }
}

function tabOf(wrapper, label) {
  return wrapper.findAll('a').find((link) => link.text().includes(label))
}

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear()
    setupFetch()
  })

  it('muestra el nombre de la aplicacion', async () => {
    const { wrapper } = await mountShell()

    expect(wrapper.text()).toContain('CorePlanner')
  })

  it('el selector lista los proyectos', async () => {
    const { wrapper } = await mountShell()

    const select = wrapper.find('select')
    expect(select.exists()).toBe(true)
    const options = select.findAll('option').map((option) => option.text())
    expect(options).toHaveLength(2)
    expect(options[0]).toContain('Linea Pasteurizadora SIVE')
    expect(options[1]).toContain('Ampliacion linea 2')
  })

  it('el selector deja marcado el proyecto de la url', async () => {
    const { wrapper } = await mountShell('/projects/2/kanban')

    expect(wrapper.find('select').element.value).toBe('2')
  })

  it('sin proyecto en la url el selector ofrece elegir uno', async () => {
    const { wrapper } = await mountShell('/projects')

    const select = wrapper.find('select')
    expect(select.element.value).toBe('')
    expect(select.findAll('option')[0].text()).toBe('Elegir proyecto')
  })

  it('elegir un proyecto desde el listado abre su matriz', async () => {
    const { wrapper, router } = await mountShell('/projects')

    await wrapper.find('select').setValue('2')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/projects/2/capacity')
  })

  it('muestra el departamento del proyecto abierto', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    expect(wrapper.text()).toContain('Automatización & SCADA')
  })

  it('cambia la pila de departamento al cambiar de proyecto', async () => {
    const { wrapper, router } = await mountShell('/projects/1/kanban')

    await wrapper.find('select').setValue('2')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/projects/2/kanban')
    expect(wrapper.text()).toContain('Oficina Técnica / EPLAN')
  })

  it('marca la pestana de la vista activa', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    expect(tabOf(wrapper, 'Kanban').classes()).toContain('border-siemens-500')
    expect(tabOf(wrapper, 'Capacidad').classes()).toContain('border-transparent')
  })

  it('las pestanas llevan a las tres vistas del proyecto', async () => {
    const { wrapper, router } = await mountShell('/projects/1/kanban')

    await tabOf(wrapper, 'Gantt').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/projects/1/gantt')

    await tabOf(wrapper, 'Capacidad').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/projects/1/capacity')
  })

  it('muestra el nombre de quien esta dentro y su rol', async () => {
    const { wrapper } = await mountShell()

    expect(wrapper.text()).toContain('Admin')
    expect(wrapper.text()).toContain('Administrador global')
  })

  it('cerrar la sesion borra el token y lleva al acceso', async () => {
    const { wrapper, router } = await mountShell()

    const cerrar = wrapper.findAll('button').find((button) => button.text() === 'Cerrar sesion')
    await cerrar.trigger('click')
    await flushPromises()

    expect(localStorage.getItem('coreplanner_token')).toBeNull()
    expect(localStorage.getItem('coreplanner_signed_out')).toBe('1')
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
