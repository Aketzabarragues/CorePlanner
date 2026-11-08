import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import CapacityMatrix from '../components/CapacityMatrix.vue'
import { weeksBetween } from '../utils/weeks'

const members = [
  { user_id: 1, name: 'Ana', email: 'ana@example.com', role_id: 1, role_name: 'Project Manager', weekly_base_hours: 40 },
  { user_id: 2, name: 'Sebastian', email: 's@example.com', role_id: 2, role_name: 'Ingeniero', weekly_base_hours: 40 },
]

const capacityReport = {
  weeks: [
    { week: '2026-W45', holidays: [] },
    { week: '2026-W46', holidays: [] },
  ],
  rows: [
    {
      user_id: 1,
      name: 'Ana',
      weekly_base_hours: 40,
      department_id: 1,
      job_title: 'Project Manager',
      project_ids: [1],
      total_hours: 10,
      has_overload: false,
      cells: [
        { week: '2026-W45', hours: 10, capacity: 40, is_overloaded: false, projects: [{ project_id: 1, hours: 10 }] },
        { week: '2026-W46', hours: 0, capacity: 40, is_overloaded: false, projects: [] },
      ],
    },
    {
      user_id: 2,
      name: 'Sebastian',
      weekly_base_hours: 40,
      department_id: 1,
      job_title: 'Ingeniero',
      project_ids: [1],
      total_hours: 72,
      has_overload: true,
      cells: [
        { week: '2026-W45', hours: 24, capacity: 40, is_overloaded: false, projects: [{ project_id: 1, hours: 24 }] },
        { week: '2026-W46', hours: 48, capacity: 40, is_overloaded: true, projects: [{ project_id: 1, hours: 48 }] },
      ],
    },
  ],
  holiday_task_ids: [],
}

const projectTasks = [
  { id: 10, project_id: 1, assigned_to: 2, title: 'Puesta en marcha', status: 'todo', start_date: '2026-11-09', end_date: '2026-11-11', estimated_hours: 12 },
  { id: 11, project_id: 1, assigned_to: 1, title: 'Esquemas EPLAN', status: 'todo', start_date: '2026-11-02', end_date: '2026-11-04', estimated_hours: 10 },
]

/** Informe con una persona que no es miembro del proyecto de las tareas. */
const reportConAjeno = {
  ...capacityReport,
  rows: [
    ...capacityReport.rows,
    {
      user_id: 3,
      name: 'Jorge',
      weekly_base_hours: 40,
      department_id: 2,
      job_title: 'Ingeniero',
      project_ids: [2],
      total_hours: 0,
      has_overload: false,
      cells: [
        { week: '2026-W45', hours: 0, capacity: 40, is_overloaded: false, projects: [] },
        { week: '2026-W46', hours: 0, capacity: 40, is_overloaded: false, projects: [] },
      ],
    },
  ],
}

const departments = [
  { id: 1, name: 'Automatización & SCADA', manager_id: 1, manager_name: 'Ana' },
  { id: 2, name: 'Oficina Técnica / EPLAN', manager_id: 3, manager_name: 'Jorge' },
]

const skills = [
  { id: 1, name: 'PLC S7-1500' },
  { id: 2, name: 'HMI WinCC' },
]

/** Copia profunda: cada respuesta trae sus propios datos, como el servidor. */
function clone(value) {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => clone(payload) }
}

