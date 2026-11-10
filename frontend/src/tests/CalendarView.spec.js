import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import DayDetail from '../components/DayDetail.vue'
import TaskDetailPanel from '../components/TaskDetailPanel.vue'
import WeekGrid from '../components/WeekGrid.vue'
import CalendarView from '../views/CalendarView.vue'

const feed = {
  tasks: [
    {
      id: 1,
      name: 'Programacion SCADA · Ana',
      title: 'Programacion SCADA',
      start: '2026-11-02',
      end: '2026-11-06',
      progress: 50,
      dependencies: '',
      custom_class: 'persona-0',
      project_id: 1,
      project_name: 'Linea Pasteurizadora SIVE',
      assigned_to: 2,
      assigned_name: 'Ana',
      status: 'in_progress',
    },
    {
      id: 2,
      name: 'Cableado de campo',
      title: 'Cableado de campo',
      start: '2026-11-09',
      end: '2026-11-10',
      progress: 75,
      dependencies: '',
      custom_class: '',
      project_id: 2,
      project_name: 'Red de tuberias linea 2',
      assigned_to: null,
      assigned_name: null,
      status: 'testing',
    },
  ],
  members: [{ user_id: 2, name: 'Ana', css_class: 'persona-0' }],
  undated_task_ids: [7],
  unassigned_task_ids: [],
}

const diasNoLaborables = [
  {
    id: 1,
    date: '2026-11-02',
    name: 'Puente',
    scope: 'global',
    department_id: null,
    department_name: null,
    half_day: false,
  },
  {
    id: 2,
    date: '2026-11-09',
    name: 'Fiesta local',
    scope: 'department',
    department_id: 2,
    department_name: 'Oficina Técnica / EPLAN',
    half_day: false,
  },
]

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

/** Ambito de quien entra: los proyectos en los que puede escribir. */
const AMBITO = {
  user: { id: 9, name: 'Admin' },
  role_label: 'Gerente',
  is_manager: true,
  department_name: null,
  visible_project_ids: [1, 2],
  editable_project_ids: [1, 2],
}

/** Directorio de personas visibles. */
const DIRECTORIO = [
  {
    id: 2,
    name: 'Ana',
    email: 'ana@example.com',
    company_role: 'tecnico',
    company_role_label: 'Tecnico',
    employment_type: 'plantilla',
    employment_type_label: 'Plantilla',
    department_id: 1,
    department_name: 'Automatizacion & SCADA',
  },
]

/** Proyectos visibles con el departamento que los gestiona. */
const PROYECTOS = [
  {
    id: 1,
    name: 'Linea Pasteurizadora SIVE',
    status: 'active',
    parent_id: null,
    department_id: 1,
    owner_id: 9,
    owner_name: 'Admin',
  },
  {
    id: 2,
    name: 'Red de tuberias linea 2',
    status: 'active',
    parent_id: null,
    department_id: 2,
    owner_id: 9,
    owner_name: 'Admin',
  },
]

const DEPARTAMENTOS = [
  { id: 1, name: 'Automatizacion & SCADA' },
  { id: 2, name: 'Oficina Tecnica / EPLAN' },
]

/** Detalle de la tarea que pide el panel de detalle. */
const DETALLE_TAREA = {
  id: 1,
  title: 'Programacion SCADA',
  assigned_to: 2,
  status: 'in_progress',
  start_date: '2026-11-02',
  end_date: '2026-11-06',
  estimated_hours: 8,
  description: '',
  project_id: 1,
}

