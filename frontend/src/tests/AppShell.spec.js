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

/** Proyectos en los que la persona puede escribir, para las pruebas de ambito. */
let editableProjectIds = [1, 2]
/** Indica si quien entra es el gerente, para las pruebas de la configuracion. */
let isManager = true

function setupFetch(options = {}) {
  editableProjectIds = options.editable ?? [1, 2]
  isManager = options.manager ?? true
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
          company_role: 'gerente',
          department_id: 1,
        },
      })
    }
    if (url.endsWith('/me')) {
      return jsonResponse({
        user: {
          id: 9,
          name: 'Sebastián',
          email: 's@example.com',
          is_global_admin: true,
          company_role: 'gerente',
          weekly_base_hours: 40,
          department_id: 1,
        },
        role_label: 'Gerente',
        is_manager: isManager,
        department_name: 'Automatización & SCADA',
        visible_project_ids: [1, 2],
        editable_project_ids: editableProjectIds,
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
      { path: '/panel', name: 'panel', component: Empty },
      { path: '/my-work', name: 'my-work', component: Empty },
      { path: '/projects', name: 'projects', component: Empty },
      { path: '/capacity', name: 'capacity', component: Tracked },
      { path: '/gantt', name: 'gantt', component: Empty },
      { path: '/calendar', name: 'calendar', component: Empty },
      { path: '/departments', name: 'departments', component: Empty },
      { path: '/people', name: 'people', component: Empty },
      { path: '/configuration', name: 'configuration', component: Empty },
      { path: '/projects/:id', name: 'project', component: Empty },
      { path: '/projects/:id/kanban', name: 'kanban', component: Empty },
      { path: '/projects/:id/members', name: 'members', component: Empty },
      { path: '/projects/:id/settings', name: 'project-settings', component: Empty },
    ],
  })
}

