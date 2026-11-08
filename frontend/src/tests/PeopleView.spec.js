import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PeopleView from '../views/PeopleView.vue'

const people = [
  {
    id: 1,
    name: 'Ana',
    email: 'ana@example.com',
    company_role: 'jefe_departamento',
    company_role_label: 'Jefe de departamento',
    job_title: 'Project Manager',
    seniority: 'senior',
    seniority_label: 'Senior',
    employment_type: 'objetivo',
    employment_type_label: 'Objetivo',
    department_id: 1,
    department_name: 'Automatización & SCADA',
    weekly_base_hours: 40,
    schedule: {
      id: 1,
      valid_from: '2026-01-05',
      days: [800, 800, 800, 800, 800, 0, 0],
      hours: [8, 8, 8, 8, 8, 0, 0],
      availability_factor: 100,
      note: 'Jornada completa',
    },
    skills: [{ skill_id: 1, name: 'TIA Portal', level: 3 }],
    capacity: 40,
    hours: 36,
    is_overloaded: false,
    week: '2026-W46',
  },
  {
    id: 2,
    name: 'Sebastián',
    email: 's@example.com',
    company_role: 'tecnico',
    company_role_label: 'Técnico',
    job_title: 'Ingeniero PLC',
    seniority: null,
    seniority_label: null,
    employment_type: 'objetivo',
    employment_type_label: 'Objetivo',
    department_id: 1,
    department_name: 'Automatización & SCADA',
    weekly_base_hours: 40,
    schedule: {
      id: 2,
      valid_from: '2026-07-01',
      days: [800, 800, 800, 800, 800, 0, 0],
      hours: [8, 8, 8, 8, 8, 0, 0],
      availability_factor: 80,
      note: 'Jornada parcial',
    },
    skills: [],
    capacity: 32,
    hours: null,
    is_overloaded: null,
    week: '2026-W46',
  },
]

const skills = [
  { id: 1, name: 'TIA Portal' },
  { id: 2, name: 'SCADA' },
]

const days = [
  {
    id: 1,
    date: '2026-11-09',
    name: 'Día de la Comunidad',
    scope: 'department',
    department_id: 2,
    department_name: 'Oficina Técnica / EPLAN',
    half_day: false,
  },
]

const departments = [
  { id: 1, name: 'Automatización & SCADA', manager_id: 1, manager_name: 'Ana' },
  { id: 2, name: 'Oficina Técnica / EPLAN', manager_id: 3, manager_name: 'Jorge' },
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
    if (url.includes('/api/me')) {
      return jsonResponse({
        user: { id: 9, name: 'Admin' },
        role_label: 'Gerente',
        is_manager: overrides.isManager ?? true,
        department_name: null,
        visible_project_ids: [1, 2],
        editable_project_ids: [1, 2],
      })
    }
    if (url.includes('/api/people/1')) return jsonResponse({ ...people[0], schedule_history: [people[0].schedule] })
    if (url.includes('/api/people')) return jsonResponse(overrides.people ?? people)
    if (url.includes('/api/skills')) return jsonResponse(skills)
    if (url.includes('/api/non-working-days')) return jsonResponse(days)
    if (url.includes('/api/departments')) return jsonResponse(departments)
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(PeopleView, { global: { plugins: [pinia] } })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('PeopleView', () => {
  beforeEach(() => {
    localStorage.clear()
    setupFetch()
  })

  it('muestra el titulo y las dos pestanas', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Personas y Competencias')
    expect(wrapper.text()).toContain('Directorio')
    expect(wrapper.text()).toContain('Competencias')
    // Los dias no laborables viven en Configuracion.
    expect(wrapper.text()).not.toContain('Días no laborables')
  })

  it('lista el directorio con el horario vigente y la capacidad', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Project Manager')
    expect(wrapper.text()).toContain('Automatización & SCADA')
    expect(wrapper.text()).toContain('40 h')
    expect(wrapper.text()).toContain('32 h')
  })

  it('elige la semana que se muestra', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="week-label"]').text()).toMatch(/S\d+ · \d{4}-W\d+/)

    await wrapper.find('[data-testid="week-next"]').trigger('click')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(([url]) => url.includes('/api/people?'))
    expect(llamada[0]).toContain('week=')
  })

  it('cambia de pestana y muestra la matriz de competencias', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-skills"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('TIA Portal')
    expect(wrapper.text()).toContain('SCADA')
    expect(wrapper.findAll('[data-testid="skill-row"]').length).toBe(2)
  })

  it('abre la ficha de una persona con su historial', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="open-profile-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="person-drawer"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Historial de horarios')
    expect(wrapper.findAll('[data-testid="schedule-history-row"]').length).toBe(1)
  })

  it('la pestana de competencias muestra la matriz y no el catalogo', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-skills"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="skill-row"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('TIA Portal')
    expect(wrapper.find('[data-testid="skill-catalog"]').exists()).toBe(false)
  })

  it('un tecnico ve la misma matriz, sin gestion del catalogo', async () => {
    setupFetch({ isManager: false })

    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-skills"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="skill-row"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="skill-catalog"]').exists()).toBe(false)
  })

  it('la ficha permite corregir una version de horario', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="open-profile-1"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="edit-schedule-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="cancel-schedule"]').exists()).toBe(true)

    await wrapper.find('[data-testid="schedule-factor"]').setValue(90)
    await wrapper.find('[data-testid="save-schedule"]').trigger('click')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) =>
        url.includes('/api/people/1/schedules/1') && options.method === 'PATCH',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body).availability_factor).toBe(90)
  })

  it('muestra el error cuando la API lo rechaza', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({
          access_token: 'tok',
          user: { id: 9, name: 'Admin', email: 'a@e.com' },
        })
      }
      return jsonResponse({ detail: 'No se pudo cargar el directorio' }, false, 500)
    })

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('No se pudo cargar el directorio')
  })
})
