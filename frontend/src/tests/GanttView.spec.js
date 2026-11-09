import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const ganttInstances = []

/**
 * Dibuja el mismo esqueleto que la libreria: un SVG con la capa de la
 * rejilla. Es lo que necesita la franja divisoria para colocarse.
 */
function pintarSvg(container) {
  container.innerHTML =
    '<svg class="gantt"><g class="grid"><rect class="grid-row" width="700"></rect></g></svg>'
}

vi.mock('frappe-gantt', () => {
  return {
    default: class FakeGantt {
      constructor(container, tasks, options) {
        this.container = container
        this.tasks = tasks
        this.options = options
        this.modes = []
        ganttInstances.push(this)
        pintarSvg(container)
      }

      change_view_mode(mode) {
        this.modes.push(mode)
        // El cambio de escala redibuja el SVG y deja la capa de grupos fuera.
        pintarSvg(this.container)
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
      title: 'Programacion SCADA WinCC',
      assigned_to: 1,
      assigned_name: 'Ana',
    },
    {
      id: 12,
      name: 'Planos de tuberias · Jorge',
      start: '2026-11-03',
      end: '2026-11-06',
      progress: 0,
      dependencies: '',
      custom_class: 'persona-1',
      project_id: 2,
      project_name: 'Red de tuberias',
      title: 'Planos de tuberias',
      assigned_to: 2,
      assigned_name: 'Jorge',
    },
    {
      id: 11,
      name: 'Montajes · Ana',
      start: '2026-11-09',
      end: '2026-11-12',
      progress: 0,
      dependencies: '',
      custom_class: 'persona-0',
      project_id: 1,
      project_name: 'Linea Pasteurizadora SIVE',
      title: 'Montajes',
      assigned_to: 1,
      assigned_name: 'Ana',
    },
  ],
  members: [{ user_id: 1, name: 'Ana', css_class: 'persona-0' }],
  undated_task_ids: [11],
  unassigned_task_ids: [],
}

const proyectos = [
  { id: 1, name: 'Linea Pasteurizadora SIVE', department_id: 1 },
  { id: 2, name: 'Red de tuberias', department_id: 2 },
]

const departamentos = [
  { id: 1, name: 'Alimentacion' },
  { id: 2, name: 'Energia' },
]

const directorio = [
  { id: 1, name: 'Ana', department_id: 1 },
  { id: 2, name: 'Jorge', department_id: 2 },
]

function setupFetch(respuesta = feed) {
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
      return { ok: true, status: 200, json: async () => respuesta }
    }
    if (url.includes('/people')) {
      return { ok: true, status: 200, json: async () => directorio }
    }
    if (url.includes('/projects')) {
      return { ok: true, status: 200, json: async () => proyectos }
    }
    if (url.includes('/departments')) {
      return { ok: true, status: 200, json: async () => departamentos }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  })
  return calls
}

/**
 * Monta el diagrama.
 *
 * El proyecto es un filtro que vive en la URL, de modo que la vista se monta
 * siempre en la misma ruta y lo que cambia es la consulta.
 */
