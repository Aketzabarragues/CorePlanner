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
  { id: 1, name: 'Automatización & SCADA', manager_id: 1, manager_name: 'Ana', color: '#005566' },
  { id: 2, name: 'Oficina Técnica / EPLAN', manager_id: 3, manager_name: 'Jorge', color: '#1f6feb' },
]

const summaries = [
  {
    id: 1,
    members: [
      { user_id: 3, name: 'Aketza' },
      { user_id: 2, name: 'Ana' },
    ],
    tasks_total: 4,
    tasks_done: 1,
    load: {
      week: '2026-W46',
      planned_hours: 30,
      capacity_hours: 40,
      utilization: 75,
      overloaded: false,
    },
  },
  {
    id: 2,
    members: [{ user_id: 6, name: 'Jorge' }],
    tasks_total: 2,
    tasks_done: 2,
    load: {
      week: '2026-W46',
      planned_hours: 50,
      capacity_hours: 40,
      utilization: 125,
      overloaded: true,
    },
  },
  {
    id: 3,
    members: [],
    tasks_total: 0,
    tasks_done: 0,
    load: {
      week: '2026-W46',
      planned_hours: 0,
      capacity_hours: 0,
      utilization: null,
      overloaded: false,
    },
  },
]

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch(overrides = {}) {
  global.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok-demo',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.endsWith('/projects/summary')) {
      if (overrides.summaryError) return jsonResponse({ detail: 'fallo' }, false, 500)
      return jsonResponse(overrides.summaries ?? summaries)
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

/** Cards de proyecto que se ven ahora mismo, en el orden de la rejilla. */
function cards(wrapper) {
  return wrapper.findAll('[data-testid="project-card"]')
}

/** Nombres de los proyectos que se ven ahora mismo. */
function nombres(wrapper) {
  return cards(wrapper).map((card) => card.find('h3').text())
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

  it('cada proyecto es una card con nombre, responsable, estado, tareas y carga', async () => {
    const wrapper = await mountView()

    expect(cards(wrapper)).toHaveLength(3)
    const card = cards(wrapper)[0]
    expect(card.element.tagName).toBe('ARTICLE')
    expect(card.find('h3').text()).toBe('Línea Pasteurizadora SIVE')
    expect(card.text()).toContain('Ana')
    expect(card.text()).toContain('Activo')
    expect(card.find('[data-testid="project-tasks"]').text()).toContain('1/4')
    expect(card.find('[data-testid="project-load"]').text()).toBe('75 %')
  })

  it('la card no lleva enlaces ni botones por dentro', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).not.toContain('Capacidad')
    expect(wrapper.text()).not.toContain('Gantt')
    expect(wrapper.text()).not.toContain('Kanban')
    const card = cards(wrapper)[0]
    expect(card.findAll('a')).toHaveLength(0)
    expect(card.findAll('button')).toHaveLength(0)
  })

  it('pinchar en cualquier parte de la card lleva al proyecto', async () => {
    const wrapper = await mountView()

    const card = cards(wrapper)[1]
    await card.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('project')
    expect(router.currentRoute.value.params.id).toBe('2')
  })

  it('la card se activa con el teclado', async () => {
    const wrapper = await mountView()

    const card = cards(wrapper)[0]
    expect(card.attributes('tabindex')).toBe('0')
    expect(card.attributes('role')).toBe('button')

    await card.trigger('keydown.enter')
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
    expect(cards(wrapper)).toHaveLength(0)

    await wrapper.find('[data-testid="clear-filters"]').trigger('click')
    await flushPromises()

    expect(cards(wrapper)).toHaveLength(3)
  })

  it('cada seccion de area es una rejilla de cards, una por proyecto', async () => {
    const wrapper = await mountView()

    // Una card por proyecto: la tabla de filas desaparecio.
    expect(wrapper.findAll('table')).toHaveLength(0)
    expect(cards(wrapper)).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="projects-group"]')).toHaveLength(2)

    // Rejilla: 1 columna en estrecha, 2 en mediana, 3 en ancha.
    const rejilla = wrapper.find('[data-testid="projects-group"]').find('.grid')
    expect(rejilla.classes()).toContain('grid-cols-1')
    expect(rejilla.classes()).toContain('sm:grid-cols-2')
    expect(rejilla.classes()).toContain('xl:grid-cols-3')
    const cardsPrimerGrupo = wrapper.find('[data-testid="projects-group"]').findAll('[data-testid="project-card"]')
    expect(cardsPrimerGrupo).toHaveLength(2)
  })

  it('el equipo, las tareas y la carga salen del resumen', async () => {
    const wrapper = await mountView()

    const card = cards(wrapper)[0]
    const avatares = card.findAll('[data-testid="project-member"]')
    expect(avatares).toHaveLength(2)
    expect(avatares[0].text()).toBe('AK')
    expect(avatares[0].attributes('title')).toBe('Aketza')
    expect(card.find('[data-testid="project-tasks"]').text()).toContain('1/4')
    expect(card.find('[data-testid="project-load"]').text()).toBe('75 %')
    expect(card.find('[data-testid="project-overloaded"]').exists()).toBe(false)
  })

  it('un proyecto cuya carga supera la capacidad avisa', async () => {
    const wrapper = await mountView()

    const card = cards(wrapper)[1]

    expect(card.find('[data-testid="project-overloaded"]').exists()).toBe(true)
    expect(card.find('[data-testid="project-overloaded"]').text()).toBe('Sobrecargado')
  })

  it('un proyecto sin equipo ni tareas muestra cero y sin capacidad', async () => {
    const wrapper = await mountView()

    const card = cards(wrapper)[2]

    expect(card.find('[data-testid="project-member"]').exists()).toBe(false)
    expect(card.find('[data-testid="project-tasks"]').text()).toContain('0/0')
    expect(card.find('[data-testid="project-load-unknown"]').text()).toBe('Sin capacidad')
  })

  it('si el resumen no llega, el listado sigue en pie', async () => {
    setupFetch({ summaryError: true })

    const wrapper = await mountView()

    expect(cards(wrapper)).toHaveLength(3)
    const card = cards(wrapper)[0]
    expect(card.find('[data-testid="project-member"]').exists()).toBe(false)
    expect(card.find('[data-testid="project-tasks"]').text()).toContain('0/0')
  })

  it('los avatares del equipo se apilan y resumen los que sobran', async () => {
    setupFetch({
      summaries: [
        {
          ...summaries[0],
          members: [
            { user_id: 2, name: 'Ana' },
            { user_id: 3, name: 'Aketza' },
            { user_id: 4, name: 'Héctor' },
            { user_id: 5, name: 'Carlos' },
            { user_id: 7, name: 'Juan' },
          ],
        },
      ],
    })

    const wrapper = await mountView()

    const card = cards(wrapper)[0]
    expect(card.findAll('[data-testid="project-member"]')).toHaveLength(4)
    expect(card.find('[data-testid="project-members-rest"]').text()).toBe('+1')
  })

  it('la franja de la card y los avatares salen con el color del departamento en linea', async () => {
    const wrapper = await mountView()

    const card = cards(wrapper)[0]
    const franja = card.find('.rounded-pastilla')
    expect(franja.attributes('style')).toContain('background-color: rgb(0, 85, 102)')

    // El avatar del equipo sale con el color del grupo mezclado: la pildora.
    const avatar = card.find('[data-testid="project-member"]')
    expect(avatar.attributes('style')).toContain('background-color: rgb(224, 235, 237)')
  })
})
