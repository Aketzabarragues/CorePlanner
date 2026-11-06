import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    company_role_label: 'Tecnico',
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
  { value: 'gerente', label: 'Gerente', scope: 'Ve toda la organizacion' },
  { value: 'jefe_departamento', label: 'Jefe de departamento', scope: 'Ve su departamento' },
  { value: 'tecnico', label: 'Tecnico', scope: 'Ve sus proyectos' },
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
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(SettingsView, { global: { plugins: [pinia] } })
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
    expect(wrapper.text()).toContain('Personas')
    expect(wrapper.text()).toContain('Departamentos')
    expect(wrapper.text()).toContain('Proyectos')
    expect(wrapper.text()).toContain('Miembros')
    expect(wrapper.text()).toContain('Roles')
  })

  it('lista las personas con su rol y su departamento', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Jefe de departamento')
    expect(wrapper.text()).toContain('Automatización & SCADA')
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

    expect(wrapper.text()).toContain('Ve toda la organizacion')
    expect(wrapper.text()).toContain('Project Manager')
    expect(wrapper.text()).toContain('capacity.read')
  })

  it('da de alta una persona', async () => {
    const wrapper = await mountView()

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

    await wrapper.find('[data-testid="new-skill-name"]').setValue('Robotica')
    await wrapper.find('[data-testid="add-skill"]').trigger('click')
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
          { detail: 'La competencia esta asignada a alguna persona y no se puede quitar' },
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
    expect(wrapper.text()).toContain('La competencia esta asignada a alguna persona')
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
})
