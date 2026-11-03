import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ganttInstances = []

vi.mock('frappe-gantt', () => {
  return {
    default: class FakeGantt {
      constructor(container, tasks, options) {
        this.container = container
        this.tasks = tasks
        this.options = options
        this.modes = []
        ganttInstances.push(this)
      }

      change_view_mode(mode) {
        this.modes.push(mode)
      }
    },
  }
})

import GanttView from '../views/GanttView.vue'

const feed = {
  tasks: [
    {
      id: 10,
      name: 'Programacion SCADA WinCC · Ana',
      start: '2026-11-05',
      end: '2026-11-11',
      progress: 0,
      dependencies: '',
      custom_class: 'persona-0',
      project_id: 1,
      project_name: 'Linea Pasteurizadora SIVE',
    },
  ],
  members: [{ user_id: 1, name: 'Ana', css_class: 'persona-0' }],
  undated_task_ids: [11],
  unassigned_task_ids: [],
}

function setupFetch() {
  const calls = []
  global.fetch = vi.fn(async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', body: options.body })
    if (url.endsWith('/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'tok', user: { id: 9, name: 'Admin' } }),
      }
    }
    if (url.includes('/gantt')) {
      return { ok: true, status: 200, json: async () => feed }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  })
  return calls
}

async function mountGantt(props = { id: 1 }) {
  const wrapper = mount(GanttView, {
    props,
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('GanttView', () => {
  beforeEach(() => {
    localStorage.clear()
    ganttInstances.length = 0
    setActivePinia(createPinia())
  })

  it('pide el diagrama al endpoint del proyecto', async () => {
    const calls = setupFetch()

    await mountGantt()

    const call = calls.find((c) => c.url.includes('/gantt'))
    expect(call).toBeDefined()
    expect(call.url).toBe('/api/projects/1/gantt')
  })

  it('dibuja una barra por tarea con el color de su persona', async () => {
    setupFetch()

    await mountGantt()

    expect(ganttInstances).toHaveLength(1)
    expect(ganttInstances[0].tasks).toHaveLength(1)
    expect(ganttInstances[0].tasks[0].custom_class).toBe('persona-0')
  })

  it('pasa las barras con el identificador en texto', async () => {
    setupFetch()

    await mountGantt()

    // La libreria compara el identificador de la tarea con el que lee del
    // DOM, que es texto, asi que tiene que ir como texto.
    expect(ganttInstances[0].tasks[0].id).toBe('10')
  })

  it('muestra la leyenda con las personas del proyecto', async () => {
    setupFetch()

    const wrapper = await mountGantt()

    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('1 tarea(s) sin fechas')
  })

  it('ofrece el selector de escala temporal', async () => {
    setupFetch()

    const wrapper = await mountGantt()

    const botones = wrapper.findAll('header button').map((b) => b.text())
    expect(botones).toEqual(['Dia', 'Semana', 'Mes'])
  })

  it('cambia la escala del diagrama', async () => {
    setupFetch()

    const wrapper = await mountGantt()

    const mes = wrapper.findAll('header button').find((b) => b.text() === 'Mes')
    await mes.trigger('click')

    expect(ganttInstances[0].modes).toEqual(['Month'])
  })

  it('guarda las fechas cuando se mueve una barra', async () => {
    const calls = setupFetch()
    const wrapper = await mountGantt()

    const task = ganttInstances[0].tasks[0]
    await ganttInstances[0].options.on_date_change(
      task,
      new Date(2026, 10, 9),
      new Date(2026, 10, 11, 23, 59, 59),
    )
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(patch.url).toBe('/api/tasks/10')
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-09',
      end_date: '2026-11-11',
    })
    expect(wrapper.text()).toContain('Fechas actualizadas')
  })

  it('sin proyecto pide el diagrama global', async () => {
    const calls = setupFetch()

    const wrapper = await mountGantt({ id: null })

    const call = calls.find((c) => c.url.includes('/gantt'))
    expect(call.url).toBe('/api/gantt')
    expect(wrapper.text()).toContain('Gantt Global')
  })

  it('en el diagrama global cada barra lleva delante su proyecto', async () => {
    setupFetch()

    await mountGantt({ id: null })

    const barra = ganttInstances[0].tasks[0]
    expect(barra.name).toBe('Linea Pasteurizadora SIVE · Programacion SCADA WinCC · Ana')
  })

  it('en el diagrama de un proyecto la barra no lleva el proyecto delante', async () => {
    setupFetch()

    await mountGantt()

    expect(ganttInstances[0].tasks[0].name).toBe('Programacion SCADA WinCC · Ana')
  })
})
