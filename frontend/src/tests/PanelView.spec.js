import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import PanelView from '../views/PanelView.vue'

const byDepartment = [
  {
    id: 4,
    name: 'Alimentación',
    active_projects: 1,
    overloaded_people: 1,
    utilization: 88,
    planned_hours: 57.28,
    capacity_hours: 152,
  },
  {
    id: 5,
    name: 'Energía',
    active_projects: 3,
    overloaded_people: 0,
    utilization: 51,
    planned_hours: 49.32,
    capacity_hours: 96,
  },
  {
    id: 6,
    name: 'Medio Ambiente',
    active_projects: 3,
    overloaded_people: 1,
    utilization: 53,
    planned_hours: 64,
    capacity_hours: 120,
  },
]

const panel = {
  week: '2026-W45',
  is_current_week: true,
  planned_hours: 70,
  capacity_hours: 80,
  utilization: 88,
  overloaded: [
    {
      user_id: 3,
      name: 'Sebastian',
      week: '2026-W45',
      hours: 50,
      capacity: 40,
      excess_hours: 10,
    },
    {
      user_id: 3,
      name: 'Sebastian',
      week: '2026-W46',
      hours: 44,
      capacity: 40,
      excess_hours: 4,
    },
    {
      user_id: 4,
      name: 'Marta',
      week: '2026-W46',
      hours: 44,
      capacity: 40,
      excess_hours: 4,
    },
  ],
  projects_by_status: { active: 1, planning: 1 },
  tasks_by_status: { in_progress: 1, backlog: 2 },
  projects: [
    {
      id: 1,
      name: 'Linea Pasteurizadora SIVE',
      status: 'active',
      estimated_hours: 70,
      task_count: 2,
      people_count: 2,
      department_id: 4,
    },
    {
      id: 2,
      name: 'Ampliacion linea 2',
      status: 'planning',
      estimated_hours: 8,
      task_count: 1,
      people_count: 1,
      department_id: 5,
    },
  ],
  total_tasks: 3,
  total_people: 4,
  weeks: [
    { week: '2026-W45', hours: 70, capacity: 80, utilization: 88 },
    { week: '2026-W46', hours: 94, capacity: 80, utilization: 118 },
    { week: '2026-W47', hours: 0, capacity: 80, utilization: 0 },
  ],
  pending: [
    {
      id: 7,
      title: 'Montaje de cuadros',
      project_id: 1,
      project_name: 'Linea Pasteurizadora SIVE',
      problem: 'Sin persona',
    },
    {
      id: 8,
      title: 'Plano de implantacion',
      project_id: 2,
      project_name: 'Ampliacion linea 2',
      problem: 'Sin fechas',
    },
  ],
  by_department: byDepartment,
}

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

const gerenteScope = {
  is_manager: true,
  user: {
    id: 1,
    name: 'Ivan',
    email: 'ivan@example.com',
    is_global_admin: false,
    company_role: 'gerente',
    weekly_base_hours: 40,
    department_id: null,
  },
}

const incident = {
  id: 11,
  policy_id: 1,
  user_id: 3,
  user_name: 'Sebastian',
  department_id: 4,
  department_name: 'Alimentación',
  week: '2026-W46',
  state: 'pendiente',
  hours: 48,
  capacity: 40,
  warn_percent: 90,
  requires_approval_percent: 100,
  note: null,
  created_at: '2026-11-16T10:00:00Z',
  resolved_at: null,
  resolved_by: null,
}

function scopeFor(role, user = {}) {
  return {
    is_manager: role === 'gerente',
    user: {
      id: 1,
      name: 'Ivan',
      email: 'ivan@example.com',
      is_global_admin: false,
      company_role: role,
      weekly_base_hours: 40,
      department_id: null,
      ...user,
    },
  }
}

