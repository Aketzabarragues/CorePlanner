import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { useToastStore } from '../stores/toast'
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
  {
    id: 3,
    name: 'Iván',
    email: 'ivan@example.com',
    company_role: 'gerente',
    company_role_label: 'Gerente',
    department_id: null,
    department_name: null,
    weekly_base_hours: 0,
    job_title: 'Dirección',
    employment_type: 'techo',
    employment_type_label: 'Techo',
    is_global_admin: true,
  },
]

const departments = [
  {
    id: 1,
    name: 'Automatización & SCADA',
    manager_id: 1,
    manager_name: 'Ana',
    color: '#1f6feb',
  },
  {
    id: 2,
    name: 'Oficina Técnica / EPLAN',
    manager_id: 3,
    manager_name: 'Jorge',
    color: '#0a3d91',
  },
]

const projects = [
  {
    id: 1,
    name: 'Linea Pasteurizadora SIVE',
    status: 'active',
    department_id: 1,
    owner_id: 1,
    color: '#1a7f37',
  },
  {
    id: 2,
    name: 'Ampliacion linea 2',
    status: 'planning',
    department_id: 2,
    owner_id: 2,
    color: '#0a3d91',
    is_provisional: true,
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

const policies = [
  {
    id: 1,
    scope_type: 'persona',
    scope_id: 2,
    warn_percent: 80,
    requires_approval_percent: 100,
    active: true,
    created_at: '2026-11-01T00:00:00Z',
  },
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
      return jsonResponse({ ...projects[0], id: 3 }, true, 201)
    }
    if (url.match(/\/projects\/\d+$/) && options.method === 'PATCH') {
      const id = Number(url.slice(-1))
      return jsonResponse({ ...projects.find((project) => project.id === id), id })
    }
    if (url.endsWith('/projects')) return jsonResponse(projects)
    if (url.endsWith('/roles/project')) return jsonResponse(projectRoles)
    if (url.endsWith('/roles')) return jsonResponse(companyRoles)
    if (url.includes('/members')) return jsonResponse(members)
    if (url.endsWith('/api/skills')) return jsonResponse(skills)
    if (url.match(/\/api\/skills\/\d+$/)) return jsonResponse({ id: 1, name: 'TIA Portal V18' })
    if (url.includes('/api/non-working-days')) return jsonResponse({ id: 2 })
    if (url.endsWith('/capacity-policies')) {
      if (options.method === 'POST') {
        return jsonResponse({ ...policies[0], id: 7 }, true, 201)
      }
      return jsonResponse(policies)
    }
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
    // El boton de alta aparece al seleccionar un dia laborable
    const celdas = wrapper.findAll('[data-testid="labor-month-cell"]')
    const laborable = celdas.find((c) => !c.attributes('title'))
    expect(laborable).toBeTruthy()
    await laborable.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="labor-add-day"]').exists()).toBe(true)
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

    // Seleccionar un dia laborable para que aparezca el boton de alta
    const celdas = wrapper.findAll('[data-testid="labor-month-cell"]')
    const laborable = celdas.find((c) => !c.attributes('title'))
    expect(laborable).toBeTruthy()
    await laborable.trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="labor-add-day"]').trigger('click')
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
    expect(useToastStore().items.map((item) => item.message)).toContain(
      'Día no laborable añadido.',
    )
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
    expect(useToastStore().items.map((item) => item.message)).toContain(
      'Día no laborable eliminado.',
    )
  })

  it('lista las personas con su rol y su departamento', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('Jefe de departamento')
    expect(wrapper.text()).toContain('Automatización & SCADA')
  })

  it('la tabla de personas va directa en una tarjeta, sin caja interior ni titulo', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-people"]').trigger('click')
    await flushPromises()

    const tarjeta = wrapper.find('section')
    expect(tarjeta.classes()).toContain('rounded-tarjeta')
    expect(tarjeta.classes()).toContain('border-borde')
    expect(tarjeta.classes()).toContain('bg-tarjeta')
    // La tabla va en la tarjeta, no en una caja con borde dentro de ella.
    expect(tarjeta.element.querySelector(':scope > div > table')).toBeTruthy()
    expect(tarjeta.find('h2').exists()).toBe(false)

    const tabla = wrapper.find('table')
    const cabecera = tabla.find('thead')
    expect(cabecera.classes()).toContain('bg-tarjeta-suave')
    expect(cabecera.classes()).toContain('uppercase')
    expect(cabecera.classes()).toContain('tracking-wider')
    expect(tabla.find('tbody').classes()).toContain('divide-y')

    // El avatar de iniciales es el mismo circulo que en el directorio; sin
    // color de departamento, el neutro por token.
    const avatar = wrapper.find('[data-testid="person-row"] .rounded-avatar')
    expect(avatar.exists()).toBe(true)
    expect(avatar.attributes('style')).toContain('rgb(var(--cp-neutro-fondo))')
    expect(avatar.text()).not.toBe('')
  })

  it('la accion de la pestana va en la cabecera y no hay titulo de persona en el cuerpo', async () => {
    const wrapper = await mountView()

    // El boton "Nueva persona" vive en la cabecera compartida, no en el panel.
    const boton = wrapper.find('[data-testid="header-action"]')
    expect(boton.exists()).toBe(true)
    expect(boton.text()).toContain('Nueva persona')
    expect(boton.element.closest('[data-testid="vista-cabecera"]')).toBeTruthy()

    // La vista entera solo lo menciona una vez: la cabecera, sin titulo
    // "Personas" repetido en el cuerpo.
    const textos = wrapper.text().split('Nueva persona')
    expect(textos).toHaveLength(2)

    await boton.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="person-job-title"]').exists()).toBe(true)
  })

  it('el rol sale como pildora de tono', async () => {
    const wrapper = await mountView()

    const pildoras = wrapper.findAll('[data-testid="person-row"] [data-testid="person-role-pill"]')
    expect(pildoras).toHaveLength(3)
    expect(pildoras[0].text()).toBe('Jefe de departamento')
    expect(pildoras[0].classes()).toContain('bg-info-fondo')
    expect(pildoras[0].classes()).toContain('rounded-pastilla')
    expect(pildoras[1].text()).toBe('Técnico')
    expect(pildoras[1].classes()).toContain('bg-neutro-fondo')
    expect(pildoras[2].text()).toBe('Gerente')
    expect(pildoras[2].classes()).toContain('bg-primario-suave')
    expect(pildoras[2].classes()).toContain('text-texto-marca')
  })

  it('las horas base salen en mono a la derecha y en peligro cuando son cero', async () => {
    const wrapper = await mountView()

    const celdasHoras = wrapper.findAll(
      '[data-testid="person-row"] td:nth-last-child(2)',
    )
    expect(celdasHoras[0].classes()).toContain('font-mono')
    expect(celdasHoras[0].classes()).toContain('text-texto-marca')
    expect(celdasHoras[0].text()).toBe('40 h')
    expect(celdasHoras[2].text()).toBe('0 h')
    expect(celdasHoras[2].classes()).toContain('text-peligro-texto')
  })

  it('el contrato Techo lleva el tono azul y el Objetivo el neutro', async () => {
    const wrapper = await mountView()

    const filaObjetivo = wrapper.findAll('[data-testid="person-row"]')[0]
    const pildoraObjetivo = filaObjetivo.findAll('td')[4].find('span')
    expect(pildoraObjetivo.classes()).toContain('bg-neutro-fondo')

    const filaTecho = wrapper.findAll('[data-testid="person-row"]')[2]
    const pildoraTecho = filaTecho.findAll('td')[4].find('span')
    expect(pildoraTecho.text()).toBe('Techo')
    expect(pildoraTecho.classes()).toContain('bg-info-fondo')
  })

  it('la persona sin departamento sale en cursiva tenue', async () => {
    const wrapper = await mountView()

    const celdasDepartamento = wrapper.findAll(
      '[data-testid="person-row"] td:nth-child(4)',
    )
    expect(celdasDepartamento[2].text()).toBe('Sin departamento')
    expect(celdasDepartamento[2].classes()).toContain('italic')
    expect(celdasDepartamento[2].classes()).toContain('text-texto-tenue')
    expect(celdasDepartamento[0].text()).toBe('Automatización & SCADA')
    expect(celdasDepartamento[0].classes()).not.toContain('italic')
  })

  it('Editar abre el dialogo con la persona rellena', async () => {
    const wrapper = await mountView()

    const botones = wrapper.findAll('[data-testid="person-row"] [data-testid="edit-person"]')
    expect(botones).toHaveLength(3)
    await botones[2].trigger('click')
    await flushPromises()

    const inputs = wrapper.findAll('form input')
    expect(inputs[0].element.value).toBe('Iván')
    expect(inputs[1].element.value).toBe('ivan@example.com')
    expect(wrapper.find('[data-testid="person-job-title"]').element.value).toBe('Dirección')
    // En modo edicion no se pide contrasena.
    expect(wrapper.find('input[type="password"]').exists()).toBe(false)
  })

  it('cambia de pestana y muestra los departamentos', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-departments"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Oficina Técnica / EPLAN')
    expect(wrapper.text()).toContain('Jorge')
  })

  it('el formulario de edicion ofrece la paleta con el color del departamento', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-departments"]').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Editar').trigger('click')
    await flushPromises()

    const picker = wrapper.get('[data-testid="color-picker"]')
    expect(picker.findAll('[data-testid^="color-swatch-"]')).toHaveLength(18)
    expect(wrapper.get('[data-testid="color-swatch-#1f6feb"]').attributes('aria-checked')).toBe(
      'true',
    )
  })

  it('el color elegido se guarda al modificar el departamento', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-departments"]').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Editar').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="color-swatch-#1a7f37"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(([, options]) => options.method === 'PATCH')
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body).color).toBe('#1a7f37')
  })

  it('el alta no pide color: lo elige el backend', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-departments"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="new-department"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="color-picker"]').exists()).toBe(false)
  })

  it('el proyecto tambien ofrece la paleta al editarlo', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-projects"]').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Editar').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="color-picker"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="color-swatch-#1a7f37"]').attributes('aria-checked')).toBe(
      'true',
    )
  })

  it('la lista de proyectos marca los provisionales', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-projects"]').trigger('click')
    await flushPromises()

    const etiqueta = wrapper.find('[data-testid="project-provisional-label"]')
    expect(etiqueta.exists()).toBe(true)
    expect(etiqueta.text()).toContain('Provisional')
    // La etiqueta va en la fila del proyecto provisional, no en la otra.
    expect(etiqueta.element.closest('tr').textContent).toContain('Ampliacion linea 2')
  })

  it('el alta de proyecto guarda el interruptor provisional', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-projects"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="new-project"]').trigger('click')
    await flushPromises()

    await wrapper.find('#form-proyecto input').setValue('Linea nueva')
    await wrapper.get('[data-testid="project-provisional-switch"]').trigger('click')
    await wrapper.find('#form-proyecto').trigger('submit')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) => url.endsWith('/projects') && options.method === 'POST',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toMatchObject({
      name: 'Linea nueva',
      is_provisional: true,
    })
  })

  it('la edicion de proyecto guarda el interruptor provisional', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-projects"]').trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text() === 'Editar').trigger('click')
    await flushPromises()

    // El proyecto 1 no es provisional: el interruptor parte apagado.
    expect(wrapper.get('[data-testid="project-provisional-switch"]').attributes('aria-checked')).toBe(
      'false',
    )
    await wrapper.get('[data-testid="project-provisional-switch"]').trigger('click')
    await wrapper.find('#form-proyecto').trigger('submit')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) => url.endsWith('/projects/1') && options.method === 'PATCH',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toMatchObject({ is_provisional: true })
  })

  it('anade una persona a un proyecto desde la pestana de miembros', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-members"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="new-member"]').trigger('click')
    await flushPromises()

    const selects = wrapper.findAll('#form-miembro select')
    await selects[0].setValue('1')
    await selects[1].setValue('2')
    await selects[2].setValue('2')
    await wrapper.find('#form-miembro').trigger('submit')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) => url.endsWith('/projects/1/members') && options.method === 'POST',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toEqual({ user_id: 2, role_id: 2 })
    expect(useToastStore().items.map((item) => item.message)).toContain(
      'Persona añadida al proyecto.',
    )
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

    await wrapper.find('[data-testid="header-action"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="person-job-title"]').exists()).toBe(true)
  })

  it('el modal se cierra con ESC', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="header-action"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="person-job-title"]').exists()).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(wrapper.find('[data-testid="person-job-title"]').exists()).toBe(false)
  })

  it('da de alta una persona', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="header-action"]').trigger('click')
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

    await wrapper.find('[data-testid="header-action"]').trigger('click')
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
    expect(useToastStore().items.map((item) => item.message)).toContain(
      'Competencia añadida al catálogo.',
    )
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
    expect(useToastStore().items.map((item) => item.message)).toContain(
      'Competencia renombrada.',
    )
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
    expect(useToastStore().items.map((item) => item.message)).toContain(
      'Competencia quitada del catálogo.',
    )
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

    expect(wrapper.find('[data-testid="labor-add-day"]').exists()).toBe(false)

    await wrapper
      .find('[data-testid="labor-month-day"][title="Dia de la Constitucion"]')
      .trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="labor-delete-day"]').exists()).toBe(false)
  })

  it('la pestaña de politica de capacidad la ve el gerente y no el tecnico', async () => {
    const gerente = await mountView()
    expect(gerente.find('[data-testid="tab-policies"]').exists()).toBe(true)

    setupFetch({ manager: false })
    const tecnico = await mountView()
    expect(tecnico.find('[data-testid="tab-policies"]').exists()).toBe(false)
    expect(tecnico.text()).not.toContain('Politica de capacidad')
  })

  it('la lista de politicas muestra el ambito, a quien aplica y los umbrales', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-policies"]').trigger('click')
    await flushPromises()

    const tabla = wrapper.find('[data-testid="capacity-policies-table"]')
    expect(tabla.exists()).toBe(true)
    const fila = wrapper.find('[data-testid="policy-row-1"]')
    expect(fila.exists()).toBe(true)
    expect(fila.text()).toContain('Persona')
    // La politica se aplica a la persona 2: sale su nombre, no su id.
    expect(fila.text()).toContain('Sebastián')
    expect(fila.text()).toContain('80 %')
    expect(fila.text()).toContain('100 %')
    expect(fila.find('[data-testid="policy-active-1"]').text()).toBe('Activa')
  })

  it('el alta de politica guarda con POST el cuerpo correcto', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-policies"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="new-capacity-policy"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="policy-scope-type"]').setValue('departamento')
    await wrapper.find('[data-testid="policy-scope"]').setValue('2')
    await wrapper.find('[data-testid="policy-warn-percent"]').setValue('70')
    await wrapper.find('[data-testid="policy-approval-percent"]').setValue('90')
    await wrapper.find('#form-politica-capacidad').trigger('submit')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) => url.endsWith('/capacity-policies') && options.method === 'POST',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toEqual({
      scope_type: 'departamento',
      scope_id: 2,
      warn_percent: 70,
      requires_approval_percent: 90,
      active: true,
    })
  })

  it('el 422 de la alta se muestra en el banner del formulario', async () => {
    const base = global.fetch
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url.endsWith('/capacity-policies') && options.method === 'POST') {
        return jsonResponse(
          { detail: 'El umbral de aprobacion no puede estar por debajo del de aviso' },
          false,
          422,
        )
      }
      return base(url, options)
    })

    const wrapper = await mountView()

    await wrapper.find('[data-testid="tab-policies"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="new-capacity-policy"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="policy-scope"]').setValue('2')
    await wrapper.find('[data-testid="policy-warn-percent"]').setValue('90')
    await wrapper.find('[data-testid="policy-approval-percent"]').setValue('80')
    await wrapper.find('#form-politica-capacidad').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('El umbral de aprobacion no puede estar por debajo del de aviso')
  })
})
