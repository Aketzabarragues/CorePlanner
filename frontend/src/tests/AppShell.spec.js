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
      { path: '/my-work', name: 'my-work', component: Empty },
      { path: '/projects', name: 'projects', component: Empty },
      { path: '/capacity', name: 'global-capacity', component: Empty },
      { path: '/gantt', name: 'global-gantt', component: Empty },
      { path: '/departments', name: 'departments', component: Empty },
      { path: '/people', name: 'people', component: Empty },
      { path: '/configuration', name: 'configuration', component: Empty },
      { path: '/projects/:id', name: 'project', component: Empty },
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
  })

  it('en un proyecto el menu muestra el nombre y el departamento', async () => {
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

  it('el gerente ve el enlace de configuracion en el espacio global', async () => {
    const { wrapper } = await mountShell('/projects')

    expect(linkTo(wrapper, 'Configuración')).toBeTruthy()
  })

  it('quien no es gerente no ve el enlace de configuracion', async () => {
    setupFetch({ manager: false })

    const { wrapper } = await mountShell('/projects')

    expect(linkTo(wrapper, 'Configuración')).toBeUndefined()
  })

  it('en el espacio global el menu muestra las vistas globales', async () => {
    const { wrapper } = await mountShell('/capacity')

    const menu = wrapper.find('aside').text()
    expect(menu).toContain('Espacio Global')
    expect(menu).toContain('Proyectos')
    expect(menu).toContain('Capacidad Global')
    expect(menu).toContain('Gantt Global')
    expect(menu).toContain('Departamentos')
    expect(menu).not.toContain('Tablero Kanban')
  })

  it('en un proyecto el menu no muestra las vistas globales', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    const menu = wrapper.find('aside').text()
    expect(menu).not.toContain('Capacidad Global')
    expect(menu).not.toContain('Gantt Global')
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

  it('en el espacio global las migas de pan muestran el contexto global', async () => {
    const { wrapper } = await mountShell('/capacity')

    const migas = wrapper.find('header nav').text()
    expect(migas).toContain('Espacio Global')
    expect(migas).toContain('Capacidad Global')
  })

  it('en el resumen del proyecto las migas dicen Resumen', async () => {
    const { wrapper } = await mountShell('/projects/1')

    const migas = wrapper.find('header nav').text()
    expect(migas).toContain('Resumen')
    expect(migas).not.toContain('Matriz de Capacidad')
  })

  it('muestra la pila de estado del proyecto', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    expect(wrapper.find('header').text()).toContain('Activo')
  })

  it('en el espacio global no hay pila de estado', async () => {
    const { wrapper } = await mountShell('/capacity')

    expect(wrapper.find('header').text()).not.toContain('Activo')
  })

  it('el selector muestra el proyecto abierto y su departamento', async () => {
    const { wrapper } = await mountShell('/projects/2/kanban')

    const picker = wrapper.findComponent(ProjectPicker)
    expect(picker.text()).toContain('Red de tuberias linea 2')
    expect(picker.text()).toContain('Oficina Técnica / EPLAN')
  })

  it('el selector esta en la cabecera', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    expect(wrapper.find('header').findComponent(ProjectPicker).exists()).toBe(true)
    expect(wrapper.find('aside').findComponent(ProjectPicker).exists()).toBe(false)
  })

  it('elegir otro proyecto mantiene la vista abierta', async () => {
    const { wrapper, router } = await mountShell('/projects/1/kanban')

    await wrapper.findComponent(ProjectPicker).find('button').trigger('click')
    const opciones = wrapper.findAll('[role=option]')
    await opciones[2].trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/projects/2/kanban')
  })

  it('elegir el espacio global lleva a la vista global homologa', async () => {
    const { wrapper, router } = await mountShell('/projects/1/gantt')

    await wrapper.findComponent(ProjectPicker).find('button').trigger('click')
    await wrapper.findAll('[role=option]')[0].trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/gantt')
  })

  it('elegir un proyecto desde el espacio global entra por la vista homologa', async () => {
    const { wrapper, router } = await mountShell('/capacity')

    await wrapper.findComponent(ProjectPicker).find('button').trigger('click')
    await wrapper.findAll('[role=option]')[1].trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/projects/1/capacity')
  })

  it('en un proyecto hay un enlace para volver a la vista global', async () => {
    const { wrapper } = await mountShell('/projects/1/kanban')

    const volver = linkTo(wrapper, 'Volver a vista global')
    expect(volver).toBeDefined()
    expect(volver.attributes('href')).toBe('/projects')
  })

  it('en el espacio global no hay enlace para volver', async () => {
    const { wrapper } = await mountShell('/capacity')

    expect(linkTo(wrapper, 'Volver a vista global')).toBeUndefined()
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