function setupFetch(payload = panel, options = {}) {
  const { incidents = [], scope = gerenteScope } = options
  const estado = [...incidents]
  global.fetch = vi.fn(async (url, fetchOptions = {}) => {
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.endsWith('/panel')) return jsonResponse(payload)
    if (url.endsWith('/me')) return jsonResponse(scope)
    const resolveMatch = url.match(/\/capacity-incidents\/(\d+)\/resolve$/)
    if (resolveMatch) {
      const body = JSON.parse(fetchOptions.body ?? '{}')
      const id = Number(resolveMatch[1])
      const index = estado.findIndex((item) => item.id === id)
      const actual = index === -1 ? incident : estado[index]
      const resuelto = {
        ...actual,
        id,
        state: body.decision,
        note: body.note ?? null,
        resolved_at: '2026-11-16T12:00:00Z',
        resolved_by: scope.user?.name ?? null,
      }
      if (index !== -1) estado[index] = resuelto
      return jsonResponse(resuelto)
    }
    if (url.endsWith('/capacity-incidents')) return jsonResponse(estado.map((item) => ({ ...item })))
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/capacity', component: { template: '<div />' } },
      { path: '/projects', component: { template: '<div />' } },
      { path: '/projects/:id/kanban', component: { template: '<div />' } },
    ],
  })
  const wrapper = mount(PanelView, {
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('PanelView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
  })

  it('muestra la utilizacion de la semana de referencia', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-utilization"]').text()).toContain('88 %')
    expect(wrapper.text()).toContain('70 h planificadas')
    expect(wrapper.text()).toContain('80 h de capacidad')
    expect(wrapper.text()).toContain('Media del periodo: 69 %')
  })

  it('los cuatro indicadores llevan a la pantalla de origen', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-card-usage"]').attributes('href')).toBe('/capacity')
    expect(wrapper.find('[data-testid="panel-card-overloaded"]').attributes('href')).toBe(
      '/capacity',
    )
    expect(wrapper.find('[data-testid="panel-card-projects"]').attributes('href')).toBe('/projects')
    expect(wrapper.find('[data-testid="panel-card-pending"]').attributes('href')).toBe('/capacity')
  })

  it('agrupa a quien supera su capacidad y ensena su peor semana', async () => {
    const wrapper = await mountView()

    const filas = wrapper.findAll('[data-testid="panel-overloaded-row"]')
    expect(filas).toHaveLength(2)
    expect(filas[0].text()).toContain('Sebastian')
    expect(filas[0].text()).toContain('Semanas 45 y 46')
    expect(filas[0].text()).toContain('hasta 125 %')
    expect(filas[1].text()).toContain('Marta')
  })

  it('dibuja el uso del equipo semana a semana', async () => {
    const wrapper = await mountView()

    const grafico = wrapper.find('[data-testid="panel-bars"]')
    expect(grafico.exists()).toBe(true)
    expect(grafico.attributes('role')).toBe('img')
    expect(grafico.attributes('aria-label')).toContain('semana 45')
  })

  it('ordena los proyectos por carga y cuenta los activos', async () => {
    const wrapper = await mountView()

    const filas = wrapper.findAll('[data-testid="panel-project-row"]')
    expect(filas).toHaveLength(2)
    expect(filas[0].text()).toContain('Linea Pasteurizadora SIVE')
    expect(filas[0].text()).toContain('70 h')
    expect(wrapper.find('[data-testid="panel-card-projects"]').text()).toContain('1')
  })

  it('lista la planificacion incompleta con su motivo', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-pending-count"]').text()).toContain('2')
    const filas = wrapper.findAll('[data-testid="panel-pending-row"]')
    expect(filas).toHaveLength(2)
    expect(filas[0].text()).toContain('Montaje de cuadros')
    expect(filas[0].text()).toContain('Sin persona')
    expect(filas[1].text()).toContain('Sin fechas')
    expect(wrapper.find('[data-testid="panel-pending-resolve"]').attributes('href')).toBe(
      '/projects/1/kanban',
    )
  })

  it('cuenta los proyectos y las tareas por estado', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-projects-status"]').text()).toContain('Activo')
    expect(wrapper.find('[data-testid="panel-tasks-status"]').text()).toContain('En Desarrollo')
  })

  it('desglosa el estado por departamento cuando hay mas de uno', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-departments"]').exists()).toBe(true)
    const filas = wrapper.findAll('[data-testid="panel-department-row"]')
    expect(filas).toHaveLength(3)
    expect(filas[0].text()).toContain('Alimentación')
    expect(filas[0].text()).toContain('88 %')
    expect(filas[1].text()).toContain('Energía')
    expect(filas[1].text()).toContain('51 %')
    expect(filas[2].text()).toContain('Medio Ambiente')
  })

  it('el desglose dice cuantos proyectos y cuantas sobrecargas tiene cada area', async () => {
    const wrapper = await mountView()

    const filas = wrapper.findAll('[data-testid="panel-department-row"]')
    expect(filas[0].text()).toContain('57.28 h planificadas')
    expect(filas[0].text()).toContain('152 h')
  })

  it('no enseña el desglose cuando solo hay un departamento', async () => {
    setupFetch({ ...panel, by_department: [byDepartment[0]] })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-departments"]').exists()).toBe(false)
  })

  it('un departamento sin capacidad conocida lo dice', async () => {
    setupFetch({
      ...panel,
      by_department: [{ ...byDepartment[0], utilization: null }, byDepartment[1]],
    })

    const wrapper = await mountView()

    expect(wrapper.findAll('[data-testid="panel-department-row"]')[0].text()).toContain(
      'sin capacidad',
    )
  })

  it('avisa cuando no hay nada planificado', async () => {
    setupFetch({
      week: null,
      is_current_week: false,
      planned_hours: 0,
      capacity_hours: 0,
      utilization: null,
      overloaded: [],
      projects_by_status: {},
      tasks_by_status: {},
      projects: [],
      total_tasks: 0,
      total_people: 0,
      weeks: [],
      pending: [],
    })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-utilization"]').text()).toContain('sin capacidad')
    expect(wrapper.find('[data-testid="panel-overloaded-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="panel-pending-empty"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('No hay proyectos visibles')
  })

  it('muestra el error si el servidor no responde', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ access_token: 'tok', token_type: 'bearer', user: {} })
      }
      return jsonResponse({ detail: 'Fallo del servidor' }, false, 500)
    })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-error"]').text()).toContain('Fallo del servidor')
  })

  it('lista los incidentes pendientes con la persona, la semana y la carga', async () => {
    setupFetch(panel, { incidents: [incident] })

    const wrapper = await mountView()

    const bloque = wrapper.find('[data-testid="panel-incidents"]')
    expect(bloque.exists()).toBe(true)
    expect(bloque.text()).toContain('1 incidente por encima del umbral de aprobación')
    const fila = wrapper.find('[data-testid="panel-incident-11"]')
    expect(fila.text()).toContain('Sebastian')
    expect(fila.text()).toContain('Alimentación')
    expect(fila.text()).toContain('Semana 46')
    expect(fila.text()).toContain('48 h de 40 h')
    expect(fila.text()).toContain('umbral de aprobación 100 %')
  })

  it('aprobar un incidente envía la decisión con la nota y la lista se recarga', async () => {
    setupFetch(panel, { incidents: [incident] })

    const wrapper = await mountView()
    await wrapper.find('[data-testid="panel-incident-approve-11"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="incident-note"]').setValue('Cubierto en proyecto B')
    await wrapper.find('[data-testid="incident-approve-submit"]').trigger('click')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) =>
        url.endsWith('/capacity-incidents/11/resolve') && options.method === 'POST',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toEqual({
      decision: 'aprobada',
      note: 'Cubierto en proyecto B',
    })
    expect(wrapper.find('[data-testid="panel-incident-11"]').exists()).toBe(false)
  })

  it('rechazar un incidente envía la decisión de rechazo', async () => {
    setupFetch(panel, { incidents: [incident] })

    const wrapper = await mountView()
    await wrapper.find('[data-testid="panel-incident-reject-11"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="incident-reject-submit"]').trigger('click')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) =>
        url.endsWith('/capacity-incidents/11/resolve') && options.method === 'POST',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toEqual({ decision: 'rechazada', note: null })
  })

  it('el jefe de otro departamento ve el incidente pero no puede resolverlo', async () => {
    setupFetch(panel, {
      incidents: [incident],
      scope: scopeFor('jefe_departamento', { department_id: 99 }),
    })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-incident-11"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="panel-incident-approve-11"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="panel-incident-reject-11"]').exists()).toBe(false)
  })

  it('el jefe del departamento ve los botones de aprobar y rechazar', async () => {
    setupFetch(panel, {
      incidents: [incident],
      scope: scopeFor('jefe_departamento', { department_id: 4 }),
    })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-incident-approve-11"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="panel-incident-reject-11"]').exists()).toBe(true)
  })

  it('el tecnico ve el incidente de su propia carga pero no lo resuelve', async () => {
    setupFetch(panel, { incidents: [incident], scope: scopeFor('tecnico', { id: 3 }) })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-incident-11"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="panel-incident-approve-11"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="panel-incident-reject-11"]').exists()).toBe(false)
  })

  it('sin incidentes pendientes no aparece el bloque, resueltos incluidos', async () => {
    setupFetch(panel, {
      incidents: [
        {
          ...incident,
          state: 'aprobada',
          resolved_at: '2026-11-16T12:00:00Z',
          resolved_by: 'Ivan',
        },
      ],
    })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="panel-incidents"]').exists()).toBe(false)
  })
})
