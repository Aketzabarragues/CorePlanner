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
  { id: 1, name: 'Ana', department_id: 1, department_name: 'Alimentacion' },
  { id: 2, name: 'Jorge', department_id: 2, department_name: 'Energia' },
]

/**
 * Diagrama con dos personas y una tarea sin asignar.
 *
 * Es el que usa el panel de visibilidad: hacen falta personas de dos
 * departamentos y una tarea sin asignar, que no se esconde con nadie.
 */
const feedVisibilidad = {
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
      id: 13,
      name: 'Puesta en marcha',
      start: '2026-11-04',
      end: '2026-11-07',
      progress: 0,
      dependencies: '',
      custom_class: 'persona-2',
      project_id: 2,
      project_name: 'Red de tuberias',
      title: 'Puesta en marcha',
      assigned_to: null,
      assigned_name: null,
    },
  ],
  members: [
    { user_id: 1, name: 'Ana', css_class: 'persona-0' },
    { user_id: 2, name: 'Jorge', css_class: 'persona-1' },
  ],
  undated_task_ids: [],
  unassigned_task_ids: [13],
}

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

  it('con los dos filtros los pide juntos', async () => {
    const calls = setupFetch()

    await mountGantt({ department: '2', project: '3' })

    const call = calls.find((c) => c.url.includes('/gantt'))
    expect(call.url).toBe('/api/gantt?department_id=2&project_id=3')
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

  it('el filtro de persona ya no esta en el Gantt', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    expect(wrapper.find('[data-testid="gantt-filter-person"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Todas las personas')
  })

  it('un assigned_to en la URL no se manda al backend', async () => {
    const calls = setupFetch()

    await mountGantt({ assigned_to: '5' })

    const call = calls.find((c) => c.url.includes('/gantt'))
    expect(call.url).toBe('/api/gantt')
  })

  it('ofrece los filtros con las opciones visibles', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    const departamentos = wrapper.get('[data-testid="gantt-filter-department"]')
    expect(departamentos.text()).toContain('Alimentacion')
    expect(departamentos.text()).toContain('Energia')
    const proyectos = wrapper.get('[data-testid="gantt-filter-project"]')
    expect(proyectos.text()).toContain('Red de tuberias')
  })

  it('los filtros usan el formato cuadrado del resto de la app', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    const filtros = [
      ['gantt-filter-department', 'Departamento'],
      ['gantt-filter-project', 'Proyecto'],
      ['gantt-group-by', 'Agrupar por'],
    ]

    for (const [testid, texto] of filtros) {
      const select = wrapper.get(`[data-testid="${testid}"]`)
      const label = select.element.closest('label')
      expect(label).not.toBeNull()

      // La etiqueta lleva el titulo encima y el select es un control normal.
      const clasesLabel = label.className
      expect(clasesLabel).toContain('text-xs font-medium text-slate-600')
      expect(clasesLabel).not.toContain('rounded-full')

      const span = label.querySelector('span')
      expect(span.className).toContain('mb-1 block')
      expect(span.textContent).toBe(texto)

      const clasesSelect = select.classes().join(' ')
      expect(clasesSelect).toContain(
        'rounded border border-slate-300 bg-white px-2 py-1.5 text-sm',
      )
      expect(clasesSelect).not.toContain('rounded-full')
      expect(clasesSelect).not.toContain('bg-transparent')
    }
  })

  it('los filtros se separan con el hueco del resto de la app', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    const contenedor = wrapper.get('[data-testid="gantt-filters"]')
    expect(contenedor.classes()).toContain('gap-3')
    expect(contenedor.classes()).not.toContain('gap-2')
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

  it('el panel de visibilidad abre con las personas del diagrama', async () => {
    setupFetch(feedVisibilidad)

    const { wrapper } = await mountGantt()

    await wrapper.get('[data-testid="toggle-visibility"]').trigger('click')

    expect(wrapper.get('[data-testid="visibility-panel"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="hide-person-1"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="hide-person-2"]').exists()).toBe(true)
    // Ana es de Alimentacion y Jorge de Energia.
    expect(wrapper.get('[data-testid="hide-department-1"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="hide-department-2"]').exists()).toBe(true)
  })

  it('esconder una persona quita sus barras y la quita de la leyenda', async () => {
    setupFetch(feedVisibilidad)

    const { wrapper } = await mountGantt()

    await wrapper.get('[data-testid="toggle-visibility"]').trigger('click')
    await wrapper.get('[data-testid="hide-person-1"]').setValue(false)
    await flushPromises()
    await flushPromises()

    // Se quedan las barras de Jorge y la tarea sin asignar.
    const barras = ganttInstances[ganttInstances.length - 1].tasks
    expect(barras.map((barra) => barra.id)).toEqual(['12', '13'])

    const leyenda = wrapper.get('[data-testid="gantt-legend"]').text()
    expect(leyenda).not.toContain('Ana')
    expect(leyenda).toContain('Jorge')

    expect(wrapper.get('[data-testid="hidden-count"]').text()).toContain('1 oculto')
  })

  it('esconder un departamento quita las barras y la leyenda de sus personas', async () => {
    setupFetch(feedVisibilidad)

    const { wrapper } = await mountGantt()

    await wrapper.get('[data-testid="toggle-visibility"]').trigger('click')
    await wrapper.get('[data-testid="hide-department-1"]').setValue(false)
    await flushPromises()
    await flushPromises()

    // Ana es del departamento 1: sus dos barras se van y las de Jorge se quedan.
    const barras = ganttInstances[ganttInstances.length - 1].tasks
    expect(barras.map((barra) => barra.id)).toEqual(['12', '13'])

    const leyenda = wrapper.get('[data-testid="gantt-legend"]').text()
    expect(leyenda).not.toContain('Ana')
    expect(leyenda).toContain('Jorge')

    expect(wrapper.get('[data-testid="hidden-count"]').text()).toContain('1 oculto')
  })

  it('mostrar todos devuelve las barras y la leyenda', async () => {
    setupFetch(feedVisibilidad)

    const { wrapper } = await mountGantt()

    await wrapper.get('[data-testid="toggle-visibility"]').trigger('click')
    await wrapper.get('[data-testid="hide-department-1"]').setValue(false)
    await flushPromises()
    await flushPromises()

    expect(wrapper.get('[data-testid="hidden-count"]').text()).toContain('1 oculto')

    await wrapper.get('[data-testid="show-all"]').trigger('click')
    await flushPromises()
    await flushPromises()

    const barras = ganttInstances[ganttInstances.length - 1].tasks
    expect(barras).toHaveLength(4)

    const leyenda = wrapper.get('[data-testid="gantt-legend"]').text()
    expect(leyenda).toContain('Ana')
    expect(leyenda).toContain('Jorge')

    expect(wrapper.find('[data-testid="hidden-count"]').exists()).toBe(false)
  })

  it('esconder personas no toca la url ni vuelve a pedir el diagrama', async () => {
    const calls = setupFetch(feedVisibilidad)

    const { wrapper, router } = await mountGantt()

    const peticiones = calls.filter((c) => c.url.includes('/gantt')).length
    await wrapper.get('[data-testid="toggle-visibility"]').trigger('click')
    await wrapper.get('[data-testid="hide-person-1"]').setValue(false)
    await flushPromises()
    await flushPromises()

    expect(Object.keys(router.currentRoute.value.query)).toEqual([])
    expect(calls.filter((c) => c.url.includes('/gantt')).length).toBe(peticiones)
  })
})
