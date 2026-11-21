import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

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

function setupFetch(respuesta = feed, festivos = [], editables = [1, 2], cascada = null, cascadaOk = true) {
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
    if (url.includes('/cascade')) {
      // Propuesta de cascada de la barra soltada; sin configurar no arrastra
      // nada. Con `cascadaOk` en falso la consulta cae, como un 500 real.
      if (!cascadaOk) {
        return { ok: false, status: 500, json: async () => ({ detail: 'Sin cascada' }) }
      }
      return { ok: true, status: 200, json: async () => cascada ?? { moves: [] } }
    }
    if (url.includes('/gantt')) {
      return { ok: true, status: 200, json: async () => respuesta }
    }
    if (url.includes('/non-working-days')) {
      return { ok: true, status: 200, json: async () => festivos }
    }
    if (url.includes('/people')) {
      return { ok: true, status: 200, json: async () => directorio }
    }
    if (url.includes('/members')) {
      // Antes que `/projects`: la URL de miembros va debajo del proyecto.
      const miembros = {
        1: [
          { user_id: 1, name: 'Ana', email: 'ana@demo', role_id: 1, role_name: 'Ingeniera', weekly_base_hours: '40.00' },
        ],
        2: [
          { user_id: 2, name: 'Jorge', email: 'jorge@demo', role_id: 2, role_name: 'Ingeniero', weekly_base_hours: '40.00' },
        ],
      }
      return { ok: true, status: 200, json: async () => miembros[Number(url.split('/projects/')[1].split('/')[0])] ?? [] }
    }
    if (url.includes('/projects')) {
      return { ok: true, status: 200, json: async () => proyectos }
    }
    if (url.includes('/departments')) {
      return { ok: true, status: 200, json: async () => departamentos }
    }
    if (url.endsWith('/me')) {
      // El gerente de demostracion escribe en los dos proyectos del feed.
      return { ok: true, status: 200, json: async () => ({ editable_project_ids: editables }) }
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

/** Barras pintadas por el motor propio, por id de tarea. */
function barrasPintadas(wrapper) {
  return wrapper
    .findAll('[data-testid="gantt-bar"]')
    .map((barra) => barra.attributes('aria-label'))
}

/**
 * Arrastra la barra cuyo aria-label contiene `parte` y suelta dentro del
 * diagrama, desplazando el raton `delta` px a la derecha desde la agarre en
 * clientX 40. En jsdom la caja del panel mide cero: se fija para que el
 * punto de soltado caiga dentro.
 */
async function arrastrarBarra(wrapper, parte, delta) {
  wrapper
    .get('[data-testid="gantt-scroll"]')
    .element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 400 })
  const barra = wrapper
    .findAll('[data-testid="gantt-bar"]')
    .find((item) => item.attributes('aria-label').includes(parte))
  await barra.trigger('mousedown', { clientX: 40, clientY: 40 })
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 40 + delta / 2, clientY: 40 }))
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: 40 + delta, clientY: 40 }))
  await flushPromises()
  await flushPromises()
}