function setupFetch(overrides = {}) {
  const calls = []
  global.fetch = vi.fn(async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', body: options.body })
    // Las peticiones llevan el rango y los filtros en la query: el override
    // se busca por la ruta, sin ella.
    const ruta = url.split('?')[0]
    if (overrides[ruta]) return overrides[ruta](options)
    if (url.endsWith('/auth/login')) {
      return jsonResponse({ access_token: 'tok-demo', token_type: 'bearer', user: { id: 9, name: 'Admin' } })
    }
    if (url.includes('/capacity')) return jsonResponse(capacityReport)
    if (url.endsWith('/skills')) return jsonResponse(skills)
    if (url.includes('/members')) return jsonResponse(members)
    if (url.includes('/tasks')) return jsonResponse(projectTasks)
    if (url.endsWith('/departments')) return jsonResponse(departments)
    if (url.endsWith('/projects')) {
      return jsonResponse([
        { id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active', department_id: 1 },
        { id: 2, name: 'Ampliacion linea 2', status: 'active', department_id: 2 },
      ])
    }
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
  return calls
}

let router

async function mountMatrix(props = {}, query = {}) {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/capacity', component: { template: '<div />' } },
      { path: '/projects/:id/capacity', component: { template: '<div />' } },
    ],
  })
  await router.push({
    path: props.id === null ? '/capacity' : `/projects/${props.id}/capacity`,
    query,
  })
  await router.isReady()

  const wrapper = mount(CapacityMatrix, {
    props: { id: 1, ...props },
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

/** Peticiones que bajaron al informe de capacidad. */
function capacityCalls(calls) {
  return calls.filter((call) => call.url.includes('/capacity')).map((call) => call.url)
}

describe('CapacityMatrix', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('hace login automatico y guarda el token', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    expect(wrapper.text()).toContain('Sebastian')
    expect(localStorage.getItem('coreplanner_token')).toBe('tok-demo')
  })

  it('pinta la celda sobrecargada con su icono y su porcentaje', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    const celda = wrapper.get('[data-testid="cell-2-2026-W46"]')
    expect(celda.classes()).toContain('bg-red-200')
    expect(celda.classes()).toContain('text-red-900')
    // 48 h de 40 h: el 120 % y el triangulo que la marca sin depender del color.
    expect(celda.text()).toContain('48/40')
    expect(celda.text()).toContain('120 %')
    expect(celda.find('svg').exists()).toBe(true)
  })

  it('una celda sin horas muestra un punto y no una barra', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    const celda = wrapper.get('[data-testid="cell-1-2026-W46"]')
    expect(celda.text()).toContain('·')
    expect(celda.text()).not.toContain('%')
  })

  it('con capacidad desconocida la celda no se marca como libre', async () => {
    setupFetch({
      '/api/projects/1/capacity': () =>
        jsonResponse({
          ...capacityReport,
          rows: capacityReport.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({ ...cell, capacity: null })),
          })),
        }),
    })
    const wrapper = await mountMatrix()

    const celda = wrapper.get('[data-testid="cell-2-2026-W46"]')
    expect(celda.classes()).not.toContain('bg-blue-100')
    expect(celda.classes()).not.toContain('bg-red-200')
    expect(celda.text()).toContain('48')
    expect(celda.text()).toContain('sin capacidad')
  })

  it('la cabecera de semana dice el numero y el rango, y marca la de hoy', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    const cabeceras = wrapper.findAll('thead th')
    expect(cabeceras[1].text()).toContain('Sem 45')
    expect(cabeceras[1].text()).toContain('2 - 6 nov 2026')
    // La semana en curso lleva la insignia.
    const conHoy = cabeceras.filter((th) => th.text().includes('Hoy'))
    expect(conHoy.length).toBeLessThanOrEqual(1)
  })

  it('la cabecera marca los dias no laborables de la semana', async () => {
    setupFetch({
      '/api/projects/1/capacity': () =>
        jsonResponse({
          ...capacityReport,
          weeks: [
            { week: '2026-W45', holidays: [] },
            {
              week: '2026-W46',
              holidays: [
                { date: '2026-11-11', name: 'Fiesta local', scope: 'global', half_day: false },
              ],
            },
          ],
        }),
    })
    const wrapper = await mountMatrix()

    const insignia = wrapper.find('[data-testid="holiday-badge"]')
    expect(insignia.exists()).toBe(true)
    expect(insignia.text()).toContain('Fiesta local')
  })

  it('la fila de equipo enseña el uso agregado', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    const equipo = wrapper.findAll('tbody tr').at(-1)
    expect(equipo.text()).toContain('Equipo')
    // W45: 10 h + 24 h sobre 40 h + 40 h de capacidad.
    expect(equipo.text()).toContain('43 %')
    // W46: 0 h + 48 h sobre las mismas 80 h.
    expect(equipo.text()).toContain('60 %')
    expect(equipo.text()).toContain('82')
  })

  it('la leyenda explica la escala', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    const texto = wrapper.text()
    expect(texto).toContain('Libre (menos del 50 %)')
    expect(texto).toContain('Óptimo (85–100 %)')
    expect(texto).toContain('Sobrecarga alta ▲ (más del 110 %)')
  })

  it('avisa de las tareas que caen enteramente en dias no laborables', async () => {
    setupFetch({
      '/api/projects/1/capacity': () =>
        jsonResponse({ ...capacityReport, holiday_task_ids: [42] }),
    })
    const wrapper = await mountMatrix()

    const aviso = wrapper.find('[data-testid="capacity-holiday-warning"]')
    expect(aviso.exists()).toBe(true)
    expect(aviso.text()).toContain('1 tarea(s)')
    expect(aviso.text()).toContain('no se imputan')
  })

  it('sin tareas enteramente festivas no hay aviso', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    expect(wrapper.find('[data-testid="capacity-holiday-warning"]').exists()).toBe(false)
  })

  it('un error del servidor no cierra la sesion', async () => {
    setupFetch({
      '/api/projects/1/capacity': () => jsonResponse({ detail: 'Error interno' }, false, 500),
    })
    await mountMatrix()

    expect(localStorage.getItem('coreplanner_token')).toBe('tok-demo')
    expect(localStorage.getItem('coreplanner_signed_out')).toBeNull()
  })

  it('un 401 si cierra la sesion', async () => {
    setupFetch({
      '/api/projects/1/capacity': () => jsonResponse({ detail: 'Credenciales invalidas' }, false, 401),
    })
    await mountMatrix()

    expect(localStorage.getItem('coreplanner_token')).toBeNull()
  })

  it('el alta de tareas no se duplica en la matriz', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    // El alta vive en la cabecera del armazon, no dentro de la matriz.
    expect(wrapper.text()).not.toContain('Nueva Tarea')
    expect(wrapper.findAll('button').filter((b) => b.text().includes('Nueva'))).toHaveLength(0)
  })

  it('al pulsar una celda abre el desglose de tareas', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    const celda = wrapper.get('[data-testid="cell-2-2026-W46"]')
    await celda.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Sebastian en 2026-W46')
    expect(wrapper.text()).toContain('Puesta en marcha')
  })

  it('el desglose permite editar una tarea', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix()

    const celda = wrapper.get('[data-testid="cell-2-2026-W46"]')
    await celda.trigger('click')
    await flushPromises()

    const editar = wrapper.findAll('button').find((b) => b.text() === 'Editar')
    await editar.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Editar tarea')

    await wrapper.find('input[type="number"]').setValue('6')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body).estimated_hours).toBe('6.00')
  })

  it('el selector de reasignar solo aparece en una tarea', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    const celda = wrapper.get('[data-testid="cell-2-2026-W46"]')
    await celda.trigger('click')
    await flushPromises()

    const reasignar = wrapper.findAll('button').find((b) => b.text() === 'Reasignar')
    await reasignar.trigger('click')
    await flushPromises()

    // Un solo selector abierto, no uno por tarea. Los selectores de la
    // pantalla de filtros no cuentan: estos son los del panel de detalle.
    const selects = wrapper.findAll('[role="dialog"] select')
    expect(selects).toHaveLength(1)
    expect(wrapper.findAll('button').filter((b) => b.text() === 'Mover')).toHaveLength(1)
  })

  it('el desglose permite reasignar una tarea a otra persona', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix()

    const celda = wrapper.get('[data-testid="cell-2-2026-W46"]')
    await celda.trigger('click')
    await flushPromises()

    const reasignar = wrapper.findAll('button').find((b) => b.text() === 'Reasignar')
    await reasignar.trigger('click')
    await flushPromises()

    // Se abre un selector con el resto de miembros del proyecto.
    const select = wrapper.findAll('[role="dialog"] select').at(-1)
    expect(select.exists()).toBe(true)
    expect(select.findAll('option').map((o) => o.text())).toContain('Ana')

    const mover = wrapper.findAll('button').find((b) => b.text() === 'Mover')
    await mover.trigger('click')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body).assigned_to).toBe(1)
  })

  it('el desglose permite eliminar una tarea', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix()

    const celda = wrapper.get('[data-testid="cell-2-2026-W46"]')
    await celda.trigger('click')
    await flushPromises()

    const eliminar = wrapper.findAll('button').find((b) => b.text() === 'Eliminar')
    await eliminar.trigger('click')
    await flushPromises()

    const del = calls.find((c) => c.method === 'DELETE')
    expect(del).toBeDefined()
    expect(del.url).toContain('/tasks/10')
  })

  it('informa cuando no hay proyectos visibles', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ access_token: 'tok', user: { name: 'Admin' } })
      }
      return jsonResponse([])
    })

    const wrapper = await mountMatrix()
    expect(wrapper.text()).toContain('Todavía no hay proyectos visibles')
    expect(wrapper.text()).toContain('Configuración')
    // El mensaje de la semilla no se enseña al operario.
    expect(wrapper.text()).not.toContain('backend/seed.py')
  })

  it('al cambiar de proyecto vuelve a pedir la matriz de ese proyecto', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix({ id: 1 })

    await wrapper.setProps({ id: 2 })
    await flushPromises()
    await flushPromises()

    const urls = capacityCalls(calls)
    expect(urls.some((url) => url.includes('/projects/1/capacity'))).toBe(true)
    expect(urls.some((url) => url.includes('/projects/2/capacity'))).toBe(true)
  })

  it('sin identificador pide la capacidad global', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix({ id: null })

    const urls = capacityCalls(calls)
    expect(urls.some((url) => url.includes('/api/capacity?'))).toBe(true)
    expect(urls.some((url) => url.includes('/projects/'))).toBe(false)
    expect(wrapper.text()).toContain('Capacidad Global')
  })

  it('el filtro por departamento limita la capacidad global', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix({ id: null })

    const filtro = wrapper.find('[data-testid="filter-department"]')
    await filtro.setValue('2')
    await flushPromises()

    const urls = capacityCalls(calls)
    expect(urls.some((url) => url.includes('department_id=2'))).toBe(true)
  })

  it('el filtro por proyecto limita la capacidad global', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix({ id: null })

    const filtro = wrapper.find('[data-testid="filter-project"]')
    await filtro.setValue('2')
    await flushPromises()

    const urls = capacityCalls(calls)
    expect(urls.some((url) => url.includes('project_id=2'))).toBe(true)
  })

  it('el filtro por competencia va con su nivel minimo', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix({ id: null })

    const filtro = wrapper.find('[data-testid="filter-skill"]')
    await filtro.setValue('1')
    await flushPromises()

    const nivel = wrapper.find('[data-testid="filter-level"]')
    await nivel.setValue('2')
    await flushPromises()

    const urls = capacityCalls(calls)
    expect(urls.some((url) => url.includes('skill_id=1'))).toBe(true)
    expect(urls.some((url) => url.includes('min_level=2'))).toBe(true)
  })

  it('el rango por defecto son nueve semanas y queda en la URL', async () => {
    const calls = setupFetch()
    await mountMatrix({ id: null })

    const query = router.currentRoute.value.query
    expect(query.from).toMatch(/^\d{4}-W\d{2}$/)
    expect(query.to).toMatch(/^\d{4}-W\d{2}$/)
    expect(weeksBetween(query.from, query.to)).toHaveLength(9)

    const urls = capacityCalls(calls)
    expect(urls.some((url) => url.includes('from=') && url.includes('to='))).toBe(true)
  })

  it('las flechas mueven el rango una semana y lo dejan en la URL', async () => {
    setupFetch()
    const wrapper = await mountMatrix({ id: null })

    const antes = router.currentRoute.value.query.from
    await wrapper.get('[data-testid="range-next"]').trigger('click')
    await flushPromises()

    const despues = router.currentRoute.value.query.from
    expect(despues).not.toBe(antes)
    expect(weeksBetween(router.currentRoute.value.query.from, router.currentRoute.value.query.to)).toHaveLength(9)
  })

  it('el boton de hoy devuelve el rango a la semana en curso', async () => {
    setupFetch()
    const wrapper = await mountMatrix({ id: null })

    await wrapper.get('[data-testid="range-previous"]').trigger('click')
    await flushPromises()
    const movido = router.currentRoute.value.query.from

    await wrapper.get('[data-testid="range-today"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.from).not.toBe(movido)
    expect(weeksBetween(router.currentRoute.value.query.from, router.currentRoute.value.query.to)).toHaveLength(9)
  })

  it('el desglose global usa el listado global de tareas', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix({ id: null })

    const celda = wrapper.get('[data-testid="cell-2-2026-W46"]')
    await celda.trigger('click')
    await flushPromises()

    expect(calls.some((call) => call.url.includes('/api/tasks?week='))).toBe(true)
    expect(wrapper.text()).toContain('Puesta en marcha')
  })

  it('la matriz no pide los miembros de cada proyecto', async () => {
    const calls = setupFetch()
    await mountMatrix({ id: null })

    // El informe trae el perfil de cada persona: no hace falta pedir los
    // miembros de cada proyecto por separado.
    expect(calls.some((call) => call.url.includes('/members'))).toBe(false)
  })

  it('el desglose pide solo las tareas de la persona, en el servidor', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix({ id: null })

    const celda = wrapper.get('[data-testid="cell-2-2026-W46"]')
    await celda.trigger('click')
    await flushPromises()

    const url = calls.find((call) => call.url.includes('/api/tasks?')).url
    expect(url).toContain('assigned_to=2')
    expect(url).toContain('week=2026-W46')
  })

  it('con filtro de proyecto el desglose pide las tareas de ese proyecto', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix({ id: null })

    await wrapper.get('[data-testid="filter-project"]').setValue('2')
    await flushPromises()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    // La celda es de ese proyecto: el panel tiene que contar lo mismo.
    const url = calls.find((call) => call.url.includes('/api/projects/2/tasks')).url
    expect(url).toContain('assigned_to=2')
    expect(url).toContain('week=2026-W46')
  })

  it('el modo de porcentaje enseña el porcentaje de uso', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="mode-porcentaje"]').trigger('click')
    await flushPromises()

    const celda = wrapper.get('[data-testid="cell-2-2026-W46"]')
    expect(celda.text()).toContain('120 %')
    expect(celda.text()).toContain('48/40 h')
    // El modo queda en la URL, para poder compartirlo.
    expect(router.currentRoute.value.query.mode).toBe('porcentaje')
  })

  it('el modo de proyectos enseña de que proyectos sale cada celda', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="mode-proyectos"]').trigger('click')
    await flushPromises()

    const etiqueta = wrapper.get('[data-testid="cell-2-2026-W46"] [data-testid="cell-project"]')
    expect(etiqueta.text()).toContain('Linea Pasteurizadora SIVE')
    expect(etiqueta.text()).toContain('48 h')
  })

  it('una celda sin proyectos muestra un punto', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="mode-proyectos"]').trigger('click')
    await flushPromises()

    const celda = wrapper.get('[data-testid="cell-1-2026-W46"]')
    expect(celda.text()).toContain('·')
    expect(celda.find('[data-testid="cell-project"]').exists()).toBe(false)
  })

  it('los chips de resumen cuentan las celdas sobrecargadas y los huecos', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    expect(wrapper.get('[data-testid="summary-overload"]').text()).toContain(
      '1 celda sobrecargada',
    )
    // Ana tiene 30 h y 40 h libres: dos huecos de 20 h o más.
    expect(wrapper.get('[data-testid="summary-free"]').text()).toContain('2 huecos')
    // 82 h sobre 160 h de capacidad.
    expect(wrapper.get('[data-testid="summary-average"]').text()).toContain('51 %')
  })

  it('la celda abierta queda en la URL', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.cell).toBe('2-2026-W46')
  })

  it('al entrar con una celda en la URL se abre su detalle', async () => {
    setupFetch()
    const wrapper = await mountMatrix({ id: null }, { cell: '2-2026-W46' })

    expect(wrapper.text()).toContain('Sebastian en 2026-W46')
  })

  it('cerrar el detalle quita la celda de la URL', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="side-panel-close"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.cell).toBeUndefined()
  })

  it('el panel enseña la carga de la celda con su estado', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    // 48 h de 40 h: sobrecarga alta al 120 %.
    expect(wrapper.text()).toContain('48 h')
    expect(wrapper.get('[data-testid="cell-state"]').text()).toContain('Sobrecarga alta')
    expect(wrapper.get('[data-testid="cell-state"]').text()).toContain('120 %')
  })

  it('el panel avisa de los dias no laborables de la semana', async () => {
    setupFetch({
      '/api/projects/1/capacity': () =>
        jsonResponse({
          ...capacityReport,
          weeks: [
            { week: '2026-W45', holidays: [] },
            {
              week: '2026-W46',
              holidays: [
                { date: '2026-11-11', name: 'Fiesta local', scope: 'global', half_day: false },
              ],
            },
          ],
        }),
    })
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="cell-notes"]').text()).toContain('Fiesta local')
  })

  it('una celda sin tareas dice que la semana esta libre', async () => {
    setupFetch({
      '/api/projects/1/tasks': () => jsonResponse([]),
    })
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Semana libre')
  })

  it('arrastrar una tarea enseña en el origen lo que quedaria sin ella', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    await wrapper
      .get('[data-testid="breakdown-task"]')
      .trigger('dragstart', { dataTransfer: { setData: vi.fn() } })
    await flushPromises()

    // La tarea aporta 12 h de las 48 de la celda: quedarian 36 h.
    const origen = wrapper.get('[data-testid="cell-2-2026-W46"]')
    expect(origen.attributes('data-preview')).toBe('si')
    expect(origen.text()).toContain('36 h')
    expect(origen.text()).toContain('origen')
  })

  it('arrastrar una tarea enseña en los destinos validos la carga resultante', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    await wrapper
      .get('[data-testid="breakdown-task"]')
      .trigger('dragstart', { dataTransfer: { setData: vi.fn() } })
    await flushPromises()

    // Ana tiene 0 h y 40 h de capacidad: con 12 h de la tarea pasa al 30 %.
    const destino = wrapper.get('[data-testid="cell-1-2026-W46"]')
    expect(destino.text()).toContain('12 h')
    expect(destino.text()).toContain('30 %')
  })

  it('arrastrar una tarea marca a quien no es miembro del proyecto', async () => {
    setupFetch({
      '/api/projects/1/capacity': () => jsonResponse(reportConAjeno),
    })
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    await wrapper
      .get('[data-testid="breakdown-task"]')
      .trigger('dragstart', { dataTransfer: { setData: vi.fn() } })
    await flushPromises()

    const ajeno = wrapper.get('[data-testid="cell-3-2026-W46"]')
    expect(ajeno.text()).toContain('No es miembro')
    expect(ajeno.classes()).toContain('cp-striped')
  })

  it('soltar una tarea en otra celda reasigna la tarea', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    await wrapper
      .get('[data-testid="breakdown-task"]')
      .trigger('dragstart', { dataTransfer: { setData: vi.fn() } })
    await flushPromises()

    await wrapper.get('[data-testid="cell-1-2026-W46"]').trigger('drop')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body).assigned_to).toBe(1)
  })

  it('soltar una tarea mueve las horas de la celda antes de que conteste el servidor', async () => {
    let responder
    const pendiente = new Promise((resolve) => {
      responder = resolve
    })
    setupFetch({
      '/api/tasks/10': () => pendiente.then(() => jsonResponse({ id: 10 })),
    })
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    await wrapper
      .get('[data-testid="breakdown-task"]')
      .trigger('dragstart', { dataTransfer: { setData: vi.fn() } })
    await flushPromises()

    await wrapper.get('[data-testid="cell-1-2026-W46"]').trigger('drop')
    await flushPromises()

    // Ana pasa de 0 h a 12 h sin esperar al servidor.
    expect(wrapper.get('[data-testid="cell-1-2026-W46"]').text()).toContain('12/40')
    expect(wrapper.get('[data-testid="cell-2-2026-W46"]').text()).toContain('36/40')

    responder()
    await flushPromises()
  })

  it('si el servidor rechaza la reasignacion, la matriz vuelve atras', async () => {
    setupFetch({
      '/api/tasks/10': () => jsonResponse({ detail: 'No se pudo guardar' }, false, 500),
    })
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    await wrapper
      .get('[data-testid="breakdown-task"]')
      .trigger('dragstart', { dataTransfer: { setData: vi.fn() } })
    await flushPromises()

    await wrapper.get('[data-testid="cell-1-2026-W46"]').trigger('drop')
    await flushPromises()

    // Ana se queda como estaba y el operario ve el motivo.
    expect(wrapper.get('[data-testid="cell-1-2026-W46"]').text()).toContain('·')
    expect(wrapper.get('[data-testid="capacity-warning"]').text()).toContain(
      'No se ha podido reasignar',
    )
  })

  it('mayus y la flecha mueven la tarea a la persona de al lado', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    await wrapper
      .get('[data-testid="breakdown-task"]')
      .trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body).assigned_to).toBe(1)
  })

  it('mayus y la flecha avisan cuando no hay nadie en esa direccion', async () => {
    setupFetch()
    const wrapper = await mountMatrix()

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    await wrapper
      .get('[data-testid="breakdown-task"]')
      .trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    await flushPromises()

    expect(wrapper.get('[data-testid="capacity-warning"]').text()).toContain(
      'No hay nadie más',
    )
  })

  it('el alta de una tarea nueva solo esta en la vista de proyecto', async () => {
    setupFetch()
    const global = await mountMatrix({ id: null })
    expect(global.find('[data-testid="cell-new-task"]').exists()).toBe(false)
    global.unmount()

    const proyecto = await mountMatrix({ id: 1 })
    await proyecto.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    expect(proyecto.find('[data-testid="cell-new-task"]').exists()).toBe(true)
  })

  it('crea una tarea en la semana abierta', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix({ id: 1 })

    await wrapper.get('[data-testid="cell-2-2026-W46"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="cell-new-task"]').trigger('click')
    await flushPromises()

    await wrapper.find('input[type="text"]').setValue('Tarea nueva')
    await wrapper.find('input[type="number"]').setValue('8')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const post = calls.find((c) => c.method === 'POST' && c.url.includes('/tasks'))
    expect(post).toBeDefined()
    expect(post.url).toContain('/api/projects/1/tasks')
    expect(JSON.parse(post.body).title).toBe('Tarea nueva')
  })
})