async function mountGantt(query = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/gantt', name: 'gantt', component: { template: '<div />' } }],
  })
  await router.push({ path: '/gantt', query })
  await router.isReady()

  const wrapper = mount(GanttView, {
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  await flushPromises()
  await flushPromises()
  return { wrapper, router }
}

describe('GanttView', () => {
  beforeEach(() => {
    localStorage.clear()
    ganttInstances.length = 0
    setActivePinia(createPinia())
  })

  it('pide el diagrama de toda la organizacion', async () => {
    const calls = setupFetch()

    await mountGantt()

    const call = calls.find((c) => c.url.includes('/gantt'))
    expect(call).toBeDefined()
    expect(call.url).toBe('/api/gantt')
  })

  it('con filtro de proyecto pide solo ese proyecto', async () => {
    const calls = setupFetch()

    await mountGantt({ project: '2' })

    const call = calls.find((c) => c.url.includes('/gantt'))
    expect(call.url).toBe('/api/gantt?project_id=2')
  })

  it('con los tres filtros los pide juntos', async () => {
    const calls = setupFetch()

    await mountGantt({ department: '2', project: '3', assigned_to: '5' })

    const call = calls.find((c) => c.url.includes('/gantt'))
    expect(call.url).toBe('/api/gantt?department_id=2&project_id=3&assigned_to=5')
  })

  it('al cambiar el filtro vuelve a pedir el diagrama', async () => {
    const calls = setupFetch()
    const { router } = await mountGantt()

    await router.replace({ path: '/gantt', query: { project: '1' } })
    await flushPromises()
    await flushPromises()

    const urls = calls.filter((c) => c.url.includes('/gantt')).map((c) => c.url)
    expect(urls.some((url) => url.includes('project_id=1'))).toBe(true)
    expect(ganttInstances).toHaveLength(2)
  })

  it('el selector de departamento escribe el filtro en la url', async () => {
    const calls = setupFetch()
    const { wrapper, router } = await mountGantt()

    await wrapper.get('[data-testid="gantt-filter-department"]').setValue('2')
    await flushPromises()
    await flushPromises()

    expect(router.currentRoute.value.query.department).toBe('2')
    const urls = calls.filter((c) => c.url.includes('/gantt')).map((c) => c.url)
    expect(urls.some((url) => url.includes('department_id=2'))).toBe(true)
  })

  it('el selector de persona escribe el filtro en la url', async () => {
    const calls = setupFetch()
    const { wrapper, router } = await mountGantt()

    await wrapper.get('[data-testid="gantt-filter-person"]').setValue('1')
    await flushPromises()
    await flushPromises()

    expect(router.currentRoute.value.query.assigned_to).toBe('1')
    const urls = calls.filter((c) => c.url.includes('/gantt')).map((c) => c.url)
    expect(urls.some((url) => url.includes('assigned_to=1'))).toBe(true)
  })

  it('ofrece los filtros con las opciones visibles', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    const departamentos = wrapper.get('[data-testid="gantt-filter-department"]')
    expect(departamentos.text()).toContain('Alimentacion')
    expect(departamentos.text()).toContain('Energia')
    const proyectos = wrapper.get('[data-testid="gantt-filter-project"]')
    expect(proyectos.text()).toContain('Red de tuberias')
    const personas = wrapper.get('[data-testid="gantt-filter-person"]')
    expect(personas.text()).toContain('Jorge')
  })

  it('dibuja una barra por tarea con el color de su persona', async () => {
    setupFetch()

    await mountGantt()

    expect(ganttInstances).toHaveLength(1)
    expect(ganttInstances[0].tasks).toHaveLength(3)
    expect(ganttInstances[0].tasks[0].custom_class).toBe('persona-0')
  })

  it('pasa las barras con el identificador en texto', async () => {
    setupFetch()

    await mountGantt()

    // La libreria compara el identificador de la tarea con el que lee del
    // DOM, que es texto, asi que tiene que ir como texto.
    expect(ganttInstances[0].tasks[0].id).toBe('10')
  })

  it('muestra la leyenda con las personas del diagrama', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('1 tarea(s) sin fechas')
  })

  it('ofrece el selector de escala temporal', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    const botones = wrapper.findAll('header button').map((b) => b.text())
    expect(botones).toEqual(['Día', 'Semana', 'Mes'])
  })

  it('cambia la escala del diagrama', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    const mes = wrapper.findAll('header button').find((b) => b.text() === 'Mes')
    await mes.trigger('click')

    expect(ganttInstances[0].modes).toEqual(['Month'])
  })

  it('guarda las fechas cuando se mueve una barra', async () => {
    const calls = setupFetch()
    const { wrapper } = await mountGantt()

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

  it('cada barra lleva delante su proyecto', async () => {
    setupFetch()

    await mountGantt()

    const barra = ganttInstances[0].tasks.find((item) => item.id === '10')
    expect(barra.name).toBe('Linea Pasteurizadora SIVE · Programacion SCADA WinCC · Ana')
  })

  it('agrupar por proyecto ordena las barras por proyecto', async () => {
    setupFetch()

    await mountGantt({ group: 'proyecto' })

    const barras = ganttInstances[0].tasks
    expect(barras[0].name).toContain('Linea Pasteurizadora SIVE')
    expect(barras[1].name).toContain('Montajes')
    expect(barras[2].name).toContain('Red de tuberias')
  })

  it('el nombre del grupo solo encabeza su bloque', async () => {
    setupFetch()

    await mountGantt({ group: 'departamento' })

    const barras = ganttInstances[0].tasks
    // La primera barra del bloque lleva el nombre del grupo...
    expect(barras[0].name).toBe(
      'Alimentacion · Linea Pasteurizadora SIVE · Programacion SCADA WinCC · Ana',
    )
    // ...las demas no lo repiten, aunque si mantienen su proyecto.
    expect(barras[1].name).toBe('Linea Pasteurizadora SIVE · Montajes · Ana')
  })

  it('agrupar por departamento cambia el encabezado de las barras', async () => {
    setupFetch()

    await mountGantt({ group: 'departamento' })

    const barras = ganttInstances[0].tasks
    expect(barras[0].name).toBe(
      'Alimentacion · Linea Pasteurizadora SIVE · Programacion SCADA WinCC · Ana',
    )
    expect(barras[1].name).toBe('Linea Pasteurizadora SIVE · Montajes · Ana')
    expect(barras[2].name).toBe('Energia · Red de tuberias · Planos de tuberias · Jorge')
  })

  it('agrupar por persona cambia el encabezado de las barras', async () => {
    setupFetch()

    await mountGantt({ group: 'persona' })

    const barras = ganttInstances[0].tasks
    expect(barras[0].name).toBe('Ana · Linea Pasteurizadora SIVE · Programacion SCADA WinCC')
    expect(barras[2].name).toBe('Jorge · Red de tuberias · Planos de tuberias')
  })

  it('pinta una franja divisoria por grupo', async () => {
    setupFetch()

    const { wrapper } = await mountGantt({ group: 'departamento' })

    const svg = wrapper.find('svg.gantt')
    expect(svg.exists()).toBe(true)
    expect(svg.element.querySelectorAll('g.grupos line.grupo-linea').length).toBe(2)
  })

  it('sin agrupar no pinta franja divisoria', async () => {
    setupFetch()

    const { wrapper } = await mountGantt({ group: 'sin' })

    const svg = wrapper.find('svg.gantt')
    expect(svg.element.querySelectorAll('g.grupos line.grupo-linea').length).toBe(0)
  })
})
