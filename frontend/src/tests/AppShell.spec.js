import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import AppShell from '../components/AppShell.vue'
import ProjectPicker from '../components/ProjectPicker.vue'
import { useAuthStore } from '../stores/auth'

const Empty = { render: () => null }

/** Cuenta los montajes de la vista, para comprobar que se vuelve a montar. */
let mounts = 0
const Tracked = {
  render: () => null,
  mounted() {
    mounts += 1
  },
}

const projects = [
  { id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active', department_id: 1 },
  { id: 2, name: 'Red de tuberias linea 2', status: 'on_hold', department_id: 2 },
]

const departments = [
  { id: 1, name: 'Automatización & SCADA', manager_id: 1, manager_name: 'Ana' },
  { id: 2, name: 'Oficina Técnica / EPLAN', manager_id: 3, manager_name: 'Jorge' },
]

const members = [
  { user_id: 1, name: 'Ana', email: 'ana@example.com', role_id: 1, role_name: 'Project Manager' },
  { user_id: 2, name: 'Sebastián', email: 's@example.com', role_id: 2, role_name: 'Ingeniero' },
]

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch() {
  global.fetch = vi.fn(async (url, options = {}) => {
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok-demo',
        token_type: 'bearer',
        user: {
          id: 9,
          name: 'Sebastián',
          email: 's@example.com',
          is_global_admin: true,
          department_id: 1,
        },
      })
    }
    if (url.endsWith('/departments')) return jsonResponse(departments)
    if (url.endsWith('/projects')) return jsonResponse(projects)
    if (url.includes('/members')) return jsonResponse(members)
    if (url.includes('/tasks') && options.method === 'POST') {
      return jsonResponse({ id: 99, title: 'Tarea nueva' })
    }
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
      { path: '/projects/:id/capacity', name: 'capacity', component: Tracked },
      { path: '/projects/:id/gantt', name: 'gantt', component: Empty },
      { path: '/projects/:id/kanban', name: 'kanban', component: Empty },
      { path: '/projects/:id/members', name: 'members', component: Empty },
      { path: '/projects/:id/settings', name: 'settings', component: Empty },
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

function linkTo(wrapper, label) {
  return wrapper.findAll('a').find((link) => link.text().includes(label))
}

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear()
    setupFetch()
  })

  it('muestra el nombre de la aplicacion y su version', async () => {
    const { wrapper } = await mountShell()

    expect(wrapper.text()).toContain('CorePlanner')
    expect(wrapper.text()).toContain('v0.1')
  })

  it('el menu lateral agrupa las vistas del proyecto', async () => {
    const { wrapper } = await mountShell()

    expect(wrapper.text()).toContain('Planificación & ejecución')
    expect(wrapper.text()).toContain('Gestión & equipo')
    expect(wrapper.text()).toContain('Matriz de Capacidad')
    expect(wrapper.text()).toContain('Cronograma (Gantt)')
    expect(wrapper.text()).toContain('Tablero Kanban')
    expect(wrapper.text()).toContain('Miembros y Asignaciones')
    expect(wrapper.text()).toContain('Configuración del Proyecto')
  })

  it('marca la vista abierta en el menu lateral', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    const activo = linkTo(wrapper, 'Tablero Kanban')
    expect(activo.classes()).toContain('bg-slate-800')
    expect(activo.classes()).toContain('border-indigo-500')

    const inactivo = linkTo(wrapper, 'Matriz de Capacidad')
    expect(inactivo.classes()).toContain('border-transparent')
  })

  it('las migas de pan muestran departamento, proyecto y vista', async () => {
    const { wrapper } = await mountShell('/projects/1/gantt')

    const migas = wrapper.find('header nav').text()
    expect(migas).toContain('Automatización & SCADA')
    expect(migas).toContain('Linea Pasteurizadora SIVE')
    expect(migas).toContain('Cronograma (Gantt)')
  })

  it('muestra la pila de estado del proyecto', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    expect(wrapper.find('header').text()).toContain('Activo')
  })

  it('el selector muestra el proyecto abierto y su departamento', async () => {
    const { wrapper } = await mountShell('/projects/2/kanban')

    const picker = wrapper.findComponent(ProjectPicker)
    expect(picker.text()).toContain('Red de tuberias linea 2')
    expect(picker.text()).toContain('Oficina Técnica / EPLAN')
  })

  it('elegir otro proyecto mantiene la vista abierta', async () => {
    const { wrapper, router } = await mountShell('/projects/1/kanban')

    await wrapper.findComponent(ProjectPicker).find('button').trigger('click')
    const opciones = wrapper.findAll('[role=option]')
    await opciones[1].trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/projects/2/kanban')
  })

  it('el boton de colapsar reduce el menu lateral', async () => {
    const { wrapper } = await mountShell()

    expect(wrapper.find('aside').classes()).toContain('w-64')

    const colapsar = wrapper
      .findAll('button')
      .find((button) => button.attributes('title') === 'Colapsar el menu')
    await colapsar.trigger('click')

    expect(wrapper.find('aside').classes()).toContain('w-16')
    expect(localStorage.getItem('coreplanner_sidebar')).toBe('1')
  })

  it('el pie muestra las iniciales, el nombre y el departamento', async () => {
    const { wrapper } = await mountShell()

    const pie = wrapper.find('aside').text()
    expect(wrapper.find('[data-testid=user-avatar]').text()).toBe('S')
    expect(pie).toContain('Sebastián')
    expect(pie).toContain('Automatización & SCADA')
  })

  it('cerrar la sesion borra el token y lleva al acceso', async () => {
    const { wrapper, router } = await mountShell()

    const salir = wrapper
      .findAll('button')
      .find((button) => button.attributes('title') === 'Cerrar sesion')
    await salir.trigger('click')
    await flushPromises()

    expect(localStorage.getItem('coreplanner_token')).toBeNull()
    expect(localStorage.getItem('coreplanner_signed_out')).toBe('1')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('el boton de nueva tarea abre el modal con los miembros del proyecto', async () => {
    const { wrapper } = await mountShell()

    const nueva = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Nueva Tarea'))
    await nueva.trigger('click')
    await flushPromises()

    const opciones = wrapper.findAll('select option')
    expect(opciones.map((option) => option.text())).toContain('Ana (Project Manager)')
  })

  it('al guardar una tarea llama a la API y avisa', async () => {
    const { wrapper } = await mountShell()

    const nueva = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Nueva Tarea'))
    await nueva.trigger('click')
    await flushPromises()

    await wrapper.find('input[type=text]').setValue('Revision de PLC')
    await wrapper.findAll('input[type=date]')[0].setValue('2026-11-02')
    await wrapper.findAll('input[type=date]')[1].setValue('2026-11-04')
    await wrapper.find('input[type=number]').setValue('12')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const altas = global.fetch.mock.calls.filter(
      ([url, options]) => options?.method === 'POST' && url.includes('/api/projects/1/tasks'),
    )
    expect(altas).toHaveLength(1)
    expect(altas[0][0]).toContain('/api/projects/1/tasks')
    expect(wrapper.text()).toContain('Tarea "Revision de PLC" creada.')
  })

  it('el aviso se puede cerrar con un clic', async () => {
    const { wrapper } = await mountShell()

    const nueva = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Nueva Tarea'))
    await nueva.trigger('click')
    await flushPromises()

    await wrapper.find('input[type=text]').setValue('Revision de PLC')
    await wrapper.findAll('input[type=date]')[0].setValue('2026-11-02')
    await wrapper.findAll('input[type=date]')[1].setValue('2026-11-04')
    await wrapper.find('input[type=number]').setValue('12')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Tarea "Revision de PLC" creada.')

    await wrapper.find('[title="Cerrar aviso"]').trigger('click')

    expect(wrapper.text()).not.toContain('Tarea "Revision de PLC" creada.')
  })

  it('el aviso de tarea creada queda marcado en el store', async () => {
    const { wrapper } = await mountShell()
    const { useProjectsStore } = await import('../stores/projects')
    const store = useProjectsStore()
    const antes = store.tasksRevision

    const nueva = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Nueva Tarea'))
    await nueva.trigger('click')
    await flushPromises()

    await wrapper.find('input[type=text]').setValue('Revision de PLC')
    await wrapper.findAll('input[type=date]')[0].setValue('2026-11-02')
    await wrapper.findAll('input[type=date]')[1].setValue('2026-11-04')
    await wrapper.find('input[type=number]').setValue('12')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(store.tasksRevision).toBe(antes + 1)
  })

  it('la vista abierta se monta de nuevo cuando cambian las tareas', async () => {
    mounts = 0
    const { wrapper } = await mountShell('/projects/1/capacity')
    await flushPromises()

    expect(mounts).toBe(1)

    const { useProjectsStore } = await import('../stores/projects')
    useProjectsStore().notifyTasksChanged()
    await flushPromises()

    // Remontar la vista es lo que obliga a pedir los datos de nuevo.
    expect(mounts).toBe(2)
  })

  it('sin proyecto en la url no hay boton de nueva tarea', async () => {
    const { wrapper } = await mountShell('/projects')

    const nueva = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Nueva Tarea'))
    expect(nueva).toBeUndefined()
  })

  it('el usuario con sesion guardada ve su nombre en el pie', async () => {
    useAuthStore().setSession('tok', {
      id: 2,
      name: 'Sebastián',
      is_global_admin: false,
      department_id: 1,
    })
    const { wrapper } = await mountShell()

    expect(wrapper.find('aside').text()).toContain('Sebastián')
  })
})
