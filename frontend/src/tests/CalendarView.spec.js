import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import DayDetail from '../components/DayDetail.vue'
import ModalDialog from '../components/ModalDialog.vue'
import TaskDetailDialog from '../components/TaskDetailDialog.vue'
import TaskForm from '../components/TaskForm.vue'
import CalendarGrid from '../components/calendar/CalendarGrid.vue'
import CalendarWeek from '../components/calendar/CalendarWeek.vue'
import PageHeader from '../components/common/PageHeader.vue'
import CalendarView from '../views/CalendarView.vue'
import { useToastStore } from '../stores/toast'
import { buildWeekLayout } from '../utils/calendarLayout'
import { weekDays } from '../utils/weeks'

const feed = {
  tasks: [
    {
      id: 1,
      name: 'Programacion SCADA · Ana',
      title: 'Programacion SCADA',
      start: '2026-11-02',
      end: '2026-11-06',
      progress: 50,
      estimated_hours: '8.00',
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
      estimated_hours: '4.50',
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
 *
 * Se monta pegado al `document.body`: la soltura del arrastre resuelve el dia
 * destino contra la tabla en pantalla con `document.querySelector`, y eso solo
 * ve lo que esta montado en el documento. Se desmonta la instancia anterior
 * para que siempre haya una sola tabla en el documento.
 */
let vistaMontada = null

async function mountView(query = {}) {
  if (vistaMontada) {
    vistaMontada.unmount()
    vistaMontada = null
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/calendar', name: 'calendar', component: { template: '<div />' } }],
  })
  await router.push({ path: '/calendar', query })
  await router.isReady()

  const pinia = createPinia()
  setActivePinia(pinia)
  const raiz = document.createElement('div')
  document.body.appendChild(raiz)
  const wrapper = mount(CalendarView, {
    global: { plugins: [pinia, router] },
    attachTo: raiz,
  })
  vistaMontada = wrapper
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
    expect(sabado.classes()).toContain('cp-trama-fin-semana')
    const domingo = wrapper.find('[data-testid="week-lane-head-2026-11-08"]')
    expect(domingo.exists()).toBe(true)
    expect(domingo.classes()).toContain('cp-trama-fin-semana')

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

  it('el texto de la barra se pinta con el color que llega a 4.5:1 sobre el fondo', async () => {
    const { wrapper } = await mountView()

    const semanas = wrapper.findAll('[data-testid="week-lanes"]')
    // Ambos fondos de la prueba son oscuros: el texto se queda blanco.
    expect(semanas[1].find('[data-testid="week-task"]').attributes('style')).toContain(
      'color: rgb(255, 255, 255)',
    )
    expect(semanas[2].find('[data-testid="week-task"]').attributes('style')).toContain(
      'color: rgb(255, 255, 255)',
    )
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

  it('la celda de cada dia lleva nombre, numero y eventos en tres filas', async () => {
    const { wrapper } = await mountView()

    // El lunes 2 es festivo global: nombre, numero y la fila de eventos, en orden.
    const lunes = wrapper.find('[data-testid="week-lane-head-2026-11-02"]')
    const hijos = lunes.element.children
    expect(hijos).toHaveLength(3)
    expect(hijos[0].tagName).toBe('SPAN')
    expect(hijos[0].textContent?.trim()).toBe('Lun')
    expect(hijos[1].tagName).toBe('BUTTON')
    expect(hijos[1].textContent?.trim()).toBe('2')
    // El festivo no va pegado al numero: esta en la tercera fila.
    expect(hijos[1].textContent).not.toContain('Puente')
    expect(hijos[2].tagName).toBe('SPAN')
    const festivo = hijos[2].querySelector('[data-testid="week-lane-holiday"]')
    expect(festivo?.textContent?.trim()).toBe('Puente')

    // Hoy (viernes 6): la pilora "Hoy" tambien esta en la tercera fila.
    const hoy = wrapper.find('[data-testid="week-lane-head-2026-11-06"]')
    const pilora = hoy.element.children[2].querySelector('[data-testid="week-lane-today"]')
    expect(pilora?.textContent?.trim()).toBe('Hoy')
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

  it('avisa en singular de una tarea sin fechas', async () => {
    const { wrapper } = await mountView()
    await settle()

    expect(wrapper.text()).toContain('1 tarea sin fechas no aparece en el calendario.')
  })

  it('avisa en plural cuando hay varias tareas sin fechas', async () => {
    setupFetch({ payload: { ...feed, undated_task_ids: [7, 8] } })
    const { wrapper } = await mountView()
    await settle()

    expect(wrapper.text()).toContain('2 tareas sin fechas no aparecen en el calendario.')
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

  it('el mes se desplaza a la primera semana con trabajo, no a la del mes', async () => {
    const { wrapper } = await mountView()

    const contenedor = wrapper.find('[data-testid="calendar-month-scroll"]')
    expect(contenedor.exists()).toBe(true)
    const cuerpos = contenedor.element.querySelectorAll('tbody')
    expect(cuerpos).toHaveLength(6)

    // jsdom no hace layout: se mide cada semana como la mediria el navegador
    // y se vuelve a pedir el desplazamiento con un paso de mes.
    cuerpos.forEach((cuerpo, indice) => {
      Object.defineProperty(cuerpo, 'offsetTop', { value: (indice + 1) * 200, configurable: true })
    })
    await wrapper.find('[data-testid="calendar-next"]').trigger('click')
    await wrapper.find('[data-testid="calendar-prev"]').trigger('click')
    await settle()

    // La primera semana del mes (30-31 oct) no tiene tareas: el desplazamiento
    // cae en la primera con trabajo, la del lunes 2, el segundo tbody.
    expect(contenedor.element.scrollTop).toBe(400)
  })

  it('el mes sin ninguna tarea con trabajo se queda arriba', async () => {
    setupFetch({ payload: { ...feed, tasks: [] } })
    const { wrapper } = await mountView()

    const contenedor = wrapper.find('[data-testid="calendar-month-scroll"]')
    const cuerpos = contenedor.element.querySelectorAll('tbody')
    cuerpos.forEach((cuerpo, indice) => {
      Object.defineProperty(cuerpo, 'offsetTop', { value: (indice + 1) * 200, configurable: true })
    })
    await wrapper.find('[data-testid="calendar-next"]').trigger('click')
    await wrapper.find('[data-testid="calendar-prev"]').trigger('click')
    await settle()

    expect(contenedor.element.scrollTop).toBe(0)
  })

  it('las barras no usan la paleta por persona', async () => {
    const { wrapper } = await mountView()

    // El color es el del proyecto. La paleta por persona es del Gantt.
    const barras = wrapper.findAll('[data-testid="week-task"]')
    expect(barras.length).toBeGreaterThan(0)
    for (const barra of barras) {
      expect(barra.classes().some((clase) => clase.startsWith('persona-'))).toBe(false)
      expect(barra.classes()).not.toContain('bg-primario-medio')
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
      'cp-trama-fin-semana',
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

describe('CalendarView: semana sin tareas', () => {
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

  /** Pasa a la vista semanal y navega hasta la semana pedida. */
  async function aSemana({ wrapper, delta }) {
    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    for (let i = 0; i < Math.abs(delta); i += 1) {
      await wrapper.find(delta > 0 ? '[data-testid="calendar-next"]' : '[data-testid="calendar-prev"]')
        .trigger('click')
      await flushPromises()
    }
  }

  it('una semana sin tareas avisa y ofrece saltar a la que tiene trabajo', async () => {
    const { wrapper } = await mountView()

    // W45 (semana en curso) tiene tarea; W47 no.
    await aSemana({ wrapper, delta: 2 })

    const aviso = wrapper.find('[data-testid="calendar-week-empty"]')
    expect(aviso.exists()).toBe(true)
    expect(aviso.text()).toContain('No hay tareas en esta semana')

    // La semana con trabajo mas cercana es la siguiente (W46), no la anterior.
    await wrapper.find('[data-testid="calendar-goto-busy-week"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="calendar-week"]').text()).toContain('2026-W46')
    expect(wrapper.find('[data-testid="calendar-week-empty"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(1)
  })

  it('sin semanas por delante salta a la anterior', async () => {
    const { wrapper } = await mountView()

    // W44: la unica semana con trabajo esta atras (W45).
    await aSemana({ wrapper, delta: -1 })

    const aviso = wrapper.find('[data-testid="calendar-week-empty"]')
    expect(aviso.exists()).toBe(true)
    expect(wrapper.find('[data-testid="calendar-goto-busy-week"]').exists()).toBe(true)

    await wrapper.find('[data-testid="calendar-goto-busy-week"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="calendar-week"]').text()).toContain('2026-W45')
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(1)
  })

  it('una semana con tareas no muestra el aviso', async () => {
    const { wrapper } = await mountView()

    await aSemana({ wrapper, delta: 0 })

    expect(wrapper.find('[data-testid="calendar-week-empty"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="calendar-goto-busy-week"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="week-task"]')).toHaveLength(1)
  })

  it('sin ninguna semana con trabajo no hay boton de salto', async () => {
    setupFetch({ payload: { ...feed, tasks: [] } })
    const { wrapper } = await mountView()

    await aSemana({ wrapper, delta: 1 })

    const aviso = wrapper.find('[data-testid="calendar-week-empty"]')
    expect(aviso.exists()).toBe(true)
    expect(aviso.text()).toContain('No hay tareas en esta semana')
    expect(wrapper.find('[data-testid="calendar-goto-busy-week"]').exists()).toBe(false)
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

describe('CalendarView: vista y fecha en la URL', () => {
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

  it('cambiar a la vista semanal escribe view y el lunes si no es la semana en curso', async () => {
    const { wrapper, router } = await mountView()

    // La semana en curso: la vista se escribe y el dia, no.
    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.view).toBe('week')
    expect(router.currentRoute.value.query.day).toBeUndefined()

    // La semana siguiente no es la en curso: su lunes va en la URL.
    await wrapper.find('[data-testid="calendar-next"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.view).toBe('week')
    expect(router.currentRoute.value.query.day).toBe('2026-11-09')
  })

  it('cambiar a la vista de dia escribe view y el dia si no es hoy', async () => {
    const { wrapper, router } = await mountView()

    // El dia de hoy: la vista se escribe y el dia, no.
    await wrapper.find('[data-testid="calendar-view-day"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.view).toBe('day')
    expect(router.currentRoute.value.query.day).toBeUndefined()

    // El lunes 9 no es hoy: su fecha va en la URL.
    await wrapper.find('[data-testid="calendar-next"]').trigger('click')
    await wrapper.find('[data-testid="calendar-next"]').trigger('click')
    await wrapper.find('[data-testid="calendar-next"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.view).toBe('day')
    expect(router.currentRoute.value.query.day).toBe('2026-11-09')
  })

  it('una URL con view=week y su dia abre la semana de ese lunes', async () => {
    const { wrapper } = await mountView({ view: 'week', day: '2026-12-07' })
    await settle()

    // El lunes 7 de diciembre abre la semana ISO 50. La rejilla no se pinta:
    // la semana no tiene tareas y sale el aviso de semana vacia.
    expect(wrapper.find('[data-testid="calendar-week"]').text()).toContain('2026-W50')
    expect(wrapper.find('[data-testid="week-grid"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="calendar-week-empty"]').exists()).toBe(true)
  })

  it('una URL con view=week y un dia cualquiera abre la semana que lo contiene', async () => {
    const { wrapper } = await mountView({ view: 'week', day: '2026-12-01' })
    await settle()

    // El miercoles 1 de diciembre cae en la semana que empieza el lunes 30.
    expect(wrapper.find('[data-testid="calendar-week"]').text()).toContain('2026-W49')
    expect(wrapper.find('[data-testid="calendar-week-empty"]').exists()).toBe(true)
  })

  it('una URL con view=week en la semana de los datos abre la rejilla de esa semana', async () => {
    const { wrapper } = await mountView({ view: 'week', day: '2026-11-04' })
    await settle()

    expect(wrapper.find('[data-testid="week-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="calendar-week"]').text()).toContain('2026-W45')
    expect(wrapper.find('[data-testid="week-lane-head-2026-11-02"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="week-task"]').exists()).toBe(true)
  })

  it('una URL con view=day y su dia abre el detalle de ese dia', async () => {
    const { wrapper } = await mountView({ view: 'day', day: '2026-12-01' })
    await settle()

    expect(wrapper.find('[data-testid="day-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="calendar-day"]').text()).toBe(
      'Martes 1 de diciembre de 2026',
    )
  })

  it('una URL con view=month y su mes abre la rejilla de ese mes', async () => {
    const { wrapper } = await mountView({ view: 'month', month: '2026-12' })
    await settle()

    expect(wrapper.find('[data-testid="calendar-month-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="calendar-month"]').text()).toBe('Diciembre 2026')
  })

  it('un mes en la URL sin view no cambia la vista mensual', async () => {
    const { wrapper } = await mountView({ month: '2026-12' })
    await settle()

    expect(wrapper.find('[data-testid="calendar-month-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="calendar-month"]').text()).toBe('Diciembre 2026')
  })

  it('los filtros de proyecto y departamento se conservan al cambiar de vista', async () => {
    const { wrapper, router } = await mountView({ project: '2', department: '1' })

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    await wrapper.find('[data-testid="calendar-view-day"]').trigger('click')
    await flushPromises()

    const query = router.currentRoute.value.query
    expect(query.view).toBe('day')
    expect(query.project).toBe('2')
    expect(query.department).toBe('1')
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

    const panel = wrapper.findComponent(TaskDetailDialog)
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

    expect(wrapper.findComponent(TaskDetailDialog).props('canEdit')).toBe(true)
  })

  it('una tarea de un proyecto que no se puede editar se abre en solo lectura', async () => {
    setupFetch({ ambito: { ...AMBITO, editable_project_ids: [2] } })
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
      .trigger('click')

    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(true)
    expect(wrapper.findComponent(TaskDetailDialog).props('canEdit')).toBe(false)
  })

  it('sin ambito la tarea se abre igual, pero en solo lectura', async () => {
    setupFetch()
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
      .trigger('click')

    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(true)
    expect(wrapper.findComponent(TaskDetailDialog).props('canEdit')).toBe(false)
  })

  it('al guardar en el panel el calendario se recarga', async () => {
    const calls = setupFetch({ ambito: AMBITO })
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
      .trigger('click')
    const antes = calls.filter((call) => call.url.includes('/gantt')).length

    wrapper.findComponent(TaskDetailDialog).vm.$emit('saved')
    await settle()

    expect(calls.filter((call) => call.url.includes('/gantt')).length).toBe(antes + 1)
    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(true)
  })

  it('al borrar en el panel el calendario se recarga y el panel se cierra', async () => {
    const calls = setupFetch({ ambito: AMBITO })
    const { wrapper } = await mountView()

    await wrapper
      .find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
      .trigger('click')
    const antes = calls.filter((call) => call.url.includes('/gantt')).length

    wrapper.findComponent(TaskDetailDialog).vm.$emit('deleted')
    await settle()

    expect(calls.filter((call) => call.url.includes('/gantt')).length).toBe(antes + 1)
    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(false)
  })

  it('la tarea de la vista semanal tambien abre su detalle', async () => {
    setupFetch({ ambito: AMBITO })
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    await wrapper.find('[data-testid="week-task"]').trigger('click')

    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(true)
    expect(wrapper.findComponent(TaskDetailDialog).props('taskId')).toBe(1)
  })

  it('la tarea de la vista de dia tambien abre su detalle', async () => {
    setupFetch({ ambito: AMBITO })
    const { wrapper } = await mountView()

    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')
    await wrapper.find('[data-testid="day-task"]').trigger('click')

    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(true)
    expect(wrapper.findComponent(TaskDetailDialog).props('taskId')).toBe(2)
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

  it('los filtros ofrecen los departamentos y proyectos visibles', async () => {
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

    await mountView({ department: '1', project: '2' })

    const url = ultimaUrlGantt(calls)
    expect(url).toContain('department_id=1')
    expect(url).toContain('project_id=2')
  })

  it('un assigned_to en la URL no se manda al backend', async () => {
    const calls = setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })

    await mountView({ assigned_to: '2' })

    const url = ultimaUrlGantt(calls)
    expect(url).not.toContain('assigned_to')
  })

  it('elegir un proyecto lo escribe en la URL sin salir de la vista global', async () => {
    setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })
    const { wrapper, router } = await mountView()

    await wrapper.find('[data-testid="filter-project"]').setValue('2')
    await settle()

    // El proyecto es un filtro: la ruta sigue siendo la global, no la del
    // espacio del proyecto.
    expect(router.currentRoute.value.path).toBe('/calendar')
    expect(router.currentRoute.value.query.project).toBe('2')
  })

  it('no hay filtro de persona: la visibilidad se maneja desde su panel', async () => {
    setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })
    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="filter-person"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="toggle-visibility"]').exists()).toBe(true)
  })

  it('los filtros usan el formato cuadrado de las demas vistas', async () => {
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
    ]

    for (const filtro of filtros) {
      const select = wrapper.find(`[data-testid="${filtro.testid}"]`)
      expect(select.exists()).toBe(true)
      expect([...select.classes()]).toEqual([
        'min-h-10',
        'cursor-pointer',
        'appearance-none',
        'rounded-control',
        'border',
        'border-borde-fuerte',
        'bg-tarjeta-suave',
        'py-1.5',
        'pl-3',
        'pr-8',
        'text-cp-sm',
        'font-medium',
        'text-texto',
        'transition-colors',
        'hover:border-foco',
        'hover:bg-tarjeta',
        'focus-visible:outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-foco',
      ])

      const label = select.element.closest('label')
      expect(label).not.toBeNull()
      expect([...label.classList]).toEqual(['inline-flex', 'flex-col', 'gap-1'])

      const span = label.querySelector('span')
      expect([...span.classList]).toEqual(['text-cp-xs', 'font-medium', 'text-texto-suave'])
      expect(span.textContent).toBe(filtro.etiqueta)
    }

    // Los filtros viven en el slot de filtros de la cabecera, con su hueco.
    const contenedor = wrapper.find('[data-testid="filter-department"]').element.closest('label')
      .parentElement
    expect([...contenedor.classList]).toContain('gap-2')
  })

  it('los filtros ya no se muestran como pastilla', async () => {
    setupFetch({
      ambito: AMBITO,
      directorio: DIRECTORIO,
      proyectos: PROYECTOS,
      departamentos: DEPARTAMENTOS,
    })
    const { wrapper } = await mountView()

    for (const testid of ['filter-department', 'filter-project']) {
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

describe('CalendarGrid y DayDetail', () => {
  it('la rejilla semanal emite el id de la tarea pulsada', async () => {
    const wrapper = mount(CalendarGrid, {
      props: {
        weeks: [weekDays('2026-W45')],
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

describe('CalendarWeek', () => {
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

  /**
   * Monta la semana con su rejilla repartida por `buildWeekLayout`, como la
   * pinta `CalendarGrid`: el componente solo recibe la semana y las filas.
   */
  function monta({ dias: diasDeLaSemana, people = personas, tasks = [], ...resto } = {}) {
    const { filas } = buildWeekLayout({ days: diasDeLaSemana ?? dias, people, tasks })
    return mount(CalendarWeek, {
      props: { days: diasDeLaSemana ?? dias, filas, ...resto },
    })
  }

  it('cada persona tiene su fila aunque no tenga tareas', () => {
    const wrapper = monta({})

    expect(wrapper.findAll('[data-testid^="week-lane-name-"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="week-lane-name-3"]').text()).toContain('Beto')
    expect(wrapper.find('[data-testid="week-lane-row-3-0"] [data-testid="week-task"]').exists()).toBe(
      false,
    )
  })

  it('recorta la tarea que se sale de la semana', () => {
    const wrapper = monta({
      tasks: [tarea(1, 'Tarea larga', '2026-10-28', '2026-11-08', 2)],
    })

    // Entra el lunes y sale el viernes: las cinco columnas laborables.
    const barra = wrapper.find('[data-testid="week-task"]')
    expect(barra.attributes('data-inicio')).toBe('0')
    expect(barra.attributes('data-columnas')).toBe('5')
  })

  it('el fin de semana no lleva barras', () => {
    const soloFinDeSemana = monta({
      tasks: [tarea(1, 'Solo el fin de semana', '2026-11-07', '2026-11-08', 2)],
    })
    expect(soloFinDeSemana.findAll('[data-testid="week-task"]')).toHaveLength(0)

    // Una que empieza en domingo entra el lunes y sale el viernes.
    const desdeDomingo = monta({
      tasks: [tarea(2, 'Desde el domingo', '2026-11-01', '2026-11-06', 2)],
    })
    const barra = desdeDomingo.find('[data-testid="week-task"]')
    expect(barra.attributes('data-inicio')).toBe('0')
    expect(barra.attributes('data-columnas')).toBe('5')
  })

  it('apila en carriles distintos las tareas que se pisan', () => {
    const wrapper = monta({
      tasks: [
        tarea(1, 'Primera', '2026-11-02', '2026-11-04', 2),
        tarea(2, 'Segunda', '2026-11-03', '2026-11-05', 2),
      ],
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
    const wrapper = monta({
      tasks: [
        tarea(1, 'Primera', '2026-11-02', '2026-11-03', 2),
        tarea(2, 'Segunda', '2026-11-04', '2026-11-05', 2),
      ],
    })

    const barras = wrapper.findAll('[data-testid="week-task"]')
    expect(barras).toHaveLength(2)
    expect(barras[0].attributes('data-lane')).toBe('0')
    expect(barras[1].attributes('data-lane')).toBe('0')
  })

  it('la fila de sin asignar solo sale si hay tareas sin persona', () => {
    const vacio = monta({})
    expect(vacio.find('[data-testid="week-lane-unassigned-name"]').exists()).toBe(false)

    const conSueltas = monta({
      tasks: [tarea(9, 'Sin persona', '2026-11-02', '2026-11-03', null)],
    })
    expect(conSueltas.find('[data-testid="week-lane-unassigned-name"]').exists()).toBe(true)
    expect(conSueltas.find('[data-testid="week-lane-unassigned-name"]').text()).toBe('Sin asignar')
    expect(conSueltas.findAll('[data-testid="week-task"]')).toHaveLength(1)
  })

  it('la barra lleva el nombre del proyecto y el color que le toca', () => {
    const wrapper = monta({
      tasks: [tarea(1, 'Programacion', '2026-11-02', '2026-11-06', 2)],
    })

    const barra = wrapper.find('[data-testid="week-task"]')
    expect(barra.text()).toContain('Programacion')
    expect(barra.text()).toContain('Linea Pasteurizadora SIVE')
    esperaColor(barra, '#1f6feb')
  })

  it('la barra de un proyecto provisional va de contorno, sin relleno', () => {
    const wrapper = monta({
      tasks: [
        tarea(1, 'Firme', '2026-11-02', '2026-11-04', 2),
        {
          ...tarea(2, 'Provisional', '2026-11-02', '2026-11-04', 2),
          project_id: 2,
          project_name: 'Proyecto en estudio',
          is_provisional: true,
        },
      ],
    })

    const [firme, provisional] = wrapper.findAll('[data-testid="week-task"]')
    expect(firme.classes()).toContain('text-sobre-primario')
    esperaColor(firme, '#1f6feb')
    // Sin relleno, con el contorno punteado y la nota en el aviso.
    expect(provisional.classes().join(' ')).toContain('border-dashed')
    expect(provisional.attributes('style')).toContain('background-color: transparent')
    expect(provisional.attributes('title')).toContain('(provisional)')
  })

  it('marca los dias no laborables de la semana', () => {
    const wrapper = monta({
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
    })

    const marcados = wrapper.findAll('[data-testid="week-lane-holiday"]')
    expect(marcados).toHaveLength(1)
    expect(marcados[0].text()).toBe('Fiesta local')
  })

  it('avisa del dia que se pulsa en la cabecera', async () => {
    const wrapper = monta({})

    await wrapper.find('[data-testid="week-day-2026-11-04"]').trigger('click')

    expect(wrapper.emitted('open-day')[0]).toEqual(['2026-11-04'])
  })

  it('la barra de un proyecto editable emite drag-start con la tarea y la zona', async () => {
    const wrapper = monta({
      tasks: [tarea(1, 'Programacion', '2026-11-02', '2026-11-06', 2)],
      editableProjectIds: [1],
      semanaIndice: 3,
    })

    await wrapper.find('[data-testid="week-task"]').trigger('mousedown', {
      button: 0,
      clientX: 0,
      clientY: 0,
    })

    expect(wrapper.emitted('drag-start')).toBeDefined()
    const payload = wrapper.emitted('drag-start')[0][0]
    expect(payload.tarea.id).toBe(1)
    // El cuerpo de la barra emite su zona y los dias de la semana: el
    // composable mapea columna a fecha al redimensionar.
    expect(payload.zona).toBe('body')
    expect(payload.dias).toHaveLength(7)
    // La semana de la rejilla va en el <tbody>, no en el evento.
    expect(wrapper.find('tbody').attributes('data-semana')).toBe('3')
  })

  it('la barra de un proyecto que no se puede editar no emite drag-start', async () => {
    const wrapper = monta({
      tasks: [tarea(1, 'Programacion', '2026-11-02', '2026-11-06', 2)],
      editableProjectIds: [2],
    })

    await wrapper.find('[data-testid="week-task"]').trigger('mousedown', {
      button: 0,
      clientX: 0,
      clientY: 0,
    })

    expect(wrapper.emitted('drag-start')).toBeUndefined()
  })

  it('la barra editable muestra sus asas solo si el extremo real cae en la semana', () => {
    const dentro = monta({
      tasks: [tarea(1, 'Programacion', '2026-11-02', '2026-11-06', 2)],
      editableProjectIds: [1],
    })
    expect(dentro.find('[data-testid="calendar-handle-start"]').exists()).toBe(true)
    expect(dentro.find('[data-testid="calendar-handle-end"]').exists()).toBe(true)

    // Empieza antes de la semana: sin asa de inicio; acaba despues: sin asa
    // de fin.
    const recortada = monta({
      tasks: [tarea(1, 'Tarea larga', '2026-10-26', '2026-11-09', 2)],
      editableProjectIds: [1],
    })
    expect(recortada.find('[data-testid="calendar-handle-start"]').exists()).toBe(false)
    expect(recortada.find('[data-testid="calendar-handle-end"]').exists()).toBe(false)

    // Sin permiso de escritura no hay asas, ni siquiera con el extremo visible.
    const soloLectura = monta({
      tasks: [tarea(1, 'Programacion', '2026-11-02', '2026-11-06', 2)],
      editableProjectIds: [2],
    })
    expect(soloLectura.find('[data-testid="calendar-handle-start"]').exists()).toBe(false)
    expect(soloLectura.find('[data-testid="calendar-handle-end"]').exists()).toBe(false)
  })

  it('las asas emiten drag-start con su zona y no propagan al cuerpo', async () => {
    const wrapper = monta({
      tasks: [tarea(1, 'Programacion', '2026-11-02', '2026-11-06', 2)],
      editableProjectIds: [1],
    })

    await wrapper.find('[data-testid="calendar-handle-start"]').trigger('mousedown', {
      button: 0,
      clientX: 0,
      clientY: 0,
    })
    expect(wrapper.emitted('drag-start')).toHaveLength(1)
    expect(wrapper.emitted('drag-start')[0][0].zona).toBe('start')

    await wrapper.find('[data-testid="calendar-handle-end"]').trigger('mousedown', {
      button: 0,
      clientX: 0,
      clientY: 0,
    })
    expect(wrapper.emitted('drag-start')).toHaveLength(2)
    expect(wrapper.emitted('drag-start')[1][0].zona).toBe('end')
  })

  it('las celdas del cuerpo llevan el primer dia que cubren en data-day', () => {
    const wrapper = monta({
      tasks: [tarea(1, 'Programacion', '2026-11-02', '2026-11-06', 2)],
      editableProjectIds: [1],
    })

    const cuerpo = wrapper.findAll('[data-testid="week-lanes"] td[data-day]')
    expect(cuerpo.length).toBeGreaterThan(0)
    // La barra del lunes al viernes cubre los dias 2 a 6 en la primera celda.
    const celdas = cuerpo
      .map((celda) => celda.attributes('data-day'))
      .filter(Boolean)
    expect(celdas).toContain('2026-11-02')
    expect(celdas).toContain('2026-11-07')
  })

  it('la banda de destino sombrea solo la fila de la persona y los dias del rango', () => {
    const wrapper = monta({
      tasks: [
        tarea(1, 'Programacion', '2026-11-02', '2026-11-06', 2),
        tarea(9, 'Sin persona', '2026-11-03', '2026-11-03', null),
      ],
      destino: {
        taskId: 1,
        start: '2026-11-04',
        end: '2026-11-10',
        fecha: '2026-11-04',
        personaId: 2,
      },
    })

    // La fila de Ana sombrea la celda de la barra, que cubre dias del rango
    // nuevo (del miercoles 4 al lunes 10: el 4 y el 5 caen aqui). El resto de
    // la fila, el fin de semana y las cabeceras no.
    const celdasAna = wrapper.findAll('[data-testid="week-lane-row-2-0"] td[data-day]')
    expect(
      celdasAna.filter((celda) => celda.classes().includes('bg-aviso-fondo/60')),
    ).toHaveLength(1)
    expect(
      celdasAna
        .filter((celda) => celda.classes().includes('bg-aviso-fondo/60'))[0]
        .classes()
        .includes('cp-trama-fin-semana'),
    ).toBe(false)
    // El fin de semana no se sombrea: la banda no toca el fondo de fin de semana.
    celdasAna
      .filter((celda) => celda.classes().includes('cp-trama-fin-semana'))
      .forEach((celda) => expect(celda.classes()).not.toContain('bg-aviso-fondo/60'))

    // La fila de Beto (sin tareas) y la de sin asignar no se somborean.
    expect(
      wrapper.findAll('[data-testid="week-lane-row-3-0"] td').filter((celda) =>
        celda.classes().includes('bg-aviso-fondo/60'),
      ),
    ).toHaveLength(0)
    expect(
      wrapper
        .findAll('[data-testid="week-lane-row-sin-asignar-0"] td')
        .filter((celda) => celda.classes().includes('bg-aviso-fondo/60')),
    ).toHaveLength(0)
  })

  it('la cabecera sombrea los dias del rango y la barra arrastrada se atenua', () => {
    const wrapper = monta({
      tasks: [tarea(1, 'Programacion', '2026-11-02', '2026-11-06', 2)],
      destino: {
        taskId: 1,
        start: '2026-11-04',
        end: '2026-11-10',
        fecha: '2026-11-04',
        personaId: 2,
      },
    })

    // El rango nuevo es del 4 al 10: en la cabecera se sombrea lo que cae en
    // la semana; el fin de semana sigue con su fondo, sin banda encima.
    expect(
      wrapper.find('[data-testid="week-lane-head-2026-11-03"]').classes().includes(
        'bg-aviso-fondo/60',
      ),
    ).toBe(false)
    for (const fecha of ['2026-11-04', '2026-11-05', '2026-11-06']) {
      expect(
        wrapper
          .find(`[data-testid="week-lane-head-${fecha}"]`)
          .classes()
          .includes('bg-aviso-fondo/60'),
      ).toBe(true)
    }
    for (const fecha of ['2026-11-07', '2026-11-08']) {
      const cabecera = wrapper.find(`[data-testid="week-lane-head-${fecha}"]`)
      expect(cabecera.classes()).toContain('cp-trama-fin-semana')
      expect(cabecera.classes()).not.toContain('bg-aviso-fondo/60')
    }
    // La barra arrastrada se atenua y deja de capturar el puntero.
    const barra = wrapper.find('[data-testid="week-task"]')
    expect(barra.classes()).toContain('opacity-60')
    expect(barra.classes()).toContain('pointer-events-none')
  })
})

describe('DayDetail: edicion inline y alta del dia', () => {
  const personas = [
    { id: 2, name: 'Ana', department_id: 1, department_name: 'Automatizacion & SCADA' },
  ]
  const miembros = [
    { user_id: 2, name: 'Ana', role_name: 'Tecnico' },
    { user_id: 3, name: 'Beto', role_name: 'Tecnico' },
  ]
  const tareaDia = {
    id: 1,
    title: 'Programacion SCADA',
    start: '2026-11-02',
    end: '2026-11-06',
    project_id: 1,
    project_name: 'Linea Pasteurizadora SIVE',
    project_color: '#1f6feb',
    assigned_to: 2,
    assigned_name: 'Ana',
    status: 'in_progress',
    estimated_hours: 8,
  }

  function mountDetalle(props = {}) {
    return mount(DayDetail, {
      props: {
        date: '2026-11-02',
        people: personas,
        tasks: [tareaDia],
        nonWorkingDays: [],
        canEdit: false,
        members: miembros,
        ...props,
      },
    })
  }

  it('sin permiso de escritura no hay controles ni alta, solo lectura', () => {
    const wrapper = mountDetalle()

    expect(wrapper.find('[data-testid="day-task-hours"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="day-task-person-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="day-task-status-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="day-new-task"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="day-readonly-note"]').exists()).toBe(true)
  })

  it('con permiso la tarea se edita en su sitio y se puede crear en el dia', () => {
    const wrapper = mountDetalle({ canEdit: true })

    expect(wrapper.find('[data-testid="day-task-hours"]').text()).toBe('8 h')
    expect(wrapper.find('[data-testid="day-task-person-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="day-task-status-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="day-new-task"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="day-readonly-note"]').exists()).toBe(false)
  })

  it('doble clic en las horas lo edita in situ e Intro lo guarda con un cambio parcial', async () => {
    const wrapper = mountDetalle({ canEdit: true })

    await wrapper.find('[data-testid="day-task-hours"]').trigger('dblclick')
    await flushPromises()

    const input = wrapper.find('[data-testid="day-task-hours-input"]')
    expect(input.exists()).toBe(true)
    await input.setValue('12.50')
    await input.trigger('keyup', { key: 'Enter' })
    await flushPromises()

    expect(wrapper.emitted('cambiar')[0]).toEqual([
      { tarea: tareaDia, cambios: { estimated_hours: '12.50' } },
    ])
    expect(wrapper.find('[data-testid="day-task-hours-input"]').exists()).toBe(false)
  })

  it('Escape en la edicion de horas no guarda nada', async () => {
    const wrapper = mountDetalle({ canEdit: true })

    await wrapper.find('[data-testid="day-task-hours"]').trigger('dblclick')
    await flushPromises()

    const input = wrapper.find('[data-testid="day-task-hours-input"]')
    await input.setValue('99')
    await input.trigger('keyup', { key: 'Escape' })
    await flushPromises()

    expect(wrapper.emitted('cambiar')).toBeUndefined()
    expect(wrapper.find('[data-testid="day-task-hours"]').text()).toBe('8 h')
  })

  it('cambiar el responsable emite el cambio con el miembro elegido', async () => {
    const wrapper = mountDetalle({ canEdit: true })

    await wrapper.find('[data-testid="day-task-person-1"]').setValue('3')

    expect(wrapper.emitted('cambiar')[0]).toEqual([
      { tarea: tareaDia, cambios: { assigned_to: 3 } },
    ])
  })

  it('desasignar manda un null explicito', async () => {
    const wrapper = mountDetalle({ canEdit: true, tasks: [{ ...tareaDia, assigned_to: null }] })

    await wrapper.find('[data-testid="day-task-person-1"]').setValue('')

    expect(wrapper.emitted('cambiar')[0]).toEqual([
      { tarea: { ...tareaDia, assigned_to: null }, cambios: { assigned_to: null } },
    ])
  })

  it('cambiar el estado emite el cambio', async () => {
    const wrapper = mountDetalle({ canEdit: true })

    await wrapper.find('[data-testid="day-task-status-1"]').setValue('done')

    expect(wrapper.emitted('cambiar')[0]).toEqual([
      { tarea: tareaDia, cambios: { status: 'done' } },
    ])
  })

  it('el clic que termina una edicion inline no abre el detalle', async () => {
    const wrapper = mountDetalle({ canEdit: true })

    await wrapper.find('[data-testid="day-task-hours"]').trigger('dblclick')
    await flushPromises()
    const input = wrapper.find('[data-testid="day-task-hours-input"]')
    await input.setValue('9')
    await input.trigger('blur')
    await flushPromises()

    expect(wrapper.emitted('open-task')).toBeUndefined()
  })

  it('un clic en el cuerpo de la tarea abre su detalle', async () => {
    const wrapper = mountDetalle({ canEdit: true })

    await wrapper.find('[data-testid="day-task"]').trigger('click')

    expect(wrapper.emitted('open-task')[0]).toEqual([1])
  })

  it('el boton de alta del dia emite la fecha del dia', async () => {
    const wrapper = mountDetalle({ canEdit: true, date: '2026-11-09' })

    await wrapper.find('[data-testid="day-new-task"]').trigger('click')

    expect(wrapper.emitted('crear')[0]).toEqual(['2026-11-09'])
  })
})

describe('CalendarView: arrastrar a otro dia, crear y editar', () => {
  const MIEMBROS = [
    { user_id: 2, name: 'Ana', role_name: 'Tecnico' },
    { user_id: 3, name: 'Beto', role_name: 'Tecnico' },
  ]

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 10, 6))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Captura metodo y cuerpo de cada peticion, con el resto de endpoints fijos. */
  function setupFetchEdicion({
    payload = feed,
    ambito = AMBITO,
    miembros = [],
    falloGuardado = false,
  } = {}) {
    const calls = []
    global.fetch = vi.fn(async (url, options = {}) => {
      calls.push({ url, method: options.method ?? 'GET', body: options.body ?? null })
      if (url.endsWith('/auth/login')) {
        return jsonResponse({
          access_token: 'tok',
          token_type: 'bearer',
          user: { id: 9, name: 'Admin' },
        })
      }
      if (url.includes('/gantt')) return jsonResponse(payload)
      if (url.endsWith('/non-working-days')) return jsonResponse(diasNoLaborables)
      if (url.endsWith('/api/me')) return jsonResponse(ambito)
      if (url.endsWith('/api/people')) return jsonResponse(DIRECTORIO)
      if (url.endsWith('/api/projects')) return jsonResponse(PROYECTOS)
      if (url.endsWith('/api/departments')) return jsonResponse(DEPARTAMENTOS)
      if (url.includes('/activity')) return jsonResponse({ items: [] })
      if (/\/tasks\/\d+\/comments$/.test(url)) return jsonResponse([])
      if (/\/tasks\/\d+\/checklist$/.test(url)) return jsonResponse([])
      if (/\/tasks\/\d+$/.test(url)) {
        // El PATCH de fechas cae como un 500 real cuando la prueba lo pide.
        if (options.method === 'PATCH' && falloGuardado) {
          return jsonResponse({ detail: 'Sin conexion con el servidor' }, false, 500)
        }
        return jsonResponse(DETALLE_TAREA)
      }
      if (/\/projects\/\d+\/members$/.test(url)) return jsonResponse(miembros)
      if (/\/projects\/\d+\/tasks$/.test(url)) return jsonResponse({ id: 10, project_id: 1 })
      return jsonResponse({ detail: 'no encontrado' }, false, 404)
    })
    return calls
  }

  /**
   * Coloca la tabla del mes y sus semanas en un sitio fijo.
   *
   * Cada semana es un <tbody> apilado verticalmente de 100 px de alto, de
   * modo que la semana destino se resuelve por la altura del puntero.
   */
  function stubTabla(wrapper) {
    const tabla = wrapper.find('[data-testid="calendar-month-table"]').element
    tabla.getBoundingClientRect = () => ({ left: 0, right: 700, top: 0, bottom: 1000 })
    tabla.querySelector('th').getBoundingClientRect = () => ({ left: 0, right: 100 })
    tabla.querySelectorAll('tbody').forEach((tbody, indice) => {
      const top = 100 * indice
      tbody.getBoundingClientRect = () => ({ left: 0, right: 700, top, bottom: top + 100 })
    })
  }

  /** Coloca la tabla de la vista semanal en un sitio fijo: una sola semana. */
  function stubSemana(wrapper) {
    const tabla = wrapper.find('[data-testid="week-grid"] table').element
    tabla.getBoundingClientRect = () => ({ left: 0, right: 700, top: 0, bottom: 1000 })
    tabla.querySelector('th').getBoundingClientRect = () => ({ left: 0, right: 100 })
    const tbody = tabla.querySelector('tbody')
    tbody.getBoundingClientRect = () => ({ left: 0, right: 700, top: 0, bottom: 1000 })
  }

  /** Arrastra la barra primera vez que se agarra y suelta en el punto dado. */
  async function arrastrarBarra(wrapper, soltarX, soltarY) {
    const barra = wrapper.find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
    await barra.trigger('mousedown', { button: 0, clientX: 10, clientY: 10 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: soltarX, clientY: soltarY }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: soltarX, clientY: soltarY }))
    await settle()
  }

  it('arrastrar la barra a otro dia la mueve conservando su duracion en dias laborables', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    // La barra va del lunes 2 al viernes 6 (5 dias laborables), en la segunda
    // semana del mes (y 150). El martes 3 es la columna 1 de esa semana:
    // cinco dias laborables desde el 3 caen al lunes 9 y la duracion se
    // conserva, aunque el fin de semana se salte.
    await arrastrarBarra(wrapper, 100 + 1 * 85.5 + 40, 150)

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(patch.url).toBe('/api/tasks/1')
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-03',
      end_date: '2026-11-09',
    })
    // El exito del guardado confirma con un toast flotante, como el Gantt.
    expect(useToastStore().items.map((item) => item.message)).toContain(
      'Fechas actualizadas: del 2026-11-03 al 2026-11-09.',
    )
  })

  it('una tarea de lunes a viernes movida al jueves acaba el miercoles de la semana siguiente', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    // La barra va del lunes 2 al viernes 6 (5 dias laborables). Suelta sobre
    // el jueves 5 (columna 3, y 150): el fin de semana no come la duracion,
    // asi que los cinco dias laborables caen del jueves 5 al miercoles 11.
    await arrastrarBarra(wrapper, 100 + 3 * 85.5 + 40, 150)

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(patch.url).toBe('/api/tasks/1')
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-05',
      end_date: '2026-11-11',
    })
  })

  it('el toast de fechas del arrastre lleva la clave calendario-fechas', async () => {
    setupFetchEdicion()
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    await arrastrarBarra(wrapper, 100 + 1 * 85.5 + 40, 150)

    const items = useToastStore().items
    expect(items).toHaveLength(1)
    expect(items[0].key).toBe('calendario-fechas')
    expect(items[0].variant).toBe('success')
  })

  it('un fallo del guardado no confirma con toast: solo el aviso en linea', async () => {
    setupFetchEdicion({ falloGuardado: true })
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    await arrastrarBarra(wrapper, 100 + 1 * 85.5 + 40, 150)

    expect(useToastStore().items).toHaveLength(0)
    expect(wrapper.find('[data-testid="calendar-warning"]').text()).toContain(
      'No se ha podido mover la tarea',
    )
  })

  it('arrastrar a otro dia de la misma semana de la vista mensual cae en esa semana', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    // La segunda barra es de la semana del 9 al 15 (y 250): el jueves 12 es
    // la columna 3. Dos dias laborables desde el jueves 12 caen al 12 - 13.
    const barra = wrapper
      .findAll('[data-testid="calendar-month-table"] [data-testid="week-task"]')[1]
    await barra.trigger('mousedown', { button: 0, clientX: 10, clientY: 10 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 + 3 * 85.5 + 40, clientY: 250 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 100 + 3 * 85.5 + 40, clientY: 250 }))
    await settle()

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-12',
      end_date: '2026-11-13',
    })
  })

  it('arrastrar la barra de una semana a otra del mes la mueve a la semana destino', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    // La barra va del lunes 2 al viernes 6 (semana del 2 al 8). Se suelta en
    // la tercera semana del mes (la del 16 al 22, y 350) en el mismo dia de
    // la semana: cinco dias laborables desde el lunes 16 caen al viernes 20 y
    // la duracion se conserva.
    await arrastrarBarra(wrapper, 100 + 0 * 85.5 + 40, 350)

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(patch.url).toBe('/api/tasks/1')
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-16',
      end_date: '2026-11-20',
    })
  })

  it('sin permiso de escritura en el proyecto de la barra no hay arrastre', async () => {
    const calls = setupFetchEdicion({ ambito: { ...AMBITO, editable_project_ids: [2] } })
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    await arrastrarBarra(wrapper, 100 + 2 * 85.5 + 40, 150)

    expect(calls.find((call) => call.method === 'PATCH')).toBeUndefined()
  })

  it('el clic que sigue a un arrastre no abre el detalle de la tarea', async () => {
    setupFetchEdicion()
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    await arrastrarBarra(wrapper, 100 + 2 * 85.5 + 40, 150)
    // El navegador dispara el click sobre la barra tras el arrastre: ese click
    // no debe abrir el detalle.
    await wrapper
      .find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
      .trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(false)
  })

  it('el arrastre se puede anular con Escape y no guarda nada', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    const barra = wrapper.find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
    await barra.trigger('mousedown', { button: 0, clientX: 10, clientY: 10 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 150 }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 200, clientY: 150 }))
    await settle()

    expect(calls.find((call) => call.method === 'PATCH')).toBeUndefined()
    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(false)
  })

  /** Agarra el asa del extremo dado y suelta en el punto dado. */
  async function redimensionar(wrapper, asa, soltarX, soltarY) {
    const handle = wrapper.find(
      `[data-testid="calendar-month-table"] [data-testid="${asa}"]`,
    )
    await handle.trigger('mousedown', { button: 0, clientX: 10, clientY: 10 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: soltarX, clientY: soltarY }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: soltarX, clientY: soltarY }))
    await settle()
  }

  it('redimensionar el inicio de la barra mueve solo el inicio con un PATCH', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    // La barra va del lunes 2 al viernes 6. El asa de inicio suelta en la
    // columna 2 (miercoles 4): el inicio cae al 4 y el fin se queda en el 6.
    await redimensionar(wrapper, 'calendar-handle-start', 100 + 2 * 85.5 + 40, 150)

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(patch.url).toBe('/api/tasks/1')
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-04',
      end_date: '2026-11-06',
    })
  })

  it('redimensionar el fin de la barra mueve solo el fin con un PATCH', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    // La barra va del lunes 2 al viernes 6. El asa de fin suelta en la
    // columna 3 (jueves 5): el fin cae al 5 y el inicio se queda en el 2.
    await redimensionar(wrapper, 'calendar-handle-end', 100 + 3 * 85.5 + 40, 150)

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(patch.url).toBe('/api/tasks/1')
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-02',
      end_date: '2026-11-05',
    })
  })

  it('soltar el cuerpo sobre un dia de fin de semana cae en el dia laborable', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    // La barra va del lunes 2 al viernes 6 (5 dias laborables). Suelta sobre
    // el sabado 7 (columna 5): el dia laborable es el viernes 6 y los cinco
    // dias laborables desde el 6 caen al jueves 12.
    await arrastrarBarra(wrapper, 100 + 5 * 85.5 + 40, 150)

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-06',
      end_date: '2026-11-12',
    })
  })

  it('soltar fuera de la rejilla no guarda nada', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView()
    stubTabla(wrapper)

    const barra = wrapper.find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
    await barra.trigger('mousedown', { button: 0, clientX: 10, clientY: 10 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 150 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 1200, clientY: 150 }))
    await settle()

    expect(calls.find((call) => call.method === 'PATCH')).toBeUndefined()
    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(false)
  })

  it('la vista semanal tambien arrastra la barra a otro dia', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView()
    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    await flushPromises()
    stubSemana(wrapper)

    // La barra va del lunes 2 al viernes 6 (5 dias laborables). El martes 3
    // es la columna 1: cinco dias laborables desde el 3 caen al lunes 9.
    const barra = wrapper.find('[data-testid="week-task"]')
    await barra.trigger('mousedown', { button: 0, clientX: 10, clientY: 10 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 + 1 * 85.5 + 40, clientY: 500 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 100 + 1 * 85.5 + 40, clientY: 500 }))
    await settle()

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-03',
      end_date: '2026-11-09',
    })
  })

  it('mientras dura el arrastre: banda en la fila de la persona, barra atenuada, fantasma de pilora y sin globo', async () => {
    setupFetchEdicion()
    const { wrapper } = await mountView()
    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    await flushPromises()
    stubSemana(wrapper)

    // La barra va del lunes 2 al viernes 6 (5 dias laborables). Suelta sobre
    // el miercoles 4 (columna 2): los cinco dias laborables caen del 4 al
    // lunes 10, de modo que la banda nueva es del 4 al 10.
    const barra = wrapper.find('[data-testid="week-task"]')
    await barra.trigger('mousedown', { button: 0, clientX: 10, clientY: 10 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 + 2 * 85.5 + 40, clientY: 500 }))
    await flushPromises()

    // La banda sombrea la celda de la barra (cubre dias del 4 al 10) en la
    // fila de la persona (Ana, assigned_to 2) y los dias del rango en la
    // cabecera.
    const celdasAna = wrapper.findAll('[data-testid="week-lane-row-2-0"] td[data-day]')
    expect(
      celdasAna.filter((celda) => celda.classes().includes('bg-aviso-fondo/60')),
    ).toHaveLength(1)
    expect(
      wrapper.find('[data-testid="week-lane-head-2026-11-04"]').classes().join(' '),
    ).toContain('bg-aviso-fondo/60')
    expect(
      wrapper.find('[data-testid="week-lane-head-2026-11-03"]').classes().join(' '),
    ).not.toContain('bg-aviso-fondo/60')

    // La barra que se esta arrastrando se atenua y deja de capturar el puntero.
    expect(barra.classes()).toContain('opacity-60')
    expect(barra.classes()).toContain('pointer-events-none')

    // El fantasma es la pilora del Gantt: etiqueta de la tarea, rango nuevo y
    // tira de color del proyecto.
    const fantasma = wrapper.find('[data-testid="calendar-drag-ghost"]')
    expect(fantasma.exists()).toBe(true)
    expect(fantasma.text()).toContain('Programacion SCADA')
    expect(fantasma.text()).toContain('2026-11-04 → 2026-11-10')
    expect(fantasma.html()).toContain('border-borde')
    expect(fantasma.html()).toContain('bg-tarjeta')
    const tira = fantasma.find('span[style*="background-color"]')
    expect(tira.exists()).toBe(true)
    esperaColor(tira, '#1f6feb')

    // El globo no se pinta mientras dura el arrastre.
    expect(wrapper.find('[data-testid="calendar-tooltip"]').exists()).toBe(false)

    // Al soltar, todo se limpia: banda, atenuacion, fantasma.
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 100 + 2 * 85.5 + 40, clientY: 500 }))
    await settle()
    expect(
      wrapper.findAll('[data-testid="week-lane-row-2-0"] td').filter((celda) =>
        celda.classes().includes('bg-aviso-fondo/60'),
      ),
    ).toHaveLength(0)
    expect(
      wrapper.find('[data-testid="week-lane-head-2026-11-04"]').classes().join(' '),
    ).not.toContain('bg-aviso-fondo/60')
    expect(wrapper.find('[data-testid="calendar-drag-ghost"]').exists()).toBe(false)
  })

  it('el alta del dia abre el formulario con las fechas del dia y lo POSTea al proyecto del filtro', async () => {
    const calls = setupFetchEdicion({ miembros: MIEMBROS })
    const { wrapper } = await mountView({ project: '1' })
    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="day-new-task"]').trigger('click')
    await settle()

    // Dos dialogos en el arbol: el del detalle de tarea (cerrado) y el del
    // alta. El que importa es el abierto.
    const modal = wrapper.findAllComponents(ModalDialog).find((m) => m.props('open'))
    expect(modal).toBeDefined()
    expect(modal.props('open')).toBe(true)
    const formulario = wrapper.findComponent(TaskForm)
    expect(formulario.props('task')).toEqual({
      start_date: '2026-11-09',
      end_date: '2026-11-09',
    })

    await formulario.vm.$emit('save', {
      title: 'Nueva tarea del dia',
      assigned_to: null,
      start_date: '2026-11-09',
      end_date: '2026-11-09',
      estimated_hours: '8.00',
    })
    await settle()

    const post = calls.find(
      (call) => call.method === 'POST' && call.url.endsWith('/tasks'),
    )
    expect(post).toBeDefined()
    expect(post.url).toBe('/api/projects/1/tasks')
    expect(JSON.parse(post.body)).toEqual({
      title: 'Nueva tarea del dia',
      assigned_to: null,
      start_date: '2026-11-09',
      end_date: '2026-11-09',
      estimated_hours: '8.00',
    })
    expect(modal.props('open')).toBe(false)
  })

  it('sin proyecto en contexto no hay alta del dia y el subtitulo lo explica', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView()
    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="day-new-task"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="day-readonly-note"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="modal-footer"]').exists()).toBe(false)
    expect(wrapper.findComponent(PageHeader).props().subtitle).toContain(
      'no se pueden crear tareas',
    )
    expect(
      calls.find((call) => call.method === 'POST' && call.url.endsWith('/tasks')),
    ).toBeUndefined()
  })

  it('sin permiso de escritura en el proyecto no hay alta del dia', async () => {
    setupFetchEdicion({ ambito: { ...AMBITO, editable_project_ids: [2] } })
    const { wrapper } = await mountView({ project: '1' })
    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="day-new-task"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="day-readonly-note"]').exists()).toBe(true)
  })

  it('el dia muestra las horas del feed de la tarea, no cero', async () => {
    setupFetchEdicion()
    const { wrapper } = await mountView({ project: '2' })
    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')
    await flushPromises()

    // La tarea 2 va del 9 al 10 de noviembre y trae 4.50 h del feed: la
    // insignia pinta las horas reales de la tarea.
    expect(wrapper.find('[data-testid="day-task-hours"]').text()).toBe('4.50 h')
  })

  it('editar las horas del dia manda un PATCH parcial de estimated_hours', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView({ project: '2' })
    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="day-task-hours"]').trigger('dblclick')
    await flushPromises()
    const input = wrapper.find('[data-testid="day-task-hours-input"]')
    await input.setValue('12.5')
    await input.trigger('keyup', { key: 'Enter' })
    await settle()

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(patch.url).toBe('/api/tasks/2')
    expect(JSON.parse(patch.body)).toEqual({ estimated_hours: '12.50' })
  })

  it('cambiar el responsable del dia manda un PATCH parcial de assigned_to', async () => {
    const calls = setupFetchEdicion({ miembros: MIEMBROS })
    const { wrapper } = await mountView({ project: '2' })
    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="day-task-person-2"]').setValue('2')
    await settle()

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body)).toEqual({ assigned_to: 2 })
  })

  it('cambiar el estado del dia manda un PATCH parcial de status', async () => {
    const calls = setupFetchEdicion()
    const { wrapper } = await mountView({ project: '2' })
    await wrapper.find('[data-testid="week-day-2026-11-09"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="day-task-status-2"]').setValue('done')
    await settle()

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body)).toEqual({ status: 'done' })
  })

  describe('teclado en la barra', () => {
    /** Enfoca la barra por su id: el foco es lo que la barra emite. */
    async function enfocar(wrapper, taskId) {
      const barra = wrapper
        .findAll('[data-testid="week-task"]')
        .find((b) => b.attributes('data-task-id') === String(taskId))
      await barra.trigger('focus')
      await flushPromises()
      return barra
    }

    it('la barra enfocada es la unica con tabindex 0 y el resto con -1', async () => {
      setupFetchEdicion()
      const { wrapper } = await mountView()
      const barras = wrapper.findAll('[data-testid="week-task"]')
      expect(barras.length).toBeGreaterThan(1)
      // Al montar, la primera barra visible lleva el tabindex 0.
      expect(barras[0].attributes('tabindex')).toBe('0')
      barras.slice(1).forEach((barra) => expect(barra.attributes('tabindex')).toBe('-1'))

      await enfocar(wrapper, 2)
      expect(wrapper.find('[data-task-id="1"]').attributes('tabindex')).toBe('-1')
      expect(wrapper.find('[data-task-id="2"]').attributes('tabindex')).toBe('0')
    })

    it('el aria-label describe la tarea y anade Solo lectura. sin permiso', async () => {
      setupFetchEdicion()
      const { wrapper } = await mountView()
      expect(wrapper.find('[data-task-id="1"]').attributes('aria-label')).toBe(
        'Programacion SCADA Ana Del 2 de nov al 6 de nov de 2026. 50 % de avance.',
      )

      await mountView()
      setupFetchEdicion({ ambito: { ...AMBITO, editable_project_ids: [2] } })
      const { wrapper: soloLectura } = await mountView()
      expect(
        soloLectura.find('[data-task-id="1"]').attributes('aria-label'),
      ).toBe(
        'Programacion SCADA Ana Del 2 de nov al 6 de nov de 2026. 50 % de avance. Solo lectura.',
      )
      expect(soloLectura.find('[data-task-id="1"]').attributes('aria-disabled')).toBe('true')
    })

    it('ArrowRight mueve la tarea un dia laborable con un PATCH conservando la duracion', async () => {
      const calls = setupFetchEdicion()
      const { wrapper } = await mountView()
      const barra = await enfocar(wrapper, 1)
      await barra.trigger('keydown', { key: 'ArrowRight' })
      await settle()

      // La tarea va del lunes 2 al viernes 6 (5 dias laborables); un dia
      // laborable adelante, con destino martes 3, cae al lunes 9.
      const patch = calls.find((call) => call.method === 'PATCH')
      expect(patch).toBeDefined()
      expect(patch.url).toBe('/api/tasks/1')
      expect(JSON.parse(patch.body)).toEqual({
        start_date: '2026-11-03',
        end_date: '2026-11-09',
      })
    })

    it('Mayus+ArrowRight alarga el fin un dia laborable y el inicio se queda', async () => {
      const calls = setupFetchEdicion()
      const { wrapper } = await mountView()
      const barra = await enfocar(wrapper, 1)
      await barra.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
      await settle()

      // El fin va del viernes 6 un dia laborable adelante: lunes 9, saltando
      // el fin de semana.
      const patch = calls.find((call) => call.method === 'PATCH')
      expect(patch).toBeDefined()
      expect(JSON.parse(patch.body)).toEqual({
        start_date: '2026-11-02',
        end_date: '2026-11-09',
      })
    })

    it('Mayus+ArrowLeft acorta el fin un dia laborable y no cruza el inicio', async () => {
      const calls = setupFetchEdicion()
      const { wrapper } = await mountView()
      const barra = await enfocar(wrapper, 2)
      await barra.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
      await settle()

      // La tarea 2 va del lunes 9 al martes 10: un dia laborable atras el fin
      // cae en el lunes 9, que es el propio inicio: la tarea queda de un dia.
      const patch = calls.find((call) => call.method === 'PATCH')
      expect(patch).toBeDefined()
      expect(patch.url).toBe('/api/tasks/2')
      expect(JSON.parse(patch.body)).toEqual({
        start_date: '2026-11-09',
        end_date: '2026-11-09',
      })
    })

    it('Enter abre el detalle de la tarea enfocada', async () => {
      setupFetchEdicion()
      const { wrapper } = await mountView()
      const barra = await enfocar(wrapper, 2)
      await barra.trigger('keydown', { key: 'Enter' })
      await flushPromises()

      expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(true)
    })

    it('sin permiso de escritura las flechas no hacen PATCH', async () => {
      const calls = setupFetchEdicion({ ambito: { ...AMBITO, editable_project_ids: [2] } })
      const { wrapper } = await mountView()
      const barra = await enfocar(wrapper, 1)
      await barra.trigger('keydown', { key: 'ArrowRight' })
      await barra.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
      await settle()

      expect(calls.find((call) => call.method === 'PATCH')).toBeUndefined()
    })

    it('ArrowDown mueve el foco a la siguiente barra visible', async () => {
      setupFetchEdicion()
      const { wrapper } = await mountView()
      const primera = await enfocar(wrapper, 1)
      // El foco real del DOM lo comprueba el tabindex: jsdom no aplica el
      // .focus() contra el selector del grid, pero el roving tabindex si.
      await primera.trigger('keydown', { key: 'ArrowDown' })
      await flushPromises()

      expect(wrapper.find('[data-task-id="1"]').attributes('tabindex')).toBe('-1')
      expect(wrapper.find('[data-task-id="2"]').attributes('tabindex')).toBe('0')
    })
  })

  describe('menu contextual, globo y alta en el hueco', () => {
    /** Items del menu contextual en texto, en orden. */
    function itemsDelMenu(wrapper) {
      return wrapper.findAll('[data-testid="context-menu-item"]').map((item) => item.text())
    }

    it('el clic derecho en la barra abre el menu de la tarea', async () => {
      setupFetchEdicion()
      const { wrapper } = await mountView()
      await wrapper.find('[data-task-id="1"]').trigger('contextmenu', { clientX: 70, clientY: 90 })
      await flushPromises()

      const menu = wrapper.find('[data-testid="context-menu"]')
      expect(menu.exists()).toBe(true)
      expect(menu.attributes('aria-label')).toBe('Menú de la tarea')
      expect(itemsDelMenu(wrapper)).toEqual([
        'Abrir detalle',
        'Mover un día antes',
        'Mover un día después',
        'Acortar un día',
        'Alargar un día',
      ])
    })

    it('Abrir detalle abre el dialogo de la tarea y el menu se cierra', async () => {
      setupFetchEdicion()
      const { wrapper } = await mountView()
      await wrapper.find('[data-task-id="1"]').trigger('contextmenu', { clientX: 70, clientY: 90 })
      await flushPromises()

      await wrapper
        .findAll('[data-testid="context-menu-item"]')
        .find((item) => item.text() === 'Abrir detalle')
        .trigger('click')
      await flushPromises()

      expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(true)
      expect(wrapper.find('[data-testid="context-menu"]').exists()).toBe(false)
    })

    it('Mover un día después mueve un dia laborable con un PATCH', async () => {
      const calls = setupFetchEdicion()
      const { wrapper } = await mountView()
      await wrapper.find('[data-task-id="1"]').trigger('contextmenu', { clientX: 70, clientY: 90 })
      await flushPromises()

      await wrapper
        .findAll('[data-testid="context-menu-item"]')
        .find((item) => item.text() === 'Mover un día después')
        .trigger('click')
      await settle()

      // Mismo calculo que ArrowRight: destino martes 3, cinco dias laborables
      // hasta el lunes 9.
      const patch = calls.find((call) => call.method === 'PATCH')
      expect(patch).toBeDefined()
      expect(patch.url).toBe('/api/tasks/1')
      expect(JSON.parse(patch.body)).toEqual({
        start_date: '2026-11-03',
        end_date: '2026-11-09',
      })
    })

    it('sin permiso de escritura el menu de la barra no da los items de mover', async () => {
      setupFetchEdicion({ ambito: { ...AMBITO, editable_project_ids: [2] } })
      const { wrapper } = await mountView()
      await wrapper.find('[data-task-id="1"]').trigger('contextmenu', { clientX: 70, clientY: 90 })
      await flushPromises()

      expect(itemsDelMenu(wrapper)).toEqual(['Abrir detalle'])
    })

    it('el clic derecho en un hueco abre el menu del dia', async () => {
      setupFetchEdicion()
      const { wrapper } = await mountView({ project: '1' })
      // El lunes de la segunda semana del mes no lleva tareas: hueco completo.
      const celda = wrapper.find('[data-testid="calendar-month-table"] td[data-day="2026-11-09"]')
      await celda.trigger('contextmenu', { clientX: 30, clientY: 40 })
      await flushPromises()

      const menu = wrapper.find('[data-testid="context-menu"]')
      expect(menu.exists()).toBe(true)
      expect(menu.attributes('aria-label')).toBe('Menú del día')
      expect(itemsDelMenu(wrapper)).toEqual(['Ver el día', 'Crear tarea en este día'])
    })

    it('sin permiso de escritura el menu del hueco no ofrece el alta', async () => {
      // El proyecto 1 no es editable para quien entra: el alta no se puede.
      setupFetchEdicion({ ambito: { ...AMBITO, editable_project_ids: [2] } })
      const { wrapper } = await mountView({ project: '1' })
      const celda = wrapper.find('[data-testid="calendar-month-table"] td[data-day="2026-11-09"]')
      await celda.trigger('contextmenu', { clientX: 30, clientY: 40 })
      await flushPromises()

      expect(itemsDelMenu(wrapper)).toEqual(['Ver el día'])
    })

    it('Ver el día abre la vista de dia de esa fecha', async () => {
      setupFetchEdicion()
      const { wrapper, router } = await mountView({ project: '1' })
      const celda = wrapper.find('[data-testid="calendar-month-table"] td[data-day="2026-11-09"]')
      await celda.trigger('contextmenu', { clientX: 30, clientY: 40 })
      await flushPromises()

      await wrapper
        .findAll('[data-testid="context-menu-item"]')
        .find((item) => item.text() === 'Ver el día')
        .trigger('click')
      await flushPromises()

      expect(router.currentRoute.value.query).toMatchObject({ view: 'day', day: '2026-11-09' })
    })

    it('doble clic en un hueco abre el modal de alta con la fecha del dia', async () => {
      setupFetchEdicion()
      const { wrapper } = await mountView({ project: '1' })
      const celda = wrapper.find('[data-testid="calendar-month-table"] td[data-day="2026-11-09"]')
      await celda.trigger('dblclick')
      await flushPromises()

      const formulario = wrapper.findComponent(TaskForm)
      expect(formulario.exists()).toBe(true)
      expect(formulario.props('task').start_date).toBe('2026-11-09')
      expect(formulario.props('task').end_date).toBe('2026-11-09')
    })

    it('pasar el puntero por la barra muestra el globo y al salir lo oculta', async () => {
      setupFetchEdicion()
      const { wrapper } = await mountView()
      const barra = wrapper.find('[data-task-id="1"]')
      await barra.trigger('mouseenter', { clientX: 70, clientY: 90 })
      await flushPromises()

      const globo = wrapper.find('[data-testid="calendar-tooltip"]')
      expect(globo.exists()).toBe(true)
      expect(globo.text()).toContain('Programacion SCADA')

      await barra.trigger('mouseleave')
      await flushPromises()
      expect(wrapper.find('[data-testid="calendar-tooltip"]').exists()).toBe(false)
    })
  })
})

