import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import GanttChart from '../components/gantt/GanttChart.vue'

const ESCALA = { id: 'Week', label: 'Semana', pxPerDay: 14, header: 'week' }

function barraNueva(taskId = 10, overrides = {}) {
  return {
    taskId,
    x: 42,
    width: 56,
    rowIndex: 0,
    label: 'Programacion SCADA WinCC',
    title: 'Programacion SCADA WinCC',
    color: 'persona-0',
    startIso: '2026-11-03',
    endIso: '2026-11-06',
    assignedName: 'Ana',
    progress: 0,
    projectName: 'Linea Pasteurizadora SIVE',
    ...overrides,
  }
}

/** Layout minimo de `buildLayout`, con la barra ya pegada a la fila. */
function layoutDe(barras = [barraNueva()], extras = {}) {
  const rows = barras.map((barra, index) => ({ type: 'bar', rowIndex: index, barra }))
  return {
    scale: ESCALA,
    pxPerDay: 14,
    start: '2026-11-01',
    end: '2026-11-14',
    days: 14,
    width: 196,
    axis: { days: 14, width: 196, cells: [], ticks: [{ x: 0, kind: 'week' }] },
    rows,
    bars: barras,
    shaded: [],
    todayIndex: null,
    dependencies: [],
    ...extras,
  }
}

function montar(layout, overrides = {}) {
  return mount(GanttChart, {
    props: {
      layout,
      columnas: [],
      filasNombres: layout.rows,
      editableDe: () => true,
      barraEnfocada: null,
      etiquetaDe: (taskId) => `Etiqueta de la ${taskId}`,
      descripcion: '3 tareas.',
      aviso: '',
      ...overrides,
    },
  })
}