/** Personas con tareas: Ana y Beto son del departamento 1, Carla del 2. */
const feedVisibilidad = {
  tasks: [
    {
      id: 21,
      title: 'Tarea de Ana',
      start: '2026-11-02',
      end: '2026-11-02',
      custom_class: 'persona-0',
      project_id: 1,
      project_name: 'Linea Pasteurizadora SIVE',
      assigned_to: 2,
      assigned_name: 'Ana',
      status: 'in_progress',
    },
    {
      id: 22,
      title: 'Tarea de Beto',
      start: '2026-11-03',
      end: '2026-11-03',
      custom_class: 'persona-1',
      project_id: 1,
      project_name: 'Linea Pasteurizadora SIVE',
      assigned_to: 3,
      assigned_name: 'Beto',
      status: 'in_progress',
    },
    {
      id: 23,
      title: 'Tarea de Carla',
      start: '2026-11-04',
      end: '2026-11-04',
      custom_class: 'persona-2',
      project_id: 2,
      project_name: 'Red de tuberias linea 2',
      assigned_to: 4,
      assigned_name: 'Carla',
      status: 'in_progress',
    },
  ],
  members: [
    { user_id: 2, name: 'Ana', css_class: 'persona-0' },
    { user_id: 3, name: 'Beto', css_class: 'persona-1' },
    { user_id: 4, name: 'Carla', css_class: 'persona-2' },
  ],
  undated_task_ids: [],
  unassigned_task_ids: [],
}

/** Directorio con el departamento de cada persona del feed de visibilidad. */
const DIRECTORIO_VISIBILIDAD = [
  {
    id: 2,
    name: 'Ana',
    department_id: 1,
    department_name: 'Automatizacion & SCADA',
  },
  {
    id: 3,
    name: 'Beto',
    department_id: 1,
    department_name: 'Automatizacion & SCADA',
  },
  {
    id: 4,
    name: 'Carla',
    department_id: 2,
    department_name: 'Oficina Tecnica / EPLAN',
  },
]