describe('GanttView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    expect(urls.filter((url) => url.includes('project_id=1')).length).toBeGreaterThan(0)
    expect(urls.length).toBeGreaterThan(1)
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

    const { wrapper } = await mountGantt()

    const barras = wrapper.findAll('[data-testid="gantt-bar"]')
    expect(barras).toHaveLength(3)

    const etiquetas = barras.map((barra) => barra.attributes('aria-label'))
    expect(etiquetas[0]).toContain('Programacion SCADA WinCC')
    expect(etiquetas[0]).toContain('Ana')
  })

  it('muestra la leyenda con las personas del diagrama', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    const leyenda = wrapper.get('[data-testid="gantt-legend"]')
    expect(leyenda.text()).toContain('Ana')
    expect(leyenda.text()).not.toContain('Jorge')
  })

  it('avisa de la tarea sin fechas, en singular', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    const aviso = wrapper.get('[data-testid="gantt-undated"]')
    expect(aviso.attributes('role')).toBe('status')
    expect(aviso.text()).toContain('1 tarea sin fechas no aparece en el diagrama.')
  })

  it('el aviso de tareas sin fechas usa el plural con dos', async () => {
    setupFetch({ ...feed, undated_task_ids: [11, 13] })

    const { wrapper } = await mountGantt()

    expect(wrapper.get('[data-testid="gantt-undated"]').text()).toContain(
      '2 tareas sin fechas no aparecen en el diagrama.',
    )
  })

  it('la barra lleva la clase de color de su persona, del feed', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    const barras = wrapper.findAll('[data-testid="gantt-bar"]')
    expect(barras[0].classes().join(' ')).toContain('persona-0')
    expect(barras[1].classes().join(' ')).toContain('persona-0')
    expect(barras[2].classes().join(' ')).toContain('persona-1')
  })

  it('sombra el festivo global y lo marca en la celda de semana', async () => {
    setupFetch(feed, [
      {
        id: 1,
        date: '2026-11-06',
        name: 'Fiestas',
        scope: 'global',
        department_id: null,
        department_name: null,
        user_id: null,
        user_name: null,
        half_day: false,
      },
    ])

    const { wrapper } = await mountGantt()

    // El 6 de noviembre de 2026 cae en la semana 2026-W45 (9 a 15 nov).
    const celda = wrapper.get('[data-testid="gantt-axis-column-2026-W45"]')
    expect(celda.text()).toContain('Fiestas')

    // La banda ambar del dia no laborable llega al SVG.
    const bandas = wrapper.findAll('.gantt__bandas rect')
    expect(bandas.length).toBeGreaterThan(0)
    expect(bandas.some((recta) => recta.attributes('fill') === '#fffbeb')).toBe(true)
  })

  it('un festivo de alcance de persona no se pinta en el diagrama', async () => {
    setupFetch(feed, [
      {
        id: 1,
        date: '2026-11-06',
        name: 'Fiestas',
        scope: 'person',
        department_id: null,
        department_name: null,
        user_id: 1,
        user_name: 'Ana',
        half_day: false,
      },
    ])

    const { wrapper } = await mountGantt()

    const celda = wrapper.get('[data-testid="gantt-axis-column-2026-W45"]')
    expect(celda.text()).not.toContain('Fiestas')
    const bandas = wrapper.findAll('.gantt__bandas rect')
    expect(bandas.every((recta) => recta.attributes('fill') !== '#fffbeb')).toBe(true)
  })

  it('dos personas con el mismo nombre no se fusionan en un grupo', async () => {
    const feedDosAnas = {
      ...feed,
      members: [
        { user_id: 1, name: 'Ana', css_class: 'persona-0' },
        { user_id: 2, name: 'Ana', css_class: 'persona-1' },
      ],
      tasks: [
        feed.tasks[0],
        { ...feed.tasks[1], assigned_to: 2, assigned_name: 'Ana', title: 'Planos de tuberias' },
      ],
    }
    setupFetch(feedDosAnas)

    const { wrapper } = await mountGantt({ group: 'persona' })

    const grupos = wrapper
      .findAll('[data-testid^="gantt-group-"]')
      .filter((el) => /^gantt-group-\d+$/.test(el.attributes('data-testid')))
    expect(grupos.length).toBe(2)
    expect(wrapper.get('[data-testid="gantt-names"]').text()).toContain('Ana')
  })

  it('en escala Semana el rango se amplia y la ultima celda llega al borde', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    // La primera celda no sale desplazada: su linea de rejilla esta en x 0.
    const ticks = wrapper.findAll('.gantt__rejilla line')
    expect(Number(ticks[0].attributes('x1'))).toBe(0)

    // El rango completo se amplia de lunes a domingo: la ultima celda de
    // semana llega exacta al ancho del SVG, sin hueco ni desborde.
    const PX_POR_DIA_SEMANA = 14
    const svg = wrapper.get('[data-testid="gantt-svg"]')
    const ancho = Number(svg.attributes('width'))
    const ultima = Number(ticks[ticks.length - 1].attributes('x1'))
    expect(ultima + 7 * PX_POR_DIA_SEMANA).toBe(ancho)
  })

  it('ofrece los botones de escala temporal', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    expect(wrapper.get('[data-testid="gantt-scale-Day"]').text()).toBe('Día')
    expect(wrapper.get('[data-testid="gantt-scale-Week"]').text()).toBe('Semana')
    expect(wrapper.get('[data-testid="gantt-scale-Month"]').text()).toBe('Mes')
  })

  it('cambia la escala del diagrama al pulsar el boton', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    const anchoSemana = Number(wrapper.get('[data-testid="gantt-svg"]').attributes('width'))

    await wrapper.get('[data-testid="gantt-scale-Month"]').trigger('click')
    await flushPromises()

    // El rango se amplía al mes completo (1 al 30 de noviembre): 30 dias a
    // 5 px, y sigue siendo mas compacto que la escala de semana.
    const svg = wrapper.get('[data-testid="gantt-svg"]')
    const anchoMes = Number(svg.attributes('width'))
    expect(anchoMes).toBe(30 * 5)
    expect(anchoMes).toBeLessThan(anchoSemana)
  })

  it('guarda las fechas cuando se mueve una barra', async () => {
    const calls = setupFetch()
    const { wrapper } = await mountGantt()

    // En jsdom la caja del panel mide cero: se fijo para que el punto de
    // soltado (102, 40) caiga dentro del diagrama.
    wrapper
      .get('[data-testid="gantt-scroll"]')
      .element.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 500,
        bottom: 400,
      })

    const barra = wrapper
      .findAll('[data-testid="gantt-bar"]')
      .find((item) => item.attributes('aria-label').includes('Programacion SCADA'))
    // El centro de la barra, lejos de las asas: en jsdom la caja mide cero,
    // asi que el punto sensible es el propio clientX.
    await barra.trigger('mousedown', { clientX: 40, clientY: 40 })

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 72, clientY: 40 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 102, clientY: 40 }))
    await flushPromises()
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(patch.url).toBe('/api/tasks/10')
    // Mover el cuerpo desplaza las dos fechas: la duracion se conserva.
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-09',
      end_date: '2026-11-15',
    })
    expect(wrapper.text()).toContain('Fechas actualizadas')
  })

  it('la flecha derecha mueve la barra un paso del eje con PATCH', async () => {
    const calls = setupFetch()
    const { wrapper } = await mountGantt()

    const barra = wrapper
      .findAll('[data-testid="gantt-bar"]')
      .find((item) => item.attributes('aria-label').includes('Programacion SCADA'))
    await barra.trigger('keydown', { key: 'ArrowRight' })
    await flushPromises()
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(patch.url).toBe('/api/tasks/10')
    // Escala Semana: un paso del eje es una semana, no un dia.
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-12',
      end_date: '2026-11-18',
    })
  })

  it('Mayus y la flecha derecha alarga el final sin mover el inicio', async () => {
    const calls = setupFetch()
    const { wrapper } = await mountGantt()

    const barra = wrapper
      .findAll('[data-testid="gantt-bar"]')
      .find((item) => item.attributes('aria-label').includes('Programacion SCADA'))
    await barra.trigger('keydown', { key: 'ArrowRight', shiftKey: true })
    await flushPromises()
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-05',
      end_date: '2026-11-18',
    })
  })

  it('agrupar por proyecto ordena las barras por proyecto', async () => {
    setupFetch()

    const { wrapper } = await mountGantt({ group: 'proyecto' })

    const etiquetas = barrasPintadas(wrapper)
    expect(etiquetas[0]).toContain('Programacion SCADA WinCC')
    expect(etiquetas[1]).toContain('Montajes')
    expect(etiquetas[2]).toContain('Planos de tuberias')

    const nombres = wrapper.get('[data-testid="gantt-names"]').text()
    expect(nombres).toContain('Linea Pasteurizadora SIVE')
    expect(nombres).toContain('Red de tuberias')
  })

  it('agrupar por departamento cambia el encabezado de las barras', async () => {
    setupFetch()

    const { wrapper } = await mountGantt({ group: 'departamento' })

    const nombres = wrapper.get('[data-testid="gantt-names"]').text()
    expect(nombres.indexOf('Alimentacion')).toBeLessThan(nombres.indexOf('Energia'))
    const etiquetas = barrasPintadas(wrapper)
    expect(etiquetas[2]).toContain('Planos de tuberias')
  })

  it('agrupar por persona agrupa por persona', async () => {
    setupFetch()

    const { wrapper } = await mountGantt({ group: 'persona' })

    const nombres = wrapper.get('[data-testid="gantt-names"]').text()
    expect(nombres.indexOf('Ana')).toBeLessThan(nombres.indexOf('Jorge'))
    const etiquetas = barrasPintadas(wrapper)
    expect(etiquetas[0]).toContain('Programacion SCADA WinCC')
    expect(etiquetas[2]).toContain('Planos de tuberias')
  })

  it('pinta una cabecera de grupo por grupo y sin agrupar no pinta ninguna', async () => {
    setupFetch()

    const { wrapper, router } = await mountGantt({ group: 'departamento' })

    // El selector `gantt-group-by` de los filtros no cuenta: solo los de fila.
    const filasGrupo = (w) =>
      w
        .findAll('[data-testid^="gantt-group-"]')
        .filter((el) => /^gantt-group-\d+$/.test(el.attributes('data-testid')))

    expect(filasGrupo(wrapper).length).toBe(2)

    await router.replace({ path: '/gantt', query: { group: 'sin' } })
    await flushPromises()
    await flushPromises()
    expect(filasGrupo(wrapper).length).toBe(0)
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
    const etiquetas = barrasPintadas(wrapper)
    expect(etiquetas).toHaveLength(2)
    expect(etiquetas[0]).toContain('Planos de tuberias')
    expect(etiquetas[1]).toContain('Puesta en marcha')

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
    const etiquetas = barrasPintadas(wrapper)
    expect(etiquetas).toHaveLength(2)
    expect(etiquetas[0]).toContain('Planos de tuberias')

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

    expect(wrapper.findAll('[data-testid="gantt-bar"]')).toHaveLength(4)

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

  it('un clic simple en la barra abre el detalle de la tarea', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    const barra = wrapper
      .findAll('[data-testid="gantt-bar"]')
      .find((item) => item.attributes('aria-label').includes('Programacion SCADA'))
    await barra.trigger('click')
    await flushPromises()
    await flushPromises()

    expect(wrapper.find('[data-testid="task-panel"]').exists()).toBe(true)
  })

  it('doble clic en el hueco abre el alta con el dia y la persona de la fila', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()
    // En jsdom la caja del SVG mide cero: se fijo para apuntar con el raton.
    // El rango del feed abre en 2026-11-02 (lunes) a 14 px/dia: x 56 es el
    // 2026-11-06 (jueves). La fila 2 es la tarea de Ana.
    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 400 })
    await svg.trigger('dblclick', { clientX: 56, clientY: 130 })
    await flushPromises()

    expect(wrapper.find('[data-testid="task-panel"]').exists()).toBe(false)
    const titulo = wrapper.find('input[placeholder="Programación SCADA WinCC"]')
    expect(titulo.exists()).toBe(true)
    expect(titulo.element.value).toBe('')
    expect(wrapper.find('input[type="date"]').element.value).toBe('2026-11-06')
    // El primer select del documento es el filtro de departamento: el de la
    // asignacion es el del formulario del dialogo.
    const asignado = wrapper.find('form#gantt-task-form select')
    expect(asignado.element.value).toBe('1')
  })

  it('doble clic en domingo precarga la semana laborable completa', async () => {
    setupFetch()

    const { wrapper } = await mountGantt()

    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 400 })
    // x 70 es el dia 5 del rango (2026-11-02 + 5 = 2026-11-07, domingo).
    await svg.trigger('dblclick', { clientX: 70, clientY: 130 })
    await flushPromises()

    const fechas = wrapper.findAll('input[type="date"]')
    expect(fechas[0].element.value).toBe('2026-11-02')
    expect(fechas[1].element.value).toBe('2026-11-06')
  })

  it('guardar el alta manda el payload al proyecto de la fila y recarga', async () => {
    const calls = setupFetch()

    const { wrapper } = await mountGantt()

    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 400 })
    await svg.trigger('dblclick', { clientX: 56, clientY: 130 })
    await flushPromises()

    await wrapper.find('input[placeholder="Programación SCADA WinCC"]').setValue('Tarea nueva')
    // El formulario exige horas numericas: las del seed quedan en blanco.
    await wrapper.find('input[type="number"]').setValue('8')
    await wrapper.find('form#gantt-task-form').trigger('submit')
    await flushPromises()
    await flushPromises()

    const crear = calls.find((c) => c.method === 'POST' && c.url === '/api/projects/1/tasks')
    expect(crear).toBeDefined()
    expect(JSON.parse(crear.body)).toEqual({
      title: 'Tarea nueva',
      assigned_to: 1,
      start_date: '2026-11-06',
      end_date: '2026-11-06',
      estimated_hours: '8.00',
    })
    expect(wrapper.text()).toContain('Tarea creada: Tarea nueva.')
    expect(wrapper.find('form#gantt-task-form').exists()).toBe(false)
  })

  it('sin proyecto en contexto el doble clic no abre nada y el subtitulo lo dice', async () => {
    setupFetch()

    const { wrapper } = await mountGantt({ group: 'persona' })

    expect(wrapper.find('header').text()).toContain('Para crear una tarea, elige un proyecto.')

    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 400 })
    await svg.trigger('dblclick', { clientX: 56, clientY: 130 })
    await flushPromises()

    expect(wrapper.find('form#gantt-task-form').exists()).toBe(false)
  })

  it('sin permiso de escritura el doble clic no abre nada', async () => {
    const calls = setupFetch(feed, [], [])

    const { wrapper } = await mountGantt()

    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 400 })
    await svg.trigger('dblclick', { clientX: 56, clientY: 130 })
    await flushPromises()

    expect(wrapper.find('form#gantt-task-form').exists()).toBe(false)
    expect(calls.some((c) => c.url.includes('/members'))).toBe(false)
  })

  it('los miembros se piden una vez por proyecto, no por cada alta', async () => {
    const calls = setupFetch()

    const { wrapper } = await mountGantt()

    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 400 })

    // Dos altas en la misma fila: el proyecto es el mismo y los miembros
    // no se vuelven a pedir.
    await svg.trigger('dblclick', { clientX: 56, clientY: 130 })
    await flushPromises()
    await wrapper.get('[data-testid="modal-close"]').trigger('click')
    await flushPromises()
    await svg.trigger('dblclick', { clientX: 56, clientY: 130 })
    await flushPromises()

    const miembros = calls.filter((c) => c.url === '/api/projects/1/members')
    expect(miembros).toHaveLength(1)
  })

  it('soltar una barra que arrastra otras abre la cascada y no guarda nada', async () => {
    const calls = setupFetch(feed, [], [1, 2], {
      moves: [
        { task_id: 11, start_date: '2026-11-13', end_date: '2026-11-16' },
        { task_id: 12, start_date: '2026-11-07', end_date: '2026-11-10' },
      ],
    })
    const { wrapper } = await mountGantt()

    await arrastrarBarra(wrapper, 'Programacion SCADA', 62)

    // El dialogo lista las tareas arrastradas con sus fechas nuevas.
    expect(wrapper.get('[data-testid="cascada-move-11"]').text()).toContain('2026-11-13')
    expect(wrapper.get('[data-testid="cascada-move-11"]').text()).toContain('2026-11-16')
    expect(wrapper.get('[data-testid="cascada-move-12"]').text()).toContain('2026-11-07')
    expect(wrapper.get('[data-testid="cascada-solo-esta"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="cascada-aceptar"]').exists()).toBe(true)
    // Nada se guarda hasta que se decide: ni la arrastrada ni las propuestas.
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('Aceptar guarda la arrastrada y cada tarea propuesta, con sus fechas', async () => {
    const calls = setupFetch(feed, [], [1, 2], {
      moves: [
        { task_id: 11, start_date: '2026-11-13', end_date: '2026-11-16' },
        { task_id: 12, start_date: '2026-11-07', end_date: '2026-11-10' },
      ],
    })
    const { wrapper } = await mountGantt()

    await arrastrarBarra(wrapper, 'Programacion SCADA', 62)
    await wrapper.get('[data-testid="cascada-aceptar"]').trigger('click')
    await flushPromises()
    await flushPromises()

    const patches = calls.filter((c) => c.method === 'PATCH')
    expect(patches).toHaveLength(3)
    // La arrastrada, con el rango al que llego el gesto.
    expect(patches.find((c) => c.url === '/api/tasks/10')).toBeDefined()
    expect(JSON.parse(calls.find((c) => c.url === '/api/tasks/10').body)).toEqual({
      start_date: '2026-11-09',
      end_date: '2026-11-15',
    })
    // Cada propuesta, con las fechas que trajo la cascada.
    expect(JSON.parse(calls.find((c) => c.url === '/api/tasks/11').body)).toEqual({
      start_date: '2026-11-13',
      end_date: '2026-11-16',
    })
    expect(JSON.parse(calls.find((c) => c.url === '/api/tasks/12').body)).toEqual({
      start_date: '2026-11-07',
      end_date: '2026-11-10',
    })
    expect(wrapper.text()).toContain('Fechas actualizadas')
  })

  it('Solo esta guarda la arrastrada y se queda sin las propuestas', async () => {
    const calls = setupFetch(feed, [], [1, 2], {
      moves: [{ task_id: 11, start_date: '2026-11-13', end_date: '2026-11-16' }],
    })
    const { wrapper } = await mountGantt()

    await arrastrarBarra(wrapper, 'Programacion SCADA', 62)
    await wrapper.get('[data-testid="cascada-solo-esta"]').trigger('click')
    await flushPromises()
    await flushPromises()

    const patches = calls.filter((c) => c.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(patches[0].url).toBe('/api/tasks/10')
    expect(JSON.parse(patches[0].body)).toEqual({
      start_date: '2026-11-09',
      end_date: '2026-11-15',
    })
    expect(wrapper.text()).toContain('Fechas actualizadas')
  })

  it('soltar sin cascada guarda la arrastrada sin abrir dialogo', async () => {
    const calls = setupFetch()

    const { wrapper } = await mountGantt()

    await arrastrarBarra(wrapper, 'Programacion SCADA', 62)

    // Sin movimientos propuestos no hay dialogo y el PATCH va directo.
    expect(wrapper.find('[data-testid="cascada-moves"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="cascada-aceptar"]').exists()).toBe(false)
    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch.url).toBe('/api/tasks/10')
    expect(JSON.parse(patch.body)).toEqual({
      start_date: '2026-11-09',
      end_date: '2026-11-15',
    })
    expect(wrapper.text()).toContain('Fechas actualizadas')
  })

  it('si la consulta de cascada falla se guarda la arrastrada de todos modos', async () => {
    setupFetch(feed, [], [1, 2], null, false)

    const { wrapper } = await mountGantt()

    await arrastrarBarra(wrapper, 'Programacion SCADA', 62)

    expect(wrapper.text()).toContain('Fechas actualizadas')
    expect(wrapper.find('[data-testid="cascada-aceptar"]').exists()).toBe(false)
  })
})
