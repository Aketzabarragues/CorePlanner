import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TaskDetailPanel from '../components/TaskDetailPanel.vue'
import TaskListView from '../views/TaskListView.vue'

const tareas = [
  {
    id: 1,
    project_id: 1,
    assigned_to: 1,
    assigned_name: 'Ana',
    title: 'Esquemas EPLAN',
    status: 'backlog',
    description: null,
    start_date: '2026-11-02',
    end_date: '2026-11-04',
    estimated_hours: 10,
    checklist_total: 0,
    checklist_done: 0,
  },
  {
    id: 2,
    project_id: 1,
    assigned_to: 2,
    assigned_name: 'Sebastián',
    title: 'Programación SCADA WinCC',
    status: 'in_progress',
    description: null,
    start_date: '2026-11-05',
    end_date: '2026-11-11',
    estimated_hours: 40,
    checklist_total: 3,
    checklist_done: 1,
  },
  {
    id: 3,
    project_id: 1,
    assigned_to: null,
    assigned_name: null,
    title: 'Puesta en marcha de válvulas',
    status: 'done',
    description: null,
    start_date: '2026-11-09',
    end_date: '2026-11-11',
    estimated_hours: 12,
    checklist_total: 2,
    checklist_done: 2,
  },
]

const equipo = [
  { user_id: 1, name: 'Ana', role_name: 'Project Manager' },
  { user_id: 2, name: 'Sebastián', role_name: 'Ingeniero' },
]

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

/** Simula el servidor: las tareas del proyecto, su equipo y el ambito. */
function setupFetch({ editable = [1] } = {}) {
  const calls = []
  global.fetch = vi.fn(async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET' })
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.endsWith('/me')) {
      return jsonResponse({
        user: { id: 9, name: 'Admin' },
        role_label: 'Tecnico',
        is_manager: false,
        visible_project_ids: [1],
        editable_project_ids: editable,
      })
    }
    if (url.endsWith('/members')) {
      return jsonResponse(equipo)
    }
    if (url.endsWith('/projects/1/tasks')) {
      return jsonResponse(tareas)
    }
    return jsonResponse({}, false, 404)
  })
  return calls
}

async function mountList() {
  const wrapper = mount(TaskListView, {
    props: { id: 1 },
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  await flushPromises()
  await flushPromises()
  return wrapper
}

/** Titulos de las filas, en el orden en que se ven. */
function titulos(wrapper) {
  return wrapper.findAll('[data-testid="task-title"]').map((button) => button.text())
}

describe('TaskListView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('pide las tareas del proyecto', async () => {
    const calls = setupFetch()

    await mountList()

    const llamada = calls.find((call) => call.url.endsWith('/projects/1/tasks'))
    expect(llamada).toBeDefined()
  })

  it('enseña una fila por tarea', async () => {
    setupFetch()

    const wrapper = await mountList()

    expect(wrapper.findAll('[data-testid="task-row"]')).toHaveLength(3)
    expect(titulos(wrapper)).toEqual([
      'Esquemas EPLAN',
      'Programación SCADA WinCC',
      'Puesta en marcha de válvulas',
    ])
  })

  it('enseña las columnas pedidas', async () => {
    setupFetch()

    const wrapper = await mountList()

    const cabeceras = wrapper.findAll('thead th').map((th) => th.text().trim())
    expect(cabeceras).toEqual(['Título', 'Asignado', 'Estado', 'Inicio → Fin', 'Horas', 'Checklist'])
  })

  it('la columna del checklist solo dice algo si hay puntos', async () => {
    setupFetch()

    const wrapper = await mountList()

    const checklists = wrapper.findAll('[data-testid="task-checklist-progress"]')
    expect(checklists).toHaveLength(2)
    expect(checklists[0].text()).toBe('1/3 hechos')
    expect(checklists[1].text()).toBe('2/2 hechos')
  })

  it('por defecto sale ordenada por fecha de inicio', async () => {
    setupFetch()

    const wrapper = await mountList()

    expect(titulos(wrapper)).toEqual([
      'Esquemas EPLAN',
      'Programación SCADA WinCC',
      'Puesta en marcha de válvulas',
    ])
  })

  it('un clic en la cabecera ordena por esa columna', async () => {
    setupFetch()
    const wrapper = await mountList()

    await wrapper.find('[data-testid="sort-hours"]').trigger('click')
    await flushPromises()

    expect(titulos(wrapper)).toEqual([
      'Esquemas EPLAN',
      'Puesta en marcha de válvulas',
      'Programación SCADA WinCC',
    ])
  })

  it('un segundo clic en la misma cabecera invierte el sentido', async () => {
    setupFetch()
    const wrapper = await mountList()

    await wrapper.find('[data-testid="sort-hours"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="sort-hours"]').trigger('click')
    await flushPromises()

    expect(titulos(wrapper)).toEqual([
      'Programación SCADA WinCC',
      'Puesta en marcha de válvulas',
      'Esquemas EPLAN',
    ])
  })

  it('el filtro por estado deja solo las tareas de ese estado', async () => {
    setupFetch()
    const wrapper = await mountList()

    await wrapper.find('[data-testid="filter-status"]').setValue('in_progress')
    await flushPromises()

    expect(titulos(wrapper)).toEqual(['Programación SCADA WinCC'])
    expect(wrapper.find('[data-testid="task-count"]').text()).toBe('1 de 3 tareas')
  })

  it('el filtro por persona deja solo las tareas de esa persona', async () => {
    setupFetch()
    const wrapper = await mountList()

    await wrapper.find('[data-testid="filter-person"]').setValue('1')
    await flushPromises()

    expect(titulos(wrapper)).toEqual(['Esquemas EPLAN'])
  })

  it('los filtros se pueden quitar', async () => {
    setupFetch()
    const wrapper = await mountList()

    await wrapper.find('[data-testid="filter-status"]').setValue('in_progress')
    await flushPromises()
    await wrapper.find('[data-testid="filter-status"]').setValue('')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="task-row"]')).toHaveLength(3)
  })

  it('un clic en una fila abre el detalle de esa tarea', async () => {
    setupFetch()
    const wrapper = await mountList()

    await wrapper.findAll('[data-testid="task-row"]')[1].trigger('click')
    await flushPromises()

    const panel = wrapper.findComponent(TaskDetailPanel)
    expect(panel.props('open')).toBe(true)
    expect(panel.props('taskId')).toBe(2)
  })

  it('sin permiso de escritura la tabla se ve y el detalle no se puede tocar', async () => {
    setupFetch({ editable: [] })
    const wrapper = await mountList()

    expect(wrapper.findAll('[data-testid="task-row"]')).toHaveLength(3)
    expect(wrapper.text()).toContain('Solo lectura')

    await wrapper.findAll('[data-testid="task-row"]')[0].trigger('click')
    await flushPromises()

    const panel = wrapper.findComponent(TaskDetailPanel)
    expect(panel.props('open')).toBe(true)
    expect(panel.props('canEdit')).toBe(false)
  })

  it('sin tareas sale el aviso de que no hay nada', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ access_token: 'tok', user: { id: 9, name: 'Admin' } })
      }
      if (url.endsWith('/me')) {
        return jsonResponse({ editable_project_ids: [1], visible_project_ids: [1] })
      }
      if (url.endsWith('/members')) return jsonResponse([])
      if (url.endsWith('/projects/1/tasks')) return jsonResponse([])
      return jsonResponse({}, false, 404)
    })

    const wrapper = await mountList()

    expect(wrapper.findAll('[data-testid="task-row"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('No hay tareas que enseñar')
  })
})