function setupFetch({
  payload = feed,
  dias = diasNoLaborables,
  ambito = null,
  directorio = null,
  proyectos = null,
  departamentos = null,
} = {}) {
  const calls = []
  global.fetch = vi.fn(async (url) => {
    calls.push({ url })
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.includes('/gantt')) return jsonResponse(payload)
    if (url.endsWith('/non-working-days')) return jsonResponse(dias)
    if (url.endsWith('/api/me')) {
      return ambito ? jsonResponse(ambito) : jsonResponse({ detail: 'no encontrado' }, false, 404)
    }
    if (url.endsWith('/api/people')) {
      return directorio
        ? jsonResponse(directorio)
        : jsonResponse({ detail: 'no encontrado' }, false, 404)
    }
    if (url.endsWith('/api/projects')) {
      return proyectos ? jsonResponse(proyectos) : jsonResponse({ detail: 'no encontrado' }, false, 404)
    }
    if (url.endsWith('/api/departments')) {
      return departamentos
        ? jsonResponse(departamentos)
        : jsonResponse({ detail: 'no encontrado' }, false, 404)
    }
    if (url.includes('/activity')) return jsonResponse({ items: [] })
    if (/\/tasks\/\d+\/comments$/.test(url)) return jsonResponse([])
    if (/\/tasks\/\d+\/checklist$/.test(url)) return jsonResponse([])
    if (/\/tasks\/\d+$/.test(url)) return jsonResponse(DETALLE_TAREA)
    if (/\/projects\/\d+\/members$/.test(url)) return jsonResponse([])
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
  return calls
}

/** URL de la ultima peticion del feed de Gantt. */
function ultimaUrlGantt(calls) {
  const urls = calls.filter((call) => call.url.includes('/gantt')).map((call) => call.url)
  return urls[urls.length - 1]
}

/** Deja que terminen las peticiones y las recargas que encadenan. */
async function settle() {
  await flushPromises()
  await flushPromises()
  await flushPromises()
}

/**
 * Monta el calendario.
 *
 * El proyecto es un filtro que vive en la URL, de modo que la vista se monta
 * siempre en la misma ruta y lo que cambia es la consulta.
 */
async function mountView(query = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/calendar', name: 'calendar', component: { template: '<div />' } }],
  })
  await router.push({ path: '/calendar', query })
  await router.isReady()

  const wrapper = mount(CalendarView, {
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  await flushPromises()
  return { wrapper, router }
}

describe('CalendarView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
    // El calendario arranca en el mes en curso: se fija la fecha para que la
    // prueba no dependa del dia en que se ejecuta.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 6))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('muestra la rejilla del mes en curso', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="calendar-month"]').text()).toBe('Noviembre 2026')
    expect(wrapper.findAll('[data-testid="calendar-cell-2026-11-02"]')).toHaveLength(1)
  })

  it('coloca cada tarea en los dias que ocupa', async () => {
    const { wrapper } = await mountView()

    const celdas = wrapper.findAll('[data-testid="calendar-task"]')
    // La primera va del lunes 2 al viernes 6: cinco dias. La segunda, del
    // lunes 9 al martes 10: dos dias mas.
    expect(celdas).toHaveLength(7)
    expect(wrapper.find('[data-testid="calendar-cell-2026-11-04"]').text()).toContain(
      'Programacion SCADA',
    )
    expect(wrapper.find('[data-testid="calendar-cell-2026-11-07"]').text()).not.toContain(
      'Programacion SCADA',
    )
  })

  it('el fin de semana queda vacio', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="calendar-cell-2026-11-07"]').text()).not.toContain(
      'Programacion SCADA',
    )
    expect(wrapper.find('[data-testid="calendar-cell-2026-11-08"]').text()).not.toContain(
      'Cableado de campo',
    )
  })

  it('marca los dias no laborables con su alcance', async () => {
    const { wrapper } = await mountView()

    const marcados = wrapper.findAll('[data-testid="calendar-non-working"]')
    expect(marcados).toHaveLength(2)
    expect(marcados[0].text()).toBe('Puente')
    expect(marcados[1].text()).toBe('Fiesta local')
  })

  it('avisa de las tareas sin fechas', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('1 tarea(s) sin fechas')
  })

  it('con filtro de proyecto pide solo las tareas de ese proyecto', async () => {
    const calls = setupFetch()

    await mountView({ project: '2' })

    const url = calls.find((call) => call.url.includes('/gantt')).url
    expect(url).toContain('project_id=2')
  })

  it('sin filtro pide las tareas de toda la organizacion', async () => {
    const calls = setupFetch()

    await mountView()

    const url = calls.find((call) => call.url.includes('/gantt')).url
    expect(url).not.toContain('project_id=')
  })

  it('cambia de mes con los botones', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-next"]').trigger('click')
    expect(wrapper.find('[data-testid="calendar-month"]').text()).toBe('Diciembre 2026')

    await wrapper.find('[data-testid="calendar-prev"]').trigger('click')
    await wrapper.find('[data-testid="calendar-prev"]').trigger('click')
    expect(wrapper.find('[data-testid="calendar-month"]').text()).toBe('Octubre 2026')

    await wrapper.find('[data-testid="calendar-today"]').trigger('click')
    expect(wrapper.find('[data-testid="calendar-month"]').text()).toBe('Noviembre 2026')
  })

  it('la celda del mes muestra todas sus tareas y se desplaza', async () => {
    const extras = [10, 11, 12, 13].map((id) => ({
      id,
      name: `Extra ${id}`,
      title: `Extra ${id}`,
      start: '2026-11-02',
      end: '2026-11-02',
      progress: 0,
      dependencies: '',
      custom_class: 'persona-1',
      project_id: 1,
      project_name: 'Linea Pasteurizadora SIVE',
      assigned_to: 2,
      assigned_name: 'Ana',
      status: 'backlog',
    }))
    setupFetch({ payload: { ...feed, tasks: [...feed.tasks, ...extras] } })

    const { wrapper } = await mountView()

    // Nada se esconde: la celda lleva todas sus tareas y deja que se desplace.
    const celda = wrapper.find('[data-testid="calendar-cell-2026-11-02"]')
    expect(celda.findAll('[data-testid="calendar-task"]')).toHaveLength(5)
    expect(celda.find('[data-testid="calendar-task-list"]').classes()).toContain('overflow-y-auto')
  })

  it('fija el alto de la celda para que las filas del mes midan igual', async () => {
    const { wrapper } = await mountView()

    // El alto va en el contenido de la celda, no en la celda: en una tabla el
    // alto de la celda es el minimo y la fila crece con el contenido.
    const cuerpo = wrapper.find('[data-testid="calendar-cell-body"]')
    expect(cuerpo.classes()).toContain('h-28')
    expect(cuerpo.classes()).toContain('flex-col')
  })

  it('muestra el error si el servidor no responde', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ access_token: 'tok', token_type: 'bearer', user: {} })
      }
      return jsonResponse({ detail: 'Fallo del servidor' }, false, 500)
    })

    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="calendar-error"]').text()).toContain('Fallo del servidor')
  })
})

