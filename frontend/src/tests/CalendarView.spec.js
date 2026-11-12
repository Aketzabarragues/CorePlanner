import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import DayDetail from '../components/DayDetail.vue'
import TaskDetailPanel from '../components/TaskDetailPanel.vue'
import WeekGrid from '../components/WeekGrid.vue'
import WeekLanes from '../components/common/WeekLanes.vue'
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
      project_color: '#1f6feb',
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
      project_color: '#0a3d91',
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

/** Comprueba que un elemento se pinte con el color dado. */
function esperaColor(elemento, hex) {
  const estilo = elemento.attributes('style') ?? ''
  const partes = hex.slice(1).match(/.{2}/g).map((par) => parseInt(par, 16))
  const rgb = partes.join(', ')
  expect(estilo).toMatch(
    new RegExp(`background-color:\\s*(#${hex.slice(1)}|rgb\\(${rgb}\\))`, 'i'),
  )
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
      project_color: '#1f6feb',
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
      project_color: '#1f6feb',
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
      project_color: '#0a3d91',
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

  it('muestra el mes en curso en una sola tabla de semanas', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="calendar-month"]').text()).toBe('Noviembre 2026')
    expect(wrapper.find('[data-testid="calendar-month-table"]').exists()).toBe(true)
    // Un solo grupo de filas por semana, todos dentro de la misma tabla.
    expect(wrapper.findAll('[data-testid="calendar-month-table"] > tbody')).toHaveLength(6)
    expect(wrapper.findAll('[data-testid="week-lanes"]')).toHaveLength(6)
  })

  it('cada semana lleva su rango y su clave', async () => {
    const { wrapper } = await mountView()

    const rangos = wrapper.findAll('[data-testid="week-lane-range"]')
    expect(rangos).toHaveLength(6)
    expect(rangos[1].text()).toBe('2 - 8 nov')
    expect(rangos[2].text()).toBe('9 - 15 nov')
    expect(wrapper.findAll('[data-testid="week-lanes"]')[2].text()).toContain('2026-W46')
  })

  it('cada persona tiene su fila en cada semana', async () => {
    const { wrapper } = await mountView()

    const filas = wrapper.findAll('[data-testid="week-lane-name-2"]')
    expect(filas).toHaveLength(6)
    expect(filas[0].text()).toContain('Ana')
  })

  it('cada tarea es una barra que ocupa los dias que tiene', async () => {
    const { wrapper } = await mountView()

    const semanas = wrapper.findAll('[data-testid="week-lanes"]')
    // La primera va del lunes 2 al viernes 6: las cinco columnas del lunes al viernes.
    const primera = semanas[1].find('[data-testid="week-task"]')
    expect(primera.text()).toContain('Programacion SCADA')
    expect(primera.text()).toContain('Linea Pasteurizadora SIVE')
    expect(primera.attributes('data-inicio')).toBe('0')
    expect(primera.attributes('data-columnas')).toBe('5')

    // La segunda va del lunes 9 al martes 10: las dos primeras columnas.
    const segunda = semanas[2].find('[data-testid="week-task"]')
    expect(segunda.text()).toContain('Cableado de campo')
    expect(segunda.attributes('data-inicio')).toBe('0')
    expect(segunda.attributes('data-columnas')).toBe('2')
  })

  it('el fin de semana se ve pero sin barras', async () => {
    const { wrapper } = await mountView()

    const sabado = wrapper.find('[data-testid="week-lane-head-2026-11-07"]')
    expect(sabado.exists()).toBe(true)
    expect(sabado.classes()).toContain('bg-slate-50')
    const domingo = wrapper.find('[data-testid="week-lane-head-2026-11-08"]')
    expect(domingo.exists()).toBe(true)
    expect(domingo.classes()).toContain('bg-slate-50')

    // Ninguna barra llega al fin de semana: las columnas son de lunes a viernes.
    for (const barra of wrapper.findAll('[data-testid="week-task"]')) {
      const fin = Number(barra.attributes('data-inicio')) + Number(barra.attributes('data-columnas'))
      expect(fin).toBeLessThanOrEqual(5)
    }
  })

  it('la barra se pinta del color de su proyecto', async () => {
    const { wrapper } = await mountView()

    const semanas = wrapper.findAll('[data-testid="week-lanes"]')
    esperaColor(semanas[1].find('[data-testid="week-task"]'), '#1f6feb')
    esperaColor(semanas[2].find('[data-testid="week-task"]'), '#0a3d91')
  })

  it('marca el dia de hoy en la cabecera', async () => {
    const { wrapper } = await mountView()

    // El reloj de la prueba esta en el viernes 6 de noviembre.
    const hoy = wrapper.findAll('[data-testid="week-lane-today"]')
    expect(hoy).toHaveLength(1)
    expect(hoy[0].text()).toBe('Hoy')
    expect(
      wrapper.findAll('[data-testid="week-lanes"]')[1].find('[data-testid="week-lane-today"]').exists(),
    ).toBe(true)
  })

  it('marca los dias no laborables con su alcance', async () => {
    const { wrapper } = await mountView()

    const marcados = wrapper.findAll('[data-testid="week-lane-holiday"]')
    expect(marcados).toHaveLength(2)
    expect(marcados[0].text()).toBe('Puente')
    expect(marcados[1].text()).toBe('Fiesta local')
  })

  it('la fila de sin asignar sale solo donde hay tareas sin persona', async () => {
    const { wrapper } = await mountView()

    // La segunda tarea no tiene persona: solo sale en su semana.
    const sinAsignar = wrapper.findAll('[data-testid="week-lane-unassigned-name"]')
    expect(sinAsignar).toHaveLength(1)
    expect(sinAsignar[0].text()).toBe('Sin asignar')
    expect(
      wrapper.findAll('[data-testid="week-lanes"]')[1].find('[data-testid="week-lane-unassigned-name"]')
        .exists(),
    ).toBe(false)
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

  it('las barras no usan la paleta por persona', async () => {
    const { wrapper } = await mountView()

    // El color es el del proyecto. La paleta por persona es del Gantt.
    const barras = wrapper.findAll('[data-testid="week-task"]')
    expect(barras.length).toBeGreaterThan(0)
    for (const barra of barras) {
      expect(barra.classes().some((clase) => clase.startsWith('persona-'))).toBe(false)
      expect(barra.classes()).not.toContain('bg-siemens-700')
    }
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

    expect(wrapper.find('[data-testid="calendar-month-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="week-grid"]').exists()).toBe(false)
  })

  it('cambia a la vista semanal con los dias laborables de la semana', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')

    expect(wrapper.find('[data-testid="week-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="calendar-month-view"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="calendar-week"]').text()).toContain('2026-W45')
    expect(wrapper.find('[data-testid="week-lane-head-2026-11-02"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="week-lane-head-2026-11-06"]').exists()).toBe(true)
    // El fin de semana tambien tiene columna, pero atenuado.
    expect(wrapper.find('[data-testid="week-lane-head-2026-11-07"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="week-lane-head-2026-11-07"]').classes()).toContain(
      'bg-slate-50',
    )
  })

  it('muestra el detalle de cada tarea', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')

    const fichas = wrapper.findAll('[data-testid="week-task"]')
    // La primera tarea va del lunes 2 al viernes 6: una sola barra.
    expect(fichas).toHaveLength(1)
    expect(fichas[0].text()).toContain('Programacion SCADA')
    expect(fichas[0].text()).toContain('Linea Pasteurizadora SIVE')
    expect(fichas[0].attributes('title')).toContain('En Desarrollo')
    expect(fichas[0].attributes('title')).toContain('2026-11-02 - 2026-11-06')
  })

  it('la barra va bajo la fila de quien la lleva', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')

    const fila = wrapper.find('[data-testid="week-lane-row-2-0"]')
    expect(fila.find('[data-testid="week-lane-name-2"]').text()).toContain('Ana')
    expect(fila.findAll('[data-testid="week-task"]')).toHaveLength(1)
  })

  it('navega de semana en semana', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    await wrapper.find('[data-testid="calendar-next"]').trigger('click')

    expect(wrapper.find('[data-testid="calendar-week"]').text()).toContain('2026-W46')
    expect(wrapper.find('[data-testid="week-lane-head-2026-11-09"]').exists()).toBe(true)
    // La segunda tarea ocupa el lunes 9 y el martes 10, y no tiene persona.
    const barras = wrapper.findAll('[data-testid="week-task"]')
    expect(barras).toHaveLength(1)
    expect(wrapper.find('[data-testid="week-lane-unassigned-name"]').exists()).toBe(true)

    await wrapper.find('[data-testid="calendar-prev"]').trigger('click')
    expect(wrapper.find('[data-testid="calendar-week"]').text()).toContain('2026-W45')
  })

  it('marca los dias no laborables de la semana', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    const marcados = wrapper.findAll('[data-testid="week-lane-holiday"]')
    expect(marcados).toHaveLength(1)
    expect(marcados[0].text()).toBe('Puente')

    await wrapper.find('[data-testid="calendar-next"]').trigger('click')
    const siguientes = wrapper.findAll('[data-testid="week-lane-holiday"]')
    expect(siguientes).toHaveLength(1)
    expect(siguientes[0].text()).toBe('Fiesta local')
  })

  it('vuelve a la vista mensual', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    await wrapper.find('[data-testid="calendar-view-month"]').trigger('click')

    expect(wrapper.find('[data-testid="calendar-month-view"]').exists()).toBe(true)
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

    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')

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

  it('cada persona sale con su seccion aunque no tenga tareas', async () => {
    const { wrapper } = await mountView()

    // El dia 11 no tiene ninguna tarea: la seccion sigue ahí, vacía.
    await wrapper.find('[data-testid="week-day-2026-11-11"]').trigger('click')

    expect(wrapper.find('[data-testid="day-person-2"]').text()).toBe('Ana')
    expect(wrapper.find('[data-testid="day-section-empty"]').text()).toBe('Sin tareas')
    expect(wrapper.findAll('[data-testid="day-task"]')).toHaveLength(0)
  })

  it('la seccion de sin asignar solo sale si hace falta', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')

    expect(wrapper.find('[data-testid="day-section-sin-asignar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="day-person-sin-asignar"]').text()).toBe('Sin asignar')

    await wrapper.find('[data-testid="calendar-view-month"]').trigger('click')
    await wrapper.find('[data-testid="week-day-2026-11-03"]').trigger('click')
    expect(wrapper.find('[data-testid="day-section-sin-asignar"]').exists()).toBe(false)
  })

  it('marca los dias no laborables del dia', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')

    expect(wrapper.find('[data-testid="day-view"]').text()).toContain('Fiesta local')
  })

  it('cada tarea del dia se pinta del color de su proyecto', async () => {
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')

    // La tarea sin persona es del segundo proyecto.
    const bloque = wrapper.find('[data-testid="day-task"]')
    esperaColor(bloque.get('div'), '#0a3d91')
    expect(bloque.text()).toContain('Red de tuberias linea 2')
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
      .find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
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
      .find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
      .trigger('click')

    expect(wrapper.findComponent(TaskDetailPanel).props('canEdit')).toBe(true)
  })

  it('una tarea de un proyecto que no se puede editar se abre en solo lectura', async () => {
    setupFetch({ ambito: { ...AMBITO, editable_project_ids: [2] } })
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
      .trigger('click')

    expect(wrapper.findComponent(TaskDetailPanel).props('open')).toBe(true)
    expect(wrapper.findComponent(TaskDetailPanel).props('canEdit')).toBe(false)
  })

  it('sin ambito la tarea se abre igual, pero en solo lectura', async () => {
    setupFetch()
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
      .trigger('click')

    expect(wrapper.findComponent(TaskDetailPanel).props('open')).toBe(true)
    expect(wrapper.findComponent(TaskDetailPanel).props('canEdit')).toBe(false)
  })

  it('al guardar en el panel el calendario se recarga', async () => {
    const calls = setupFetch({ ambito: AMBITO })
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
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
      .find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
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

    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')
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

    // Sin filtros: cada tarea es una barra, la primera el lunes 2 y la segunda
    // el lunes 9.
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(2)

    await wrapper.find('[data-testid="filter-department"]').setValue('2')
    await settle()
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(1)

    await wrapper.find('[data-testid="filter-department"]').setValue('')
    await settle()
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(2)
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
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(1)

    await wrapper.find('[data-testid="filter-project"]').setValue('')
    await settle()
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(2)
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
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(1)

    await wrapper.find('[data-testid="filter-person"]').setValue('')
    await settle()
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(2)
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
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(0)
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

  it('esconder una persona quita sus tareas y su fila', async () => {
    setupFetch({ payload: feedVisibilidad, directorio: DIRECTORIO_VISIBILIDAD })
    const { wrapper } = await mountView()

    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(3)

    await wrapper.find('[data-testid="toggle-visibility"]').trigger('click')
    await wrapper.find('[data-testid="hide-person-2"]').setValue(false)
    await flushPromises()

    // La tarea de Ana no aparece en ninguna semana.
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(2)
    const semana = wrapper.findAll('[data-testid="week-lanes"]')[1]
    expect(semana.text()).not.toContain('Tarea de Ana')
    // Las de los demas siguen ahi.
    expect(semana.text()).toContain('Tarea de Beto')
    expect(semana.text()).toContain('Tarea de Carla')
    // Y su fila ya no sale.
    expect(wrapper.findAll('[data-testid="week-lane-name-2"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="week-lane-name-3"]').length).toBeGreaterThan(0)
    expect(wrapper.find('[data-testid="hidden-count"]').text()).toContain('1 oculto')
  })

  it('esconder un departamento quita las tareas de todas sus personas', async () => {
    setupFetch({ payload: feedVisibilidad, directorio: DIRECTORIO_VISIBILIDAD })
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="toggle-visibility"]').trigger('click')
    await wrapper.find('[data-testid="hide-department-1"]').setValue(false)
    await flushPromises()

    // Ana y Beto son del departamento 1: sus tareas no salen.
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(1)
    const semana = wrapper.findAll('[data-testid="week-lanes"]')[1]
    expect(semana.text()).not.toContain('Tarea de Ana')
    expect(semana.text()).not.toContain('Tarea de Beto')
    // Carla es del departamento 2: la suya sigue.
    expect(semana.text()).toContain('Tarea de Carla')
    expect(wrapper.findAll('[data-testid="week-lane-name-2"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="week-lane-name-3"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="week-lane-name-4"]').length).toBeGreaterThan(0)
    expect(wrapper.find('[data-testid="hidden-count"]').text()).toContain('2 ocultos')
  })

  it('mostrar todos vuelve a ensenar las tareas y las filas', async () => {
    setupFetch({ payload: feedVisibilidad, directorio: DIRECTORIO_VISIBILIDAD })
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="toggle-visibility"]').trigger('click')
    await wrapper.find('[data-testid="hide-person-2"]').setValue(false)
    await flushPromises()
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(2)

    await wrapper.find('[data-testid="show-all"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(3)
    expect(wrapper.findAll('[data-testid="week-lanes"]')[1].text()).toContain('Tarea de Ana')
    expect(wrapper.findAll('[data-testid="week-lane-name-2"]').length).toBeGreaterThan(0)
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
    expect(wrapper.find('[data-testid="week-grid"]').text()).not.toContain('Tarea de Ana')

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
      props: {
        weekKey: '2026-W45',
        people: [
          {
            id: 2,
            name: 'Ana',
            department_id: 1,
            department_name: 'Automatizacion & SCADA',
          },
        ],
        tasks: feed.tasks,
        nonWorkingDays: [],
      },
    })

    await wrapper.find('[data-testid="week-task"]').trigger('click')

    expect(wrapper.emitted('open-task')[0]).toEqual([1])
  })

  it('el detalle del dia emite el id de la tarea pulsada', async () => {
    const wrapper = mount(DayDetail, {
      props: {
        date: '2026-11-02',
        people: [
          {
            id: 2,
            name: 'Ana',
            department_id: 1,
            department_name: 'Automatizacion & SCADA',
          },
        ],
        tasks: feed.tasks,
        nonWorkingDays: [],
      },
    })

    await wrapper.find('[data-testid="day-task"]').trigger('click')

    expect(wrapper.emitted('open-task')[0]).toEqual([1])
  })
})

