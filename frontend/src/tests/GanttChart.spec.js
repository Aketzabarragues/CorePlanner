import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import GanttChart from '../components/gantt/GanttChart.vue'

const ESCALA = { id: 'Week', label: 'Semana', pxPerDay: 14, header: 'week' }

function barraNueva(taskId = 10) {
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
  }
}

/** Layout minimo de `buildLayout`, con la barra ya pegada a la fila. */
function layoutDe(barras = [barraNueva()]) {
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

  it('un doble clic emite abrir y el foco emite seleccionar', async () => {
    const wrapper = montar(layoutDe())

    await wrapper.get('[data-testid="gantt-bar"]').trigger('dblclick')
    expect(wrapper.emitted('abrir')).toEqual([[10]])

    await wrapper.get('[data-testid="gantt-bar"]').trigger('focus')
    expect(wrapper.emitted('seleccionar')).toEqual([[10]])
  })

  it('una tecla sube a la vista con el identificador de la barra', async () => {
    const wrapper = montar(layoutDe())

    await wrapper.get('[data-testid="gantt-bar"]').trigger('keydown', { key: 'ArrowRight' })

    const evento = wrapper.emitted('tecla')[0][0]
    expect(evento.key).toBe('ArrowRight')
    expect(wrapper.emitted('tecla')[0][1]).toBe(10)
  })
})
