import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import SettingsView from '../views/SettingsView.vue'

const people = [
  {
    id: 1,
    name: 'Ana',
    email: 'ana@example.com',
    company_role: 'jefe_departamento',
    company_role_label: 'Jefe de departamento',
    department_id: 1,
    department_name: 'Automatización & SCADA',
    weekly_base_hours: 40,
    is_global_admin: false,
  },
  {
    id: 2,
    name: 'Sebastián',
    email: 's@example.com',
    company_role: 'tecnico',
    company_role_label: 'Técnico',
    department_id: 1,
    department_name: 'Automatización & SCADA',
    weekly_base_hours: 40,
    is_global_admin: false,
  },
]

const departments = [
  { id: 1, name: 'Automatización & SCADA', manager_id: 1, manager_name: 'Ana' },
  { id: 2, name: 'Oficina Técnica / EPLAN', manager_id: 3, manager_name: 'Jorge' },
]

const projects = [
  {
    id: 1,
    name: 'Linea Pasteurizadora SIVE',
    status: 'active',
    department_id: 1,
    owner_id: 1,
  },
]

const companyRoles = [
  { value: 'gerente', label: 'Gerente', scope: 'Ve toda la organización' },
  { value: 'jefe_departamento', label: 'Jefe de departamento', scope: 'Ve su departamento' },
  { value: 'tecnico', label: 'Técnico', scope: 'Ve sus proyectos' },
]

const projectRoles = [
  { id: 1, name: 'Project Manager', permissions: ['capacity.read', 'task.write'] },
  { id: 2, name: 'Lector', permissions: ['capacity.read'] },
]

const members = [
  { user_id: 1, name: 'Ana', email: 'ana@example.com', role_id: 1, role_name: 'Project Manager' },
]

const skills = [
  { id: 1, name: 'TIA Portal', person_count: 4 },
  { id: 2, name: 'SCADA', person_count: 1 },
]

