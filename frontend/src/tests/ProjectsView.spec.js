import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ProjectsView from '../views/ProjectsView.vue'

const projects = [
  {
    id: 1,
    name: 'Línea Pasteurizadora SIVE',
    status: 'active',
    department_id: 1,
    owner_name: 'Ana',
  },
  {
    id: 2,
    name: 'Ampliación linea 2',
    status: 'planning',
    department_id: 1,
    owner_name: 'Jorge',
  },
  {
    id: 3,
    name: 'Red de tuberias',
    status: 'active',
    department_id: 2,
    owner_name: 'Jorge',
  },
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

let router

async function mountView() {
  router = createRouter({
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

/** Nombres de los proyectos que se ven ahora mismo. */
function nombres(wrapper) {
  return wrapper.findAll('[data-testid="project-row"] a').map((link) => link.text())
}

describe('ProjectsView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
  })

  it('lista los proyectos agrupados por su departamento', async () => {
    const wrapper = await mountView()

    const grupos = wrapper.findAll('[data-testid="projects-group"]')
    expect(grupos).toHaveLength(2)
    expect(grupos[0].text()).toContain('Automatización & SCADA')
    expect(grupos[1].text()).toContain('Oficina Técnica / EPLAN')
    expect(wrapper.text()).toContain('Línea Pasteurizadora SIVE')
    expect(wrapper.text()).toContain('Red de tuberias')
  })

  it('la cabecera del grupo dice cuantos proyectos tiene y quien los lleva', async () => {
    const wrapper = await mountView()

    const cabeceras = wrapper.findAll('[data-testid="projects-group-summary"]')
    expect(cabeceras[0].text()).toContain('2 proyectos')
    expect(cabeceras[0].text()).toContain('responsable Ana')
    expect(cabeceras[1].text()).toContain('1 proyecto')
    expect(cabeceras[1].text()).toContain('responsable Jorge')
  })

  it('cada fila es una tabla con proyecto, responsable y estado', async () => {
    const wrapper = await mountView()

    const fila = wrapper.findAll('[data-testid="project-row"]')[0]
    expect(fila.element.tagName).toBe('TR')
    expect(fila.text()).toContain('Línea Pasteurizadora SIVE')
    expect(fila.text()).toContain('Ana')
    expect(fila.text()).toContain('Activo')
  })

  it('las filas no tienen botones de capacidad, Gantt ni Kanban', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).not.toContain('Capacidad')
    expect(wrapper.text()).not.toContain('Gantt')
    expect(wrapper.text()).not.toContain('Kanban')
    const enlaces = wrapper.findAll('a').map((link) => link.attributes('href'))
    expect(enlaces).toHaveLength(3)
    expect(enlaces.every((href) => href.startsWith('/projects/'))).toBe(true)
  })

  it('el nombre del proyecto sigue siendo un enlace a su pagina', async () => {
    const wrapper = await mountView()

    const enlace = wrapper.findAll('a').find((link) => link.text() === 'Línea Pasteurizadora SIVE')
    expect(enlace.attributes('href')).toBe('/projects/1')
  })

  it('pinchar en cualquier parte de la fila lleva al proyecto', async () => {
    const wrapper = await mountView()

    const fila = wrapper.findAll('[data-testid="project-row"]')[1]
    await fila.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('project')
    expect(router.currentRoute.value.params.id).toBe('2')
  })

  it('la fila se activa con el teclado', async () => {
    const wrapper = await mountView()

    const fila = wrapper.findAll('[data-testid="project-row"]')[0]
    expect(fila.attributes('tabindex')).toBe('0')
    expect(fila.attributes('role')).toBe('button')

    await fila.trigger('keydown.enter')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('project')
    expect(router.currentRoute.value.params.id).toBe('1')
  })

  it('el buscador deja solo los proyectos que coinciden por nombre', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="filter-search"]').setValue('tuberias')
    await flushPromises()

    expect(nombres(wrapper)).toEqual(['Red de tuberias'])
  })

  it('el buscador encuentra los nombres con tilde sin escribirlos', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="filter-search"]').setValue('linea')
    await flushPromises()

    expect(nombres(wrapper)).toEqual(['Línea Pasteurizadora SIVE', 'Ampliación linea 2'])
  })

  it('elegir un departamento deja solo esa seccion', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="filter-department"]').setValue('2')
    await flushPromises()

    const grupos = wrapper.findAll('[data-testid="projects-group"]')
    expect(grupos).toHaveLength(1)
    expect(grupos[0].text()).toContain('Oficina Técnica / EPLAN')
    expect(nombres(wrapper)).toEqual(['Red de tuberias'])
  })

  it('elegir un estado deja solo los proyectos con ese estado', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="filter-status"]').setValue('planning')
    await flushPromises()

    expect(nombres(wrapper)).toEqual(['Ampliación linea 2'])
  })

  it('los tres filtros se combinan', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="filter-search"]').setValue('linea')
    await wrapper.find('[data-testid="filter-department"]').setValue('1')
    await wrapper.find('[data-testid="filter-status"]').setValue('active')
    await flushPromises()

    expect(nombres(wrapper)).toEqual(['Línea Pasteurizadora SIVE'])
  })

  it('un filtro que no casa con nada avisa y deja quitar los filtros', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="filter-search"]').setValue('zzz')
    await flushPromises()

    expect(wrapper.find('[data-testid="projects-no-match"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="project-row"]')).toHaveLength(0)

    await wrapper.find('[data-testid="clear-filters"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="project-row"]')).toHaveLength(3)
  })
})