describe('CalendarView en modo semanal', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 6))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('arranca en la vista mensual', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="calendar-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="week-grid"]').exists()).toBe(false)
  })

  it('cambia a la vista semanal con los dias laborables de la semana', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')

    expect(wrapper.find('[data-testid="week-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="calendar-grid"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="calendar-week"]').text()).toContain('2026-W45')
    expect(wrapper.find('[data-testid="week-cell-2026-11-02"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="week-cell-2026-11-06"]').exists()).toBe(true)
    // El fin de semana no tiene columna.
    expect(wrapper.find('[data-testid="week-cell-2026-11-07"]').exists()).toBe(false)
  })

  it('muestra el detalle de cada tarea', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')

    const fichas = wrapper.findAll('[data-testid="week-task"]')
    // La primera tarea va del lunes 2 al viernes 6: cinco dias.
    expect(fichas).toHaveLength(5)
    expect(fichas[0].text()).toContain('Programacion SCADA')
    expect(fichas[0].text()).toContain('Ana')
    expect(fichas[0].text()).toContain('En Desarrollo')
  })

  it('navega de semana en semana', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    await wrapper.find('[data-testid="calendar-next"]').trigger('click')

    expect(wrapper.find('[data-testid="calendar-week"]').text()).toContain('2026-W46')
    expect(wrapper.find('[data-testid="week-cell-2026-11-09"]').exists()).toBe(true)
    // La segunda tarea ocupa el lunes 9 y el martes 10.
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(2)

    await wrapper.find('[data-testid="calendar-prev"]').trigger('click')
    expect(wrapper.find('[data-testid="calendar-week"]').text()).toContain('2026-W45')
  })

  it('marca los dias no laborables de la semana', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    const marcados = wrapper.findAll('[data-testid="week-non-working"]')
    expect(marcados).toHaveLength(1)
    expect(marcados[0].text()).toBe('Puente')

    await wrapper.find('[data-testid="calendar-next"]').trigger('click')
    const siguientes = wrapper.findAll('[data-testid="week-non-working"]')
    expect(siguientes).toHaveLength(1)
    expect(siguientes[0].text()).toBe('Fiesta local')
  })

  it('vuelve a la vista mensual', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    await wrapper.find('[data-testid="calendar-view-month"]').trigger('click')

    expect(wrapper.find('[data-testid="calendar-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="week-grid"]').exists()).toBe(false)
  })
})

