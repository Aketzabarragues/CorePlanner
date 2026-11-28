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

/** Filas de proyecto que se ven ahora mismo, en el orden de las tablas. */
function filas(wrapper) {
  return wrapper.findAll('[data-testid="project-row"]')
}

/** Nombres de los proyectos que se ven ahora mismo. */
function nombres(wrapper) {
  return filas(wrapper).map((fila) => fila.attributes('aria-label').replace('. Abrir proyecto', ''))
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

  it('la cabecera del grupo dice cuantos proyectos tiene, quien los lleva y las horas', async () => {
    const wrapper = await mountView()

    const cabeceras = wrapper.findAll('[data-testid="projects-group-summary"]')
    expect(cabeceras[0].text()).toContain('2 proyectos')
    expect(cabeceras[0].text()).toContain('responsable')
    expect(cabeceras[0].text()).toContain('Ana')
    expect(cabeceras[1].text()).toContain('1 proyecto')
    expect(cabeceras[1].text()).toContain('responsable')
    expect(cabeceras[1].text()).toContain('Jorge')

    const horas = wrapper.findAll('[data-testid="projects-group-hours"]')
    expect(horas[0].text()).toContain('80')
    expect(horas[0].text()).toContain('h planificadas')
    expect(horas[1].text()).toContain('0')
    expect(horas[1].text()).toContain('h planificadas')
  })

  it('cada grupo de departamento es un bloque con su tabla', async () => {
    const wrapper = await mountView()

    const grupos = wrapper.findAll('[data-testid="projects-group"]')
    expect(grupos).toHaveLength(2)
    expect(grupos[0].findAll('table')).toHaveLength(1)
    expect(grupos[1].findAll('table')).toHaveLength(1)

    const filasPrimerGrupo = grupos[0].findAll('[data-testid="project-row"]')
    expect(filasPrimerGrupo).toHaveLength(2)
    expect(filas(wrapper)).toHaveLength(3)

    // Cabeceras de columna reales: una por columna, en cada tabla.
    expect(wrapper.findAll('th[scope="col"]')).toHaveLength(12)
  })

  it('cada proyecto es una fila con nombre, responsable, estado, tareas y carga', async () => {
    const wrapper = await mountView()

    expect(filas(wrapper)).toHaveLength(3)
    const fila = filas(wrapper)[0]
    expect(fila.element.tagName).toBe('TR')
    expect(fila.text()).toContain('Línea Pasteurizadora SIVE')
    expect(fila.text()).toContain('Ana')
    expect(fila.text()).toContain('Activo')
    expect(fila.find('[data-testid="project-tasks"]').text()).toBe('1/4')
    expect(fila.find('[data-testid="project-load"]').text()).toBe('75 %')
  })

  it('la fila no lleva enlaces ni botones por dentro', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).not.toContain('Capacidad')
    expect(wrapper.text()).not.toContain('Gantt')
    expect(wrapper.text()).not.toContain('Kanban')
    const fila = filas(wrapper)[0]
    expect(fila.findAll('a')).toHaveLength(0)
    expect(fila.findAll('button')).toHaveLength(0)
  })

  it('pinchar en cualquier parte de la fila lleva al proyecto', async () => {
    const wrapper = await mountView()

    const fila = filas(wrapper)[1]
    await fila.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('project')
    expect(router.currentRoute.value.params.id).toBe('2')
  })

  it('la fila se activa con el teclado', async () => {
    const wrapper = await mountView()

    const fila = filas(wrapper)[0]
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
    expect(filas(wrapper)).toHaveLength(0)

    await wrapper.find('[data-testid="clear-filters"]').trigger('click')
    await flushPromises()

    expect(filas(wrapper)).toHaveLength(3)
  })

  it('el equipo, las tareas y la carga salen del resumen', async () => {
    const wrapper = await mountView()

    const fila = filas(wrapper)[0]
    const avatares = fila.findAll('[data-testid="project-member"]')
    expect(avatares).toHaveLength(2)
    expect(avatares[0].text()).toBe('AK')
    expect(avatares[0].attributes('title')).toBe('Aketza')
    expect(fila.find('[data-testid="project-tasks"]').text()).toBe('1/4')
    expect(fila.find('[data-testid="project-load"]').text()).toBe('75 %')
    expect(fila.find('[data-testid="project-overloaded"]').exists()).toBe(false)
  })

  it('un proyecto cuya carga supera la capacidad avisa con la escala', async () => {
    const wrapper = await mountView()

    const fila = filas(wrapper)[1]

    expect(fila.find('[data-testid="project-overloaded"]').exists()).toBe(true)
    // 50 h sobre 40 de capacidad: sobrecarga alta, con triangulo en el chip.
    expect(fila.find('[data-testid="project-overloaded"]').text()).toBe('Sobrecarga alta')
    expect(fila.find('[data-testid="project-load"]').text()).toBe('125 %')
  })

  it('un proyecto sin equipo ni horas planificadas muestra guiones', async () => {
    const wrapper = await mountView()

    const fila = filas(wrapper)[2]

    expect(fila.find('[data-testid="project-member"]').exists()).toBe(false)
    expect(fila.find('[data-testid="project-load"]').exists()).toBe(false)
    expect(fila.text()).toContain('—')
  })

  it('si el resumen no llega, el listado sigue en pie', async () => {
    setupFetch({ summaryError: true })

    const wrapper = await mountView()

    expect(filas(wrapper)).toHaveLength(3)
    const fila = filas(wrapper)[0]
    expect(fila.find('[data-testid="project-member"]').exists()).toBe(false)
    expect(fila.find('[data-testid="project-tasks"]').exists()).toBe(false)
    expect(fila.find('[data-testid="project-load"]').exists()).toBe(false)
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

    const fila = filas(wrapper)[0]
    expect(fila.findAll('[data-testid="project-member"]')).toHaveLength(4)
    expect(fila.find('[data-testid="project-members-rest"]').text()).toBe('+1')
  })

  it('la barrita del proyecto y los avatares salen con el color del departamento en linea', async () => {
    const wrapper = await mountView()

    const fila = filas(wrapper)[0]
    const barrita = fila.find('.rounded-pastilla')
    expect(barrita.attributes('style')).toContain('background-color: rgb(0, 85, 102)')

    // El avatar del equipo sale con el color del grupo mezclado: la pildora.
    const avatar = fila.find('[data-testid="project-member"]')
    expect(avatar.attributes('style')).toContain('background-color: rgb(224, 235, 237)')
  })
})
