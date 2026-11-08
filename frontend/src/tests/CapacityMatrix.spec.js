import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CapacityMatrix from '../components/CapacityMatrix.vue'

const members = [
  { user_id: 1, name: 'Ana', email: 'ana@example.com', role_id: 1, role_name: 'Project Manager', weekly_base_hours: 40 },
  { user_id: 2, name: 'Sebastian', email: 's@example.com', role_id: 2, role_name: 'Ingeniero', weekly_base_hours: 40 },
]

const capacityReport = {
  weeks: ['2026-W45', '2026-W46'],
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
        { week: '2026-W45', hours: 10, capacity: 40, is_overloaded: false },
        { week: '2026-W46', hours: 0, capacity: 40, is_overloaded: false },
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
        { week: '2026-W45', hours: 24, capacity: 40, is_overloaded: false },
        { week: '2026-W46', hours: 48, capacity: 40, is_overloaded: true },
      ],
    },
  ],
  holiday_task_ids: [],
}

const projectTasks = [
  { id: 10, project_id: 1, assigned_to: 2, title: 'Puesta en marcha', status: 'todo', start_date: '2026-11-09', end_date: '2026-11-11', estimated_hours: 12 },
  { id: 11, project_id: 1, assigned_to: 1, title: 'Esquemas EPLAN', status: 'todo', start_date: '2026-11-02', end_date: '2026-11-04', estimated_hours: 10 },
]

const departments = [
  { id: 1, name: 'Automatización & SCADA', manager_id: 1, manager_name: 'Ana' },
  { id: 2, name: 'Oficina Técnica / EPLAN', manager_id: 3, manager_name: 'Jorge' },
]

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch(overrides = {}) {
  const calls = []
  global.fetch = vi.fn(async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', body: options.body })
    if (overrides[url]) return overrides[url](options)
    if (url.endsWith('/auth/login')) {
      return jsonResponse({ access_token: 'tok-demo', token_type: 'bearer', user: { id: 9, name: 'Admin' } })
    }
    if (url.includes('/capacity')) return jsonResponse(capacityReport)
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

async function mountMatrix(props = {}) {
  const wrapper = mount(CapacityMatrix, {
    props: { id: 1, ...props },
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
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

    // Un solo selector abierto, no uno por tarea.
    const selects = wrapper.findAll('select')
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
    const select = wrapper.findAll('select').at(-1)
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

    const urls = calls.filter((call) => call.url.includes('/capacity')).map((call) => call.url)
    expect(urls.some((url) => url.includes('/projects/1/capacity'))).toBe(true)
    expect(urls.some((url) => url.includes('/projects/2/capacity'))).toBe(true)
  })

  it('sin identificador pide la capacidad global', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix({ id: null })

    const urls = calls.filter((call) => call.url.includes('/capacity')).map((call) => call.url)
    expect(urls.some((url) => url.endsWith('/api/capacity'))).toBe(true)
    expect(urls.some((url) => url.includes('/projects/'))).toBe(false)
    expect(wrapper.text()).toContain('Capacidad Global')
  })

  it('el filtro por departamento limita la capacidad global', async () => {
    const calls = setupFetch()
    const wrapper = await mountMatrix({ id: null })

    const filtro = wrapper.find('header select')
    await filtro.setValue('2')
    await flushPromises()

    const urls = calls.filter((call) => call.url.includes('/capacity')).map((call) => call.url)
    expect(urls.some((url) => url.includes('department_id=2'))).toBe(true)
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
})