describe('CalendarView en modo dia', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 6))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('al pulsar un dia del mes se abre el detalle de ese dia', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-day-2026-11-09"]').trigger('click')

    expect(wrapper.find('[data-testid="day-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="calendar-day"]').text()).toBe('Lunes 9 de noviembre de 2026')
    expect(wrapper.find('[data-testid="day-task"]').text()).toContain('Cableado de campo')
  })

  it('el dia se puede abrir desde la vista semanal', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    await wrapper.find('[data-testid="week-day-2026-11-04"]').trigger('click')

    expect(wrapper.find('[data-testid="day-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="calendar-day"]').text()).toBe('Miércoles 4 de noviembre de 2026')
  })

  it('la vista de dia navega de dia en dia', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-day"]').trigger('click')
    expect(wrapper.find('[data-testid="calendar-day"]').text()).toBe('Viernes 6 de noviembre de 2026')

    await wrapper.find('[data-testid="calendar-next"]').trigger('click')
    expect(wrapper.find('[data-testid="calendar-day"]').text()).toBe('Sábado 7 de noviembre de 2026')

    await wrapper.find('[data-testid="calendar-prev"]').trigger('click')
    await wrapper.find('[data-testid="calendar-prev"]').trigger('click')
    expect(wrapper.find('[data-testid="calendar-day"]').text()).toBe('Jueves 5 de noviembre de 2026')
  })

  it('un dia sin tareas lo dice', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-day-2026-11-01"]').trigger('click')

    expect(wrapper.find('[data-testid="day-empty"]').text()).toContain('No hay tareas')
  })

  it('marca los dias no laborables del dia', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-day-2026-11-09"]').trigger('click')

    expect(wrapper.find('[data-testid="day-view"]').text()).toContain('Fiesta local')
  })
})

describe('CalendarView con el detalle de la tarea', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 6))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('al pulsar una tarea de la rejilla se abre su detalle', async () => {
    setupFetch({ ambito: AMBITO })
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-cell-2026-11-02"] [data-testid="calendar-task"]')
      .trigger('click')

    const panel = wrapper.findComponent(TaskDetailPanel)
    expect(panel.props('open')).toBe(true)
    expect(panel.props('taskId')).toBe(1)
    expect(wrapper.find('[data-testid="task-panel"]').exists()).toBe(true)
  })

  it('una tarea de un proyecto editable se abre con permiso de escritura', async () => {
    setupFetch({ ambito: { ...AMBITO, editable_project_ids: [1] } })
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-cell-2026-11-02"] [data-testid="calendar-task"]')
      .trigger('click')

    expect(wrapper.findComponent(TaskDetailPanel).props('canEdit')).toBe(true)
  })

  it('una tarea de un proyecto que no se puede editar se abre en solo lectura', async () => {
    setupFetch({ ambito: { ...AMBITO, editable_project_ids: [2] } })
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-cell-2026-11-02"] [data-testid="calendar-task"]')
      .trigger('click')

    expect(wrapper.findComponent(TaskDetailPanel).props('open')).toBe(true)
    expect(wrapper.findComponent(TaskDetailPanel).props('canEdit')).toBe(false)
  })

  it('sin ambito la tarea se abre igual, pero en solo lectura', async () => {
    setupFetch()
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-cell-2026-11-02"] [data-testid="calendar-task"]')
      .trigger('click')

    expect(wrapper.findComponent(TaskDetailPanel).props('open')).toBe(true)
    expect(wrapper.findComponent(TaskDetailPanel).props('canEdit')).toBe(false)
  })

  it('al guardar en el panel el calendario se recarga', async () => {
    const calls = setupFetch({ ambito: AMBITO })
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-cell-2026-11-02"] [data-testid="calendar-task"]')
      .trigger('click')
    const antes = calls.filter((call) => call.url.includes('/gantt')).length

    wrapper.findComponent(TaskDetailPanel).vm.$emit('saved')
    await settle()

    expect(calls.filter((call) => call.url.includes('/gantt')).length).toBe(antes + 1)
    expect(wrapper.findComponent(TaskDetailPanel).props('open')).toBe(true)
  })

  it('al borrar en el panel el calendario se recarga y el panel se cierra', async () => {
    const calls = setupFetch({ ambito: AMBITO })
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-cell-2026-11-02"] [data-testid="calendar-task"]')
      .trigger('click')
    const antes = calls.filter((call) => call.url.includes('/gantt')).length

    wrapper.findComponent(TaskDetailPanel).vm.$emit('deleted')
    await settle()

    expect(calls.filter((call) => call.url.includes('/gantt')).length).toBe(antes + 1)
    expect(wrapper.findComponent(TaskDetailPanel).props('open')).toBe(false)
  })

  it('la tarea de la vista semanal tambien abre su detalle', async () => {
    setupFetch({ ambito: AMBITO })
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    await wrapper.find('[data-testid="week-task"]').trigger('click')

    expect(wrapper.findComponent(TaskDetailPanel).props('open')).toBe(true)
    expect(wrapper.findComponent(TaskDetailPanel).props('taskId')).toBe(1)
  })

  it('la tarea de la vista de dia tambien abre su detalle', async () => {
    setupFetch({ ambito: AMBITO })
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-day-2026-11-09"]').trigger('click')
    await wrapper.find('[data-testid="day-task"]').trigger('click')

    expect(wrapper.findComponent(TaskDetailPanel).props('open')).toBe(true)
    expect(wrapper.findComponent(TaskDetailPanel).props('taskId')).toBe(2)
  })
})

