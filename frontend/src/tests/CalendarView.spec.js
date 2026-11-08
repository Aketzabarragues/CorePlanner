import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

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

function setupFetch({ payload = feed, dias = diasNoLaborables } = {}) {
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
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
  return calls
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