describe('GanttChart', () => {
  it('pinta un gantt-bar por barra y el eje con sus celdas', () => {
    const wrapper = montar(layoutDe())

    expect(wrapper.get('[data-testid="gantt-chart"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="gantt-svg"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="gantt-axis"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="gantt-bar"]').exists()).toBe(true)

    const eje = wrapper.get('[data-testid="gantt-axis"]')
    expect(eje.attributes('aria-hidden')).toBe('true')
  })

  it('pinta una cabecera de grupo con su testid por fila', () => {
    const layout = layoutDe()
    layout.rows.unshift({ type: 'group', label: 'Alimentacion', rowIndex: 0 })
    const wrapper = montar(layout)

    expect(wrapper.get('[data-testid="gantt-group-0"]').attributes('aria-label')).toContain('Alimentacion')
  })

  it('la barra seleccionada lleva el tabindex y el resto no', () => {
    const wrapper = montar(layoutDe(), { barraEnfocada: 10 })

    expect(wrapper.get('[data-testid="gantt-bar"]').attributes('tabindex')).toBe('0')
  })

  it('sin permiso la barra va en solo lectura, sin asas', () => {
    const wrapper = montar(layoutDe(), {
      editableDe: () => false,
      etiquetaDe: () => 'Programacion SCADA WinCC. Solo lectura.',
    })

    const barra = wrapper.get('[data-testid="gantt-bar"]')
    expect(barra.attributes('aria-disabled')).toBe('true')
    expect(barra.attributes('tabindex')).toBe('-1')
    expect(barra.attributes('aria-label')).toBe('Programacion SCADA WinCC. Solo lectura.')
    expect(barra.classes()).toContain('gantt__barra--solo-lectura')
    expect(wrapper.find('[data-testid="gantt-handle-start"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gantt-handle-end"]').exists()).toBe(false)
  })

  it('con permiso la barra lleva las dos asas', () => {
    const wrapper = montar(layoutDe())

    expect(wrapper.get('[data-testid="gantt-handle-start"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="gantt-handle-end"]').exists()).toBe(true)
  })

  it('un clic emite abrir y el foco emite seleccionar', async () => {
    const wrapper = montar(layoutDe())

    await wrapper.get('[data-testid="gantt-bar"]').trigger('click')
    expect(wrapper.emitted('abrir')).toEqual([[10]])

    await wrapper.get('[data-testid="gantt-bar"]').trigger('focus')
    expect(wrapper.emitted('seleccionar')).toEqual([[10]])
  })

  it('un doble clic en el hueco emite crear con la fecha y la fila del punto', async () => {
    const layout = layoutDe()
    const wrapper = montar(layout)

    // En jsdom la caja del SVG mide cero: se fijo para apuntar con el raton.
    // x 30 a 14 px/dia es el dia 3 (2026-11-03); y 58, 10 px bajo la
    // cabecera de 48, cae en la fila 0.
    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 196, bottom: 84 })
    await svg.trigger('dblclick', { clientX: 30, clientY: 58 })

    const [payload] = wrapper.emitted('crear')[0]
    expect(payload.dateIso).toBe('2026-11-03')
    expect(payload.fila).toEqual(expect.objectContaining({ type: 'bar', rowIndex: 0 }))
  })

  it('un doble clic fuera del rango de filas no emite crear', async () => {
    const wrapper = montar(layoutDe())

    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 196, bottom: 84 })
    // y 40 esta dentro de la cabecera; y 1000, fuera del cuerpo.
    await svg.trigger('dblclick', { clientX: 30, clientY: 40 })
    await svg.trigger('dblclick', { clientX: 30, clientY: 1000 })

    expect(wrapper.emitted('crear')).toBeUndefined()
  })

  it('un doble clic sobre la barra no emite crear', async () => {
    const wrapper = montar(layoutDe())

    await wrapper.get('[data-testid="gantt-bar"]').trigger('dblclick')

    expect(wrapper.emitted('crear')).toBeUndefined()
  })

  it('el scroll del panel sube el contenido sin traslacion extra del cuerpo', async () => {
    const wrapper = montar(layoutDe())

    const panel = wrapper.get('[data-testid="gantt-scroll"]')
    panel.element.scrollTop = 40
    await panel.trigger('scroll')

    // El desplazamiento propagado es 40: el eje lo invierte y queda clavado
    // arriba.
    const eje = wrapper.get('.gantt__eje')
    expect(eje.attributes('transform')).toBe('translate(0, 40)')

    // El cuerpo ya sube con el scroll nativo: no lleva traslacion propia, ni
    // una negativa igual al desplazamiento, que lo subiria el doble de
    // rapido.
    const transformCuerpo = wrapper.get('.gantt__cuerpo').attributes('transform')
    expect([undefined, '', 'translate(0, 0)']).toContain(transformCuerpo)

    // La columna de nombres no esta dentro del panel: su pista replica el
    // desplazamiento una sola vez.
    const pista = wrapper.get('.gantt__nombres-pista')
    expect(pista.attributes('style')).toContain('translateY(-40px)')
  })

  it('una tecla sube a la vista con el identificador de la barra', async () => {
    const wrapper = montar(layoutDe())

    await wrapper.get('[data-testid="gantt-bar"]').trigger('keydown', { key: 'ArrowRight' })

    const evento = wrapper.emitted('tecla')[0][0]
    expect(evento.key).toBe('ArrowRight')
    expect(wrapper.emitted('tecla')[0][1]).toBe(10)
  })

  it('un vinculo precedes dibuja una flecha del fin del requisito al inicio de la dependiente', () => {
    const layout = layoutDe([barraNueva(10), barraNueva(12, { x: 126, rowIndex: 1 })], {
      dependencies: [{ task_id: 12, depends_on_id: 10, type: 'precedes' }],
    })
    const wrapper = montar(layout)

    const flecha = wrapper.get('[data-testid="gantt-dependency-10-12"]')
    // Fin de la barra 10: 42 + 56 = 98, centro de la fila 0: 18. Inicio de
    // la barra 12: 126, centro de la fila 1: 36 + 18 = 54. El quiebre cae en
    // el punto medio horizontal: (98 + 126) / 2 = 112.
    expect(flecha.attributes('points')).toBe('98,18 112,18 112,54 126,54')
    expect(flecha.attributes('marker-end')).toBe('url(#gantt-punta)')
    expect(flecha.attributes('stroke-dasharray')).toBeUndefined()
  })

  it('un vinculo en la misma fila dibuja la flecha horizontal', () => {
    const barras = [barraNueva(10), barraNueva(12, { x: 126, rowIndex: 0 })]
    const layout = layoutDe(barras, {
      dependencies: [{ task_id: 12, depends_on_id: 10, type: 'precedes' }],
      // Las dos barras pintan en la fila 0: la fila no lleva barra propia.
      rows: [{ type: 'bar', rowIndex: 0, barra: barras[0] }],
    })
    const wrapper = montar(layout)

    expect(wrapper.get('[data-testid="gantt-dependency-10-12"]').attributes('points')).toBe(
      '98,18 126,18',
    )
  })

  it('un vinculo relates se dibuja discontinuo y sin punta', () => {
    const layout = layoutDe([barraNueva(10), barraNueva(12, { x: 126 })], {
      dependencies: [{ task_id: 12, depends_on_id: 10, type: 'relates' }],
    })
    const wrapper = montar(layout)

    const flecha = wrapper.get('[data-testid="gantt-dependency-10-12"]')
    expect(flecha.attributes('stroke-dasharray')).toBe('5 4')
    expect(flecha.attributes('marker-end')).toBeUndefined()
  })

  it('un vinculo cuya otra tarea no esta visible no se dibuja', () => {
    const layout = layoutDe([barraNueva(10)], {
      // La dependiente (12) no tiene barra en el layout.
      dependencies: [{ task_id: 12, depends_on_id: 10, type: 'precedes' }],
    })
    const wrapper = montar(layout)

    expect(wrapper.find('[data-testid="gantt-dependency-10-12"]').exists()).toBe(false)
  })

  it('una barra que viola una dependencia lleva la marca y su aria-label lo dice', () => {
    const layout = layoutDe([
      barraNueva(10, { violates: true, title: 'Programacion SCADA WinCC' }),
      barraNueva(11),
    ])
    const wrapper = montar(layout, {
      etiquetaDe: (id) =>
        id === 10
          ? 'Programacion SCADA WinCC. Empieza antes de que termine Montajes.'
          : `Etiqueta de la ${id}`,
    })

    const barra = wrapper.get('[data-testid="gantt-bar"]')
    expect(barra.find('[data-testid="gantt-bar-violation"]').exists()).toBe(true)
    expect(barra.attributes('aria-label')).toContain(
      'Empieza antes de que termine Montajes.',
    )
    expect(
      wrapper.findAll('[data-testid="gantt-bar"]')[1].find('[data-testid="gantt-bar-violation"]')
        .exists(),
    ).toBe(false)
  })
})