describe('CalendarView con filtros', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 6))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('los filtros ofrecen los departamentos, proyectos y personas visibles', async () => {
    setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })
    const { wrapper } = await mountView()

    const opciones = (testid) =>
      wrapper.find(`[data-testid="${testid}"]`).findAll('option').map((option) => option.text())

    expect(opciones('filter-department')).toEqual([
      'Todos los departamentos',
      'Automatizacion & SCADA',
      'Oficina Tecnica / EPLAN',
    ])
    expect(opciones('filter-project')).toEqual([
      'Todos los proyectos',
      'Linea Pasteurizadora SIVE',
      'Red de tuberias linea 2',
    ])
    expect(opciones('filter-person')).toEqual(['Todas las personas', 'Ana'])
  })

  it('el filtro de departamento acota las tareas que se ven', async () => {
    setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })
    const { wrapper } = await mountView()

    // Sin filtros: la primera tarea ocupa cinco dias y la segunda dos.
    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(7)

    await wrapper.find('[data-testid="filter-department"]').setValue('2')
    await settle()
    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(2)

    await wrapper.find('[data-testid="filter-department"]').setValue('')
    await settle()
    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(7)
  })

  it('el filtro de proyecto acota las tareas que se ven', async () => {
    setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="filter-project"]').setValue('2')
    await settle()
    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(2)

    await wrapper.find('[data-testid="filter-project"]').setValue('')
    await settle()
    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(7)
  })

  it('el filtro de persona acota las tareas que se ven', async () => {
    setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="filter-person"]').setValue('2')
    await settle()
    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(5)

    await wrapper.find('[data-testid="filter-person"]').setValue('')
    await settle()
    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(7)
  })

  it('los filtros se combinan y avisan cuando no queda ninguna tarea', async () => {
    setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })
    const { wrapper } = await mountView({ department: '1', project: '2' })

    // La primera tarea es del proyecto 1 y la segunda del 2: juntos no dejan
    // ninguna.
    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="calendar-no-match"]').exists()).toBe(true)
  })

  it('los filtros van al backend en la peticion del feed', async () => {
    const calls = setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })

    await mountView({ department: '1', assigned_to: '2' })

    const url = ultimaUrlGantt(calls)
    expect(url).toContain('department_id=1')
    expect(url).toContain('assigned_to=2')
  })

  it('los filtros se quedan en la URL', async () => {
    setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })
    const { wrapper, router } = await mountView()

    await wrapper.find('[data-testid="filter-person"]').setValue('2')
    await settle()

    expect(router.currentRoute.value.query.assigned_to).toBe('2')
  })

  it('los tres filtros usan el formato cuadrado de las demas vistas', async () => {
    setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })
    const { wrapper } = await mountView()

    const filtros = [
      { testid: 'filter-department', etiqueta: 'Departamento' },
      { testid: 'filter-project', etiqueta: 'Proyecto' },
      { testid: 'filter-person', etiqueta: 'Persona' },
    ]

    for (const filtro of filtros) {
      const select = wrapper.find(`[data-testid="${filtro.testid}"]`)
      expect(select.exists()).toBe(true)
      expect([...select.classes()]).toEqual([
        'rounded',
        'border',
        'border-slate-300',
        'bg-white',
        'px-2',
        'py-1.5',
        'text-sm',
      ])

      const label = select.element.closest('label')
      expect(label).not.toBeNull()
      expect([...label.classList]).toEqual(['text-xs', 'font-medium', 'text-slate-600'])

      const span = label.querySelector('span')
      expect([...span.classList]).toEqual(['mb-1', 'block'])
      expect(span.textContent).toBe(filtro.etiqueta)
    }

    // El contenedor de los filtros deja el mismo margen que en las otras vistas.
    const contenedor = wrapper.find('[data-testid="filter-department"]').element.closest('label')
      .parentElement
    expect([...contenedor.classList]).toContain('gap-3')
    expect([...contenedor.classList]).not.toContain('gap-2')
  })

  it('los filtros ya no se muestran como pastilla', async () => {
    setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })
    const { wrapper } = await mountView()

    for (const testid of ['filter-department', 'filter-project', 'filter-person']) {
      const select = wrapper.find(`[data-testid="${testid}"]`)
      const label = select.element.closest('label')
      expect([...label.classList]).not.toContain('rounded-full')
      expect([...label.classList]).not.toContain('px-3')
      expect(select.classes()).not.toContain('rounded-full')
      expect(select.classes()).not.toContain('border-0')
      expect(select.classes()).not.toContain('bg-transparent')
      expect(select.classes()).not.toContain('focus:ring-0')
    }
  })
})