const informeLaboral = {
  days: [
    {
      id: 1,
      date: '2026-11-02',
      name: 'Dia de la Constitucion',
      scope: 'global',
      half_day: false,
      affected_task_count: 2,
    },
  ],
  impact: [
    {
      user_id: 2,
      user_name: 'Ana',
      week: '2026-W45',
      capacity_without: 40,
      capacity_effective: 32,
      difference: 8,
      reasons: ['Dia de la Constitucion'],
    },
  ],
}

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch(overrides = {}) {
  global.fetch = vi.fn(async (url, options = {}) => {
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok-demo',
        token_type: 'bearer',
        user: {
          id: 9,
          name: 'Admin',
          email: 'admin@example.com',
          is_global_admin: true,
          company_role: 'gerente',
          department_id: null,
        },
      })
    }
    if (url.endsWith('/me')) {
      return jsonResponse({
        role_label: overrides.manager === false ? 'Técnico' : 'Gerente',
        is_manager: overrides.manager !== false,
        department_name: 'Automatización & SCADA',
        visible_project_ids: [1, 2],
        editable_project_ids: [1, 2],
      })
    }
    if (url.endsWith('/users') && options.method === 'POST') {
      return jsonResponse({ ...people[0], id: 3 }, true, 201)
    }
    if (url.endsWith('/users')) return jsonResponse(overrides.people ?? people)
    if (url.endsWith('/departments') && options.method === 'POST') {
      return jsonResponse({ id: 3, name: 'Nuevo', manager_id: null }, true, 201)
    }
    if (url.endsWith('/departments')) return jsonResponse(departments)
    if (url.endsWith('/projects') && options.method === 'POST') {
      return jsonResponse({ ...projects[0], id: 2 }, true, 201)
    }
    if (url.endsWith('/projects')) return jsonResponse(projects)
    if (url.endsWith('/roles/project')) return jsonResponse(projectRoles)
    if (url.endsWith('/roles')) return jsonResponse(companyRoles)
    if (url.includes('/members')) return jsonResponse(members)
    if (url.endsWith('/api/skills')) return jsonResponse(skills)
    if (url.includes('/work-calendar')) return jsonResponse(informeLaboral)
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/configuration', name: 'configuration', component: { template: '<div />' } }],
  })
  await router.push('/configuration')
  await router.isReady()
  const wrapper = mount(SettingsView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('SettingsView', () => {
  beforeEach(() => {
    localStorage.clear()
    setupFetch()
  })

  it('muestra el titulo y las pestanas', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Configuración')
    expect(wrapper.text()).toContain('Calendario laboral')
    expect(wrapper.text()).toContain('Personas')
    expect(wrapper.text()).toContain('Departamentos')
    expect(wrapper.text()).toContain('Proyectos')
    expect(wrapper.text()).toContain('Miembros')
    expect(wrapper.text()).toContain('Roles')
  })

  it('la pestaña de proyectos pinta la tabla con el estado de cada proyecto', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-projects"]').trigger('click')
    await flushPromises()

    const tabla = wrapper.find('[data-testid="projects-table"]')
    expect(tabla.exists()).toBe(true)
    expect(tabla.text()).toContain('Linea Pasteurizadora SIVE')
    expect(tabla.text()).toContain('Activo')
  })

  it('la pestaña del calendario laboral muestra el mes y el detalle', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-calendar"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="labor-month-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="labor-detail"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="non-working-form"]').exists()).toBe(true)
  })

  it('la pestana del calendario no arrastra el catalogo de competencias', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-calendar"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="new-skill"]').exists()).toBe(false)
  })

  it('al elegir un dia se ve su detalle con el impacto en la capacidad', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-calendar"]').trigger('click')
    await flushPromises()

    await wrapper
      .find('[data-testid="labor-month-day"][title="Dia de la Constitucion"]')
      .trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="labor-day-name"]').text()).toContain(
      'Dia de la Constitucion',
    )
    expect(wrapper.find('[data-testid="labor-day-scope"]').text()).toContain('Global')
    expect(wrapper.find('[data-testid="labor-impact-row"]').text()).toContain('Ana')
  })

  it('da de alta un dia no laborable de una persona', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-calendar"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="day-date"]').setValue('2026-12-08')
    await wrapper.find('[data-testid="day-name"]').setValue('Inmaculada')
    await wrapper.find('[data-testid="day-scope"]').setValue('person')
    await flushPromises()
    await wrapper.find('[data-testid="day-user"]').setValue('2')
    await wrapper.find('[data-testid="non-working-form"]').trigger('submit')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) =>
        url.includes('/api/non-working-days') && options.method === 'POST',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toMatchObject({
      date: '2026-12-08',
      name: 'Inmaculada',
      scope: 'person',
      user_id: 2,
    })
  })

  it('elimina un dia no laborable previa confirmacion', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-calendar"]').trigger('click')
    await flushPromises()

    const celdas = wrapper.findAll('[data-testid="labor-month-cell"]')
    const dia = celdas.find((celda) => celda.attributes('aria-label') === 'Dia 2')
    await dia.trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="labor-delete-day"]').trigger('click')
    await flushPromises()

    // Nada se borra hasta que se confirma.
    const antes = global.fetch.mock.calls.filter(
      ([url, options]) =>
        url.includes('/api/non-working-days/') && options.method === 'DELETE',
    )
    expect(antes).toHaveLength(0)

    await wrapper.find('[data-testid="labor-confirm-delete"]').trigger('click')
    await flushPromises()

    const despues = global.fetch.mock.calls.filter(
      ([url, options]) =>
        url.includes('/api/non-working-days/') && options.method === 'DELETE',
    )
    expect(despues).toHaveLength(1)
  })

  it('lista las personas con su rol y su departamento', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Jefe de departamento')
    expect(wrapper.text()).toContain('Automatización & SCADA')
  })

  it('la lista de personas comparte el lenguaje visual del directorio', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-people"]').trigger('click')
    await flushPromises()

    const tabla = wrapper.find('table')
    expect(tabla.exists()).toBe(true)

    // Mismo contenedor, misma cabecera y mismos separadores que el directorio.
    const contenedor = tabla.element.closest('div')
    expect(contenedor.className).toContain('border-slate-200')
    expect(contenedor.className).toContain('bg-white')

    const cabecera = tabla.find('thead')
    expect(cabecera.classes()).toContain('bg-slate-50')
    expect(cabecera.classes()).toContain('uppercase')
    expect(cabecera.classes()).toContain('tracking-wide')
    expect(tabla.find('tbody').classes()).toContain('divide-y')

    // El avatar de iniciales es el mismo circulo que en el directorio.
    const avatar = wrapper.find('[data-testid="person-row"] .rounded-full')
    expect(avatar.exists()).toBe(true)
    expect(avatar.classes()).toContain('bg-siemens-900')
    expect(avatar.text()).not.toBe('')
  })

  it('cambia de pestana y muestra los departamentos', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-departments"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Oficina Técnica / EPLAN')
    expect(wrapper.text()).toContain('Jorge')
  })

  it('el catalogo de roles explica el alcance de cada rol', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-roles"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Ve toda la organización')
    expect(wrapper.text()).toContain('Project Manager')
    expect(wrapper.text()).toContain('capacity.read')
  })

  it('el formulario de personas esta oculto hasta que se pulsa el boton', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="person-job-title"]').exists()).toBe(false)

    await wrapper.find('[data-testid="new-person"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="person-job-title"]').exists()).toBe(true)
  })

  it('el modal se cierra con ESC', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="new-person"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="person-job-title"]').exists()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(wrapper.find('[data-testid="person-job-title"]').exists()).toBe(false)
  })

  it('da de alta una persona', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="new-person"]').trigger('click')
    await flushPromises()

    const form = wrapper.find('form')
    await form.find('input').setValue('Lucia')
    await wrapper.findAll('input')[1].setValue('lucia@example.com')
    await wrapper.findAll('input')[2].setValue('contrasena-larga')
    await form.trigger('submit')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(([url, options]) =>
      url.endsWith('/users') && options.method === 'POST',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toMatchObject({
      name: 'Lucia',
      email: 'lucia@example.com',
      password: 'contrasena-larga',
    })
  })

  it('el formulario de personas lleva puesto, nivel y tipo de contrato', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="new-person"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="person-job-title"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="person-seniority"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="person-employment-type"]').exists()).toBe(true)
  })

  it('la pestana de competencias muestra el catalogo con su uso', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-skills"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('TIA Portal')
    expect(wrapper.text()).toContain('4 personas')
    expect(wrapper.text()).toContain('1 persona')
  })

  it('anade una competencia al catalogo', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-skills"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="new-skill"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="new-skill-name"]').setValue('Robotica')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) => url.endsWith('/api/skills') && options.method === 'POST',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toEqual({ name: 'Robotica' })
  })

  it('renombra una competencia del catalogo', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-skills"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="rename-skill-1"]').trigger('click')
    await wrapper.find('[data-testid="rename-skill-input"]').setValue('TIA Portal V18')
    await wrapper.find('[data-testid="save-skill-name"]').trigger('click')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) => url.endsWith('/api/skills/1') && options.method === 'PATCH',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toEqual({ name: 'TIA Portal V18' })
  })

  it('quita una competencia del catalogo', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-skills"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="remove-skill-2"]').trigger('click')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) => url.endsWith('/api/skills/2') && options.method === 'DELETE',
    )
    expect(llamada).toBeTruthy()
  })

  it('muestra el error cuando la competencia esta asignada a alguien', async () => {
    const base = global.fetch
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url.endsWith('/api/skills/2') && options.method === 'DELETE') {
        return jsonResponse(
          { detail: 'La competencia está asignada a alguna persona y no se puede quitar' },
          false,
          409,
        )
      }
      return base(url, options)
    })

    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-skills"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="remove-skill-2"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="skill-catalog-error"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('La competencia está asignada a alguna persona')
  })

  it('muestra el error cuando la API lo rechaza', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({
          access_token: 'tok',
          user: { id: 9, name: 'Admin', email: 'a@e.com' },
        })
      }
      return jsonResponse({ detail: 'Solo el gerente puede configurar la organizacion' }, false, 403)
    })

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Solo el gerente puede configurar la organizacion')
  })

  it('un tecnico ve el calendario laboral y nada mas', async () => {
    setupFetch({ manager: false })

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Calendario laboral')
    expect(wrapper.find('[data-testid="tab-people"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="tab-roles"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="labor-month-grid"]').exists()).toBe(true)
  })

  it('un tecnico no puede dar de alta ni quitar dias no laborables', async () => {
    setupFetch({ manager: false })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="non-working-form"]').exists()).toBe(false)

    await wrapper
      .find('[data-testid="labor-month-day"][title="Dia de la Constitucion"]')
      .trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="labor-delete-day"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="labor-add-day"]').exists()).toBe(false)
  })
})