async function mountShell(path = '/capacity') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = buildRouter()
  await router.push(path)
  await router.isReady()
  const wrapper = mount(AppShell, { global: { plugins: [pinia, router] } })
  await flushPromises()
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

  it('el menu agrupa las vistas en cuatro grupos', async () => {
    const { wrapper } = await mountShell()

    const menu = wrapper.find('aside').text()
    expect(menu).toContain('Mi espacio')
    expect(menu).toContain('Planificación')
    expect(menu).toContain('Organización')
    expect(menu).toContain('Administración')
  })

  it('el menu tiene las vistas de planificacion y de organizacion', async () => {
    const { wrapper } = await mountShell()

    const menu = wrapper.find('aside').text()
    expect(menu).toContain('Panel')
    expect(menu).toContain('Mi trabajo')
    expect(menu).toContain('Capacidad')
    expect(menu).toContain('Gantt')
    expect(menu).toContain('Calendario')
    expect(menu).toContain('Proyectos')
    expect(menu).toContain('Personas y Competencias')
    expect(menu).toContain('Departamentos')
    expect(menu).toContain('Configuración')
  })

  it('el menu no tiene las pestanas del proyecto', async () => {
    const { wrapper } = await mountShell()

    const menu = wrapper.find('aside').text()
    expect(menu).not.toContain('Tablero Kanban')
    expect(menu).not.toContain('Miembros y Asignaciones')
  })

  it('cada entrada del menu lleva a su vista', async () => {
    const { wrapper } = await mountShell()

    expect(linkTo(wrapper, 'Capacidad').attributes('href')).toBe('/capacity')
    expect(linkTo(wrapper, 'Gantt').attributes('href')).toBe('/gantt')
    expect(linkTo(wrapper, 'Calendario').attributes('href')).toBe('/calendar')
    expect(linkTo(wrapper, 'Proyectos').attributes('href')).toBe('/projects')
    expect(linkTo(wrapper, 'Mi trabajo').attributes('href')).toBe('/my-work')
  })

  it('el grupo de administracion solo lo ve el gerente', async () => {
    setupFetch({ manager: false })

    const { wrapper } = await mountShell()

    const menu = wrapper.find('aside').text()
    expect(menu).not.toContain('Administración')
    expect(linkTo(wrapper, 'Configuración')).toBeUndefined()
  })

  it('en un proyecto la cabecera muestra su nombre y su departamento', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    const cabecera = wrapper.find('aside').text()
    expect(cabecera).toContain('Proyecto')
    expect(cabecera).toContain('Linea Pasteurizadora SIVE')
    expect(cabecera).toContain('Automatización & SCADA')
  })

  it('el rol de empresa aparece en la tarjeta de usuario', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    expect(wrapper.text()).toContain('Gerente')
  })

  it('muestra el alta de tarea cuando hay permiso de escritura', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    expect(wrapper.text()).toContain('Nueva Tarea')
    expect(wrapper.text()).not.toContain('Solo lectura')
  })

  it('un proyecto que solo se puede ver muestra el aviso de solo lectura', async () => {
    setupFetch({ editable: [2] })

    const { wrapper } = await mountShell('/projects/1/kanban')

    expect(wrapper.text()).toContain('Solo lectura')
    expect(wrapper.text()).not.toContain('Nueva Tarea')
  })

  it('marca la vista abierta en el menu lateral', async () => {
    const { wrapper } = await mountShell('/capacity')

    const activo = linkTo(wrapper, 'Capacidad')
    expect(activo.classes()).toContain('bg-slate-800')
    expect(activo.classes()).toContain('border-indigo-500')

    const inactivo = linkTo(wrapper, 'Gantt')
    expect(inactivo.classes()).toContain('border-transparent')
  })

  it('en la pagina del proyecto no se marca ninguna entrada del menu', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    // Las pestanas del proyecto son de la pagina del proyecto, no del menu.
    const marcados = wrapper.findAll('aside a.border-indigo-500')
    expect(marcados).toHaveLength(0)
  })

  it('con la pestana del calendario abierta se marca la configuracion', async () => {
    const { wrapper } = await mountShell('/configuration?tab=calendar')

    const enlaces = wrapper.findAll('aside a')
    const configuracion = enlaces.find((link) => link.text().includes('Configuración'))

    expect(configuracion.classes()).toContain('border-indigo-500')
  })

  it('las migas de pan muestran la vista y el proyecto', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    const migas = wrapper.find('header nav').text()
    expect(migas).toContain('Tablero')
    expect(migas).toContain('Linea Pasteurizadora SIVE')
  })

  it('sin proyecto las migas de pan muestran solo la vista', async () => {
    const { wrapper } = await mountShell('/capacity')

    const migas = wrapper.find('header nav').text()
    expect(migas).toContain('Capacidad')
    expect(migas).not.toContain('Linea Pasteurizadora SIVE')
  })

  it('en el resumen del proyecto las migas dicen Resumen', async () => {
    const { wrapper } = await mountShell('/projects/1')

    const migas = wrapper.find('header nav').text()
    expect(migas).toContain('Resumen')
    expect(migas).not.toContain('Capacidad')
  })

  it('muestra la pila de estado del proyecto', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    expect(wrapper.find('header').text()).toContain('Activo')
  })

  it('sin proyecto no hay pila de estado', async () => {
    const { wrapper } = await mountShell('/capacity')

    expect(wrapper.find('header').text()).not.toContain('Activo')
  })

  it('el selector aparece en las vistas de planificacion', async () => {
    const { wrapper } = await mountShell('/capacity')

    expect(wrapper.find('header').findComponent(ProjectPicker).exists()).toBe(true)
  })

  it('el selector no aparece en las demas vistas', async () => {
    const { wrapper } = await mountShell('/projects')

    expect(wrapper.find('header').findComponent(ProjectPicker).exists()).toBe(false)
  })

  it('el selector esta en la cabecera y no en el menu', async () => {
    const { wrapper } = await mountShell('/capacity')

    expect(wrapper.find('header').findComponent(ProjectPicker).exists()).toBe(true)
    expect(wrapper.find('aside').findComponent(ProjectPicker).exists()).toBe(false)
  })

  it('el selector muestra el proyecto que filtra y su departamento', async () => {
    const { wrapper } = await mountShell('/capacity?project=2')

    const picker = wrapper.findComponent(ProjectPicker)
    expect(picker.text()).toContain('Red de tuberias linea 2')
    expect(picker.text()).toContain('Oficina Técnica / EPLAN')
  })

  it('elegir un proyecto pone el filtro en la URL', async () => {
    const { wrapper, router } = await mountShell('/capacity')

    await wrapper.findComponent(ProjectPicker).find('button').trigger('click')
    await wrapper.findAll('[role=option]')[2].trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/capacity')
    expect(router.currentRoute.value.query.project).toBe('2')
  })

  it('elegir todos los proyectos quita el filtro', async () => {
    const { wrapper, router } = await mountShell('/capacity?project=2')

    await wrapper.findComponent(ProjectPicker).find('button').trigger('click')
    await wrapper.findAll('[role=option]')[0].trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.project).toBeUndefined()
  })

  it('el filtro de proyecto acompaña a las vistas de planificacion', async () => {
    const { wrapper } = await mountShell('/capacity?project=2')

    expect(linkTo(wrapper, 'Gantt').attributes('href')).toBe('/gantt?project=2')
    expect(linkTo(wrapper, 'Calendario').attributes('href')).toBe('/calendar?project=2')
  })

  it('las demas vistas no llevan el filtro', async () => {
    const { wrapper } = await mountShell('/capacity?project=2')

    expect(linkTo(wrapper, 'Panel').attributes('href')).toBe('/panel')
    expect(linkTo(wrapper, 'Proyectos').attributes('href')).toBe('/projects')
  })

  it('el enlace de la vista abierta conserva su estado', async () => {
    const { wrapper } = await mountShell('/capacity?project=2&mode=porcentaje')

    expect(linkTo(wrapper, 'Capacidad').attributes('href')).toBe(
      '/capacity?project=2&mode=porcentaje',
    )
  })

  it('el boton de colapsar reduce el menu lateral', async () => {
    const { wrapper } = await mountShell()

    expect(wrapper.find('aside').classes()).toContain('sm:w-64')

    const colapsar = wrapper
      .findAll('button')
      .find((button) => button.attributes('title') === 'Colapsar el menú')
    await colapsar.trigger('click')

    expect(wrapper.find('aside').classes()).toContain('sm:w-16')
    expect(localStorage.getItem('coreplanner_sidebar')).toBe('1')
  })

  it('el boton del menu abre el cajon en el movil', async () => {
    const { wrapper } = await mountShell()

    const boton = wrapper.find('[data-testid="menu-toggle"]')
    expect(boton.exists()).toBe(true)
    expect(boton.attributes('aria-expanded')).toBe('false')

    await boton.trigger('click')

    expect(wrapper.find('[data-testid="menu-toggle"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('[data-testid="menu-overlay"]').exists()).toBe(true)
    expect(wrapper.find('aside').classes()).toContain('z-50')
  })

  it('el cajon se cierra al pulsar fuera', async () => {
    const { wrapper } = await mountShell()

    await wrapper.find('[data-testid="menu-toggle"]').trigger('click')
    await wrapper.find('[data-testid="menu-overlay"]').trigger('click')

    expect(wrapper.find('[data-testid="menu-overlay"]').exists()).toBe(false)
    expect(wrapper.find('aside').classes()).toContain('max-sm:hidden')
  })

  it('el pie muestra las iniciales y el nombre', async () => {
    const { wrapper } = await mountShell()

    const pie = wrapper.find('aside').text()
    expect(wrapper.find('[data-testid=user-avatar]').text()).toBe('S')
    expect(pie).toContain('Sebastián')
    expect(pie).toContain('Gerente')
  })

  it('cerrar la sesion borra el token y lleva al acceso', async () => {
    const { wrapper, router } = await mountShell()

    const salir = wrapper
      .findAll('button')
      .find((button) => button.attributes('title') === 'Cerrar sesión')
    await salir.trigger('click')
    await flushPromises()

    expect(localStorage.getItem('coreplanner_token')).toBeNull()
    expect(localStorage.getItem('coreplanner_signed_out')).toBe('1')
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('el boton de nueva tarea abre el modal con los miembros del proyecto', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    const nueva = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Nueva Tarea'))
    await nueva.trigger('click')
    await flushPromises()

    const opciones = wrapper.findAll('select option')
    expect(opciones.map((option) => option.text())).toContain('Ana (Project Manager)')
  })

  it('al guardar una tarea llama a la API y avisa', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

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
    const { wrapper } = await mountShell('/projects/1/kanban')

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
    const { wrapper } = await mountShell('/projects/1/kanban')
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

  it('la vista abierta no se monta de nuevo cuando cambian las tareas', async () => {
    mounts = 0
    const { wrapper } = await mountShell('/capacity?project=1')
    await flushPromises()

    expect(mounts).toBe(1)

    const { useProjectsStore } = await import('../stores/projects')
    useProjectsStore().notifyTasksChanged()
    await flushPromises()

    // La vista se queda montada: sus filtros, su pestana activa y su
    // desplazamiento se conservan. Los datos se recargan por su cuenta.
    expect(mounts).toBe(1)
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