describe('CalendarView con el panel de visibilidad', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 6))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('el panel de visibilidad se abre con su boton', async () => {
    setupFetch({ payload: feedVisibilidad, directorio: DIRECTORIO_VISIBILIDAD })
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="visibility-panel"]').exists()).toBe(false)

    await wrapper.find('[data-testid="toggle-visibility"]').trigger('click')

    expect(wrapper.find('[data-testid="visibility-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hide-person-2"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hide-department-1"]').exists()).toBe(true)
  })

  it('esconder una persona quita sus tareas y la quita de la leyenda', async () => {
    setupFetch({ payload: feedVisibilidad, directorio: DIRECTORIO_VISIBILIDAD })
    const { wrapper } = await mountView()

    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(3)

    await wrapper.find('[data-testid="toggle-visibility"]').trigger('click')
    await wrapper.find('[data-testid="hide-person-2"]').setValue(false)
    await flushPromises()

    // La tarea de Ana no aparece en ningun dia.
    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="calendar-cell-2026-11-02"]').text()).not.toContain(
      'Tarea de Ana',
    )
    // Las de los demas siguen ahi.
    expect(wrapper.find('[data-testid="calendar-cell-2026-11-03"]').text()).toContain('Tarea de Beto')
    expect(wrapper.find('[data-testid="calendar-cell-2026-11-04"]').text()).toContain('Tarea de Carla')
    // Y la leyenda ya no la ensena.
    expect(wrapper.find('[data-testid="calendar-legend"]').text()).not.toContain('Ana')
    expect(wrapper.find('[data-testid="calendar-legend"]').text()).toContain('Beto')
    expect(wrapper.find('[data-testid="hidden-count"]').text()).toContain('1 oculto')
  })

  it('esconder un departamento quita las tareas de todas sus personas', async () => {
    setupFetch({ payload: feedVisibilidad, directorio: DIRECTORIO_VISIBILIDAD })
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="toggle-visibility"]').trigger('click')
    await wrapper.find('[data-testid="hide-department-1"]').setValue(false)
    await flushPromises()

    // Ana y Beto son del departamento 1: sus tareas no salen.
    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="calendar-cell-2026-11-02"]').text()).not.toContain(
      'Tarea de Ana',
    )
    expect(wrapper.find('[data-testid="calendar-cell-2026-11-03"]').text()).not.toContain(
      'Tarea de Beto',
    )
    // Carla es del departamento 2: la suya sigue.
    expect(wrapper.find('[data-testid="calendar-cell-2026-11-04"]').text()).toContain('Tarea de Carla')
    expect(wrapper.find('[data-testid="calendar-legend"]').text()).not.toContain('Ana')
    expect(wrapper.find('[data-testid="calendar-legend"]').text()).not.toContain('Beto')
    expect(wrapper.find('[data-testid="hidden-count"]').text()).toContain('2 ocultos')
  })

  it('mostrar todos vuelve a ensenar las tareas y la leyenda', async () => {
    setupFetch({ payload: feedVisibilidad, directorio: DIRECTORIO_VISIBILIDAD })
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="toggle-visibility"]').trigger('click')
    await wrapper.find('[data-testid="hide-person-2"]').setValue(false)
    await flushPromises()
    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(2)

    await wrapper.find('[data-testid="show-all"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="calendar-task"]')).toHaveLength(3)
    expect(wrapper.find('[data-testid="calendar-cell-2026-11-02"]').text()).toContain('Tarea de Ana')
    expect(wrapper.find('[data-testid="calendar-legend"]').text()).toContain('Ana')
    expect(wrapper.find('[data-testid="hidden-count"]').exists()).toBe(false)
  })

  it('las tareas escondidas desaparecen tambien de la semana y del dia', async () => {
    setupFetch({ payload: feedVisibilidad, directorio: DIRECTORIO_VISIBILIDAD })
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="toggle-visibility"]').trigger('click')
    await wrapper.find('[data-testid="hide-person-2"]').setValue(false)
    await flushPromises()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="week-cell-2026-11-02"]').text()).not.toContain('Tarea de Ana')

    await wrapper.find('[data-testid="week-day-2026-11-04"]').trigger('click')
    expect(wrapper.findAll('[data-testid="day-task"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="day-view"]').text()).not.toContain('Tarea de Ana')
  })

  it('esconder no toca la URL ni vuelve a pedir los datos', async () => {
    const calls = setupFetch({ payload: feedVisibilidad, directorio: DIRECTORIO_VISIBILIDAD })
    const { wrapper, router } = await mountView()

    const peticiones = calls.filter((call) => call.url.includes('/gantt')).length

    await wrapper.find('[data-testid="toggle-visibility"]').trigger('click')
    await wrapper.find('[data-testid="hide-person-2"]').setValue(false)
    await flushPromises()

    expect(Object.keys(router.currentRoute.value.query)).toEqual([])
    expect(calls.filter((call) => call.url.includes('/gantt')).length).toBe(peticiones)
  })
})

describe('WeekGrid y DayDetail', () => {
  it('la rejilla semanal emite el id de la tarea pulsada', async () => {
    const wrapper = mount(WeekGrid, {
      props: { weekKey: '2026-W45', tasks: feed.tasks, nonWorkingDays: [] },
    })

    await wrapper.find('[data-testid="week-task"]').trigger('click')

    expect(wrapper.emitted('open-task')[0]).toEqual([1])
  })

  it('el detalle del dia emite el id de la tarea pulsada', async () => {
    const wrapper = mount(DayDetail, {
      props: { date: '2026-11-02', tasks: feed.tasks, nonWorkingDays: [] },
    })

    await wrapper.find('[data-testid="day-task"]').trigger('click')

    expect(wrapper.emitted('open-task')[0]).toEqual([1])
  })
})