describe('CalendarView: raíz y modo ampliado', () => {
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

  it('las vistas no pintan el detalle de dia debajo', async () => {
    const { wrapper } = await mountView()

    // Mes: la cadena de vistas se cierra en la rejilla del mes.
    expect(wrapper.find('[data-testid="calendar-month-view"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="day-view"]').exists()).toBe(false)

    await wrapper.find('[data-testid="calendar-view-week"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="week-grid"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="day-view"]').exists()).toBe(false)

    await wrapper.find('[data-testid="calendar-view-day"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="day-view"]').exists()).toBe(true)
  })

  it('la raíz ocupa el alto disponible y el mes se desplaza dentro de su marco', async () => {
    const { wrapper } = await mountView()

    const raiz = wrapper.element.firstElementChild
    expect(raiz.classList.contains('h-full')).toBe(true)
    expect(raiz.classList.contains('min-h-0')).toBe(true)

    // Sin el alto fijo de antes: el contenedor se queda con el espacio que
    // sobra del marco del mes y es el único que se desplaza.
    const contenedor = wrapper.find('[data-testid="calendar-month-scroll"]').element
    expect([...contenedor.classList]).not.toContain('max-h-[80vh]')
    expect([...contenedor.classList]).toContain('min-h-0')
    expect([...contenedor.classList]).toContain('flex-1')
    expect([...contenedor.classList]).toContain('overflow-auto')
  })

  it('el boton de modo ampliado ocupa la ventana entera y Escape lo salta', async () => {
    const { wrapper } = await mountView()

    const raiz = () => wrapper.element.firstElementChild
    const boton = () => wrapper.get('[data-testid="calendar-fullscreen"]')

    expect(raiz().classList.contains('fixed')).toBe(false)
    expect(boton().attributes('aria-label')).toBe('Ampliar a pantalla completa')
    expect(boton().attributes('aria-pressed')).toBe('false')

    await boton().trigger('click')
    await flushPromises()

    expect(raiz().classList.contains('fixed')).toBe(true)
    expect(raiz().classList.contains('inset-0')).toBe(true)
    expect(raiz().classList.contains('z-40')).toBe(true)
    expect(boton().attributes('aria-label')).toBe('Salir de la vista ampliada')
    expect(boton().attributes('aria-pressed')).toBe('true')

    // Escape sale del modo ampliado y el boton vuelve a ser de entrada.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(raiz().classList.contains('fixed')).toBe(false)
    expect(boton().attributes('aria-label')).toBe('Ampliar a pantalla completa')
    expect(boton().attributes('aria-pressed')).toBe('false')

    // El boton sigue haciendo de entrada y de salida con el mismo elemento.
    await boton().trigger('click')
    await flushPromises()
    expect(raiz().classList.contains('fixed')).toBe(true)
  })

  it('Escape no sale del modo ampliado con el detalle de tarea abierto', async () => {
    const { wrapper } = await mountView()

    const raiz = () => wrapper.element.firstElementChild
    await wrapper.get('[data-testid="calendar-fullscreen"]').trigger('click')
    await flushPromises()
    expect(raiz().classList.contains('fixed')).toBe(true)

    // Con el dialogo abierto el Escape es del dialogo, no de la vista.
    await wrapper
      .find('[data-testid="calendar-month-table"] [data-testid="week-task"]')
      .trigger('click')
    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(raiz().classList.contains('fixed')).toBe(true)

    // Con el dialogo cerrado, el Escape vuelve a salir del ampliado.
    wrapper.findComponent(TaskDetailDialog).vm.$emit('close')
    await flushPromises()
    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(false)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(raiz().classList.contains('fixed')).toBe(false)
  })
})