describe('WeekLanes', () => {
  /** Los siete dias de la semana del 2 al 8 de noviembre de 2026. */
  const dias = [
    { date: '2026-11-02', day: 2, weekday: 0, weekend: false },
    { date: '2026-11-03', day: 3, weekday: 1, weekend: false },
    { date: '2026-11-04', day: 4, weekday: 2, weekend: false },
    { date: '2026-11-05', day: 5, weekday: 3, weekend: false },
    { date: '2026-11-06', day: 6, weekday: 4, weekend: false },
    { date: '2026-11-07', day: 7, weekday: 5, weekend: true },
    { date: '2026-11-08', day: 8, weekday: 6, weekend: true },
  ]

  const personas = [
    { id: 2, name: 'Ana', department_id: 1, department_name: 'Automatizacion & SCADA' },
    { id: 3, name: 'Beto', department_id: 1, department_name: 'Automatizacion & SCADA' },
  ]

  function tarea(id, title, start, end, assignedTo) {
    return {
      id,
      title,
      start,
      end,
      project_id: 1,
      project_name: 'Linea Pasteurizadora SIVE',
      project_color: '#1f6feb',
      assigned_to: assignedTo,
      assigned_name: assignedTo === null ? null : 'Ana',
      status: 'in_progress',
    }
  }

  it('cada persona tiene su fila aunque no tenga tareas', () => {
    const wrapper = mount(WeekLanes, {
      props: { days: dias, people: personas, tasks: [], nonWorkingDays: [] },
    })

    expect(wrapper.findAll('[data-testid^="week-lane-name-"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="week-lane-name-3"]').text()).toContain('Beto')
    expect(wrapper.find('[data-testid="week-lane-row-3-0"] [data-testid="week-task"]').exists()).toBe(
      false,
    )
  })

  it('recorta la tarea que se sale de la semana', () => {
    const wrapper = mount(WeekLanes, {
      props: {
        days: dias,
        people: personas,
        tasks: [tarea(1, 'Tarea larga', '2026-10-28', '2026-11-08', 2)],
        nonWorkingDays: [],
      },
    })

    // Entra el lunes y sale el viernes: las cinco columnas laborables.
    const barra = wrapper.find('[data-testid="week-task"]')
    expect(barra.attributes('data-inicio')).toBe('0')
    expect(barra.attributes('data-columnas')).toBe('5')
  })

  it('el fin de semana no lleva barras', () => {
    const soloFinDeSemana = mount(WeekLanes, {
      props: {
        days: dias,
        people: personas,
        tasks: [tarea(1, 'Solo el fin de semana', '2026-11-07', '2026-11-08', 2)],
        nonWorkingDays: [],
      },
    })
    expect(soloFinDeSemana.findAll('[data-testid="week-task"]')).toHaveLength(0)

    // Una que empieza en domingo entra el lunes y sale el viernes.
    const desdeDomingo = mount(WeekLanes, {
      props: {
        days: dias,
        people: personas,
        tasks: [tarea(2, 'Desde el domingo', '2026-11-01', '2026-11-06', 2)],
        nonWorkingDays: [],
      },
    })
    const barra = desdeDomingo.find('[data-testid="week-task"]')
    expect(barra.attributes('data-inicio')).toBe('0')
    expect(barra.attributes('data-columnas')).toBe('5')
  })

  it('apila en carriles distintos las tareas que se pisan', () => {
    const wrapper = mount(WeekLanes, {
      props: {
        days: dias,
        people: personas,
        tasks: [
          tarea(1, 'Primera', '2026-11-02', '2026-11-04', 2),
          tarea(2, 'Segunda', '2026-11-03', '2026-11-05', 2),
        ],
        nonWorkingDays: [],
      },
    })

    const barras = wrapper.findAll('[data-testid="week-task"]')
    expect(barras).toHaveLength(2)
    // Las dos se pisan el martes y el miercoles: van en carriles distintos.
    expect(barras[0].attributes('data-lane')).toBe('0')
    expect(barras[0].attributes('data-inicio')).toBe('0')
    expect(barras[0].attributes('data-columnas')).toBe('3')
    expect(barras[1].attributes('data-lane')).toBe('1')
    expect(barras[1].attributes('data-inicio')).toBe('1')
    expect(barras[1].attributes('data-columnas')).toBe('3')
    // Y cada una en su fila.
    expect(wrapper.findAll('[data-testid="week-lane-row-2-0"] [data-testid="week-task"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="week-lane-row-2-1"] [data-testid="week-task"]')).toHaveLength(1)
  })

  it('no apila las tareas que no se pisan', () => {
    const wrapper = mount(WeekLanes, {
      props: {
        days: dias,
        people: personas,
        tasks: [
          tarea(1, 'Primera', '2026-11-02', '2026-11-03', 2),
          tarea(2, 'Segunda', '2026-11-04', '2026-11-05', 2),
        ],
        nonWorkingDays: [],
      },
    })

    const barras = wrapper.findAll('[data-testid="week-task"]')
    expect(barras).toHaveLength(2)
    expect(barras[0].attributes('data-lane')).toBe('0')
    expect(barras[1].attributes('data-lane')).toBe('0')
  })

  it('la fila de sin asignar solo sale si hay tareas sin persona', () => {
    const vacio = mount(WeekLanes, {
      props: { days: dias, people: personas, tasks: [], nonWorkingDays: [] },
    })
    expect(vacio.find('[data-testid="week-lane-unassigned-name"]').exists()).toBe(false)

    const conSueltas = mount(WeekLanes, {
      props: {
        days: dias,
        people: personas,
        tasks: [tarea(9, 'Sin persona', '2026-11-02', '2026-11-03', null)],
        nonWorkingDays: [],
      },
    })
    expect(conSueltas.find('[data-testid="week-lane-unassigned-name"]').exists()).toBe(true)
    expect(conSueltas.find('[data-testid="week-lane-unassigned-name"]').text()).toBe('Sin asignar')
    expect(conSueltas.findAll('[data-testid="week-task"]')).toHaveLength(1)
  })

  it('la barra lleva el nombre del proyecto y el color que le toca', () => {
    const wrapper = mount(WeekLanes, {
      props: {
        days: dias,
        people: personas,
        tasks: [tarea(1, 'Programacion', '2026-11-02', '2026-11-06', 2)],
        nonWorkingDays: [],
      },
    })

    const barra = wrapper.find('[data-testid="week-task"]')
    expect(barra.text()).toContain('Programacion')
    expect(barra.text()).toContain('Linea Pasteurizadora SIVE')
    esperaColor(barra, '#1f6feb')
  })

  it('marca los dias no laborables de la semana', () => {
    const wrapper = mount(WeekLanes, {
      props: {
        days: dias,
        people: personas,
        tasks: [],
        nonWorkingDays: [
          {
            id: 1,
            date: '2026-11-03',
            name: 'Fiesta local',
            scope: 'department',
            department_id: 1,
            department_name: 'Automatizacion & SCADA',
          },
        ],
      },
    })

    const marcados = wrapper.findAll('[data-testid="week-lane-holiday"]')
    expect(marcados).toHaveLength(1)
    expect(marcados[0].text()).toBe('Fiesta local')
  })

  it('avisa del dia que se pulsa en la cabecera', async () => {
    const wrapper = mount(WeekLanes, {
      props: { days: dias, people: personas, tasks: [], nonWorkingDays: [] },
    })

    await wrapper.find('[data-testid="week-day-2026-11-04"]').trigger('click')

    expect(wrapper.emitted('open-day')[0]).toEqual(['2026-11-04'])
  })
})
