import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import CellBreakdown from '../components/CellBreakdown.vue'

const members = [
  { user_id: 1, name: 'Ana', project_ids: [1, 2] },
  { user_id: 2, name: 'Sebastian', project_ids: [1, 2] },
]

const projects = [
  { id: 1, name: 'Linea Pasteurizadora SIVE', is_provisional: false },
  { id: 2, name: 'Ampliacion linea 2', is_provisional: true },
]

function tarea(id, project_id) {
  return {
    id,
    project_id,
    assigned_to: 2,
    title: `Tarea ${id}`,
    status: 'todo',
    start_date: '2026-11-09',
    end_date: '2026-11-11',
    estimated_hours: 12,
    week_hours: 12,
  }
}

function celda({ hours, capacity }) {
  return { user_id: 2, week: '2026-W46', hours, capacity }
}

async function mountBreakdown(cell, tasks = []) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/gantt', name: 'gantt', component: { template: '<div />' } }],
  })
  await router.push('/gantt')
  await router.isReady()
  const wrapper = mount(CellBreakdown, {
    props: { cell, tasks, members, projects },
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

describe('CellBreakdown', () => {
  it('la capacidad libre sale de loadFree: capacidad menos horas de la celda', async () => {
    const wrapper = await mountBreakdown(celda({ hours: 10, capacity: 40 }))

    expect(wrapper.get('[data-testid="cell-free"]').text()).toContain('libre 30 h')
  })

  it('si la carga pasa de la capacidad, las libres salen negativas', async () => {
    const wrapper = await mountBreakdown(celda({ hours: 48, capacity: 40 }))

    expect(wrapper.get('[data-testid="cell-free"]').text()).toContain('libre -8 h')
  })

  it('sin capacidad conocida no hay horas libres que ensenar', async () => {
    const wrapper = await mountBreakdown(celda({ hours: 48, capacity: null }))

    expect(wrapper.find('[data-testid="cell-free"]').exists()).toBe(false)
  })

  it('la semana libre propone asignar hasta las horas libres sin sobrecargar', async () => {
    const wrapper = await mountBreakdown(celda({ hours: 0, capacity: 40 }))

    expect(wrapper.text()).toContain('Puedes asignar hasta 40 h a esta persona sin sobrecargarla.')
  })

  it('con horas registradas salen el registro, el plan y la diferencia', async () => {
    const wrapper = await mountBreakdown({
      ...celda({ hours: 12, capacity: 40 }),
      hours_actual: '6.50',
    })

    const real = wrapper.get('[data-testid="cell-real"]').text()
    expect(real).toContain('registrado 6.50 h')
    expect(real).toContain('plan 12 h')
    // 6.5 - 12 = -5.5: la diferencia sale con su signo.
    expect(real).toContain('-5.5 h')
  })

  it('si se registro mas que el plan, la diferencia sale positiva', async () => {
    const wrapper = await mountBreakdown({
      ...celda({ hours: 12, capacity: 40 }),
      hours_actual: 14,
    })

    expect(wrapper.get('[data-testid="cell-real"]').text()).toContain('+2 h')
  })

  it('sin horas registradas dice sin imputar y no un cero', async () => {
    const wrapper = await mountBreakdown({
      ...celda({ hours: 12, capacity: 40 }),
      hours_actual: null,
    })

    expect(wrapper.get('[data-testid="cell-real"]').text()).toBe('sin imputar')
    expect(wrapper.text()).not.toContain('registrado 0')
  })

  it('las tareas de un proyecto provisional van de contorno con su nota', async () => {
    const wrapper = await mountBreakdown(celda({ hours: 24, capacity: 40 }), [
      tarea(10, 1),
      tarea(11, 2),
    ])

    const items = wrapper.findAll('[data-testid="breakdown-task"]')
    expect(items).toHaveLength(2)
    // La del proyecto 1 es firme: borde solido.
    expect(items[0].classes().join(' ')).not.toContain('border-dashed')
    // La del proyecto 2 va punteada y con la nota junto al nombre.
    expect(items[1].classes().join(' ')).toContain('border-dashed')
    expect(items[1].classes().join(' ')).toContain('border-borde-fuerte')
    expect(items[1].text()).toContain('Ampliacion linea 2 (provisional)')
  })
})

describe('veredicto de politica de capacidad', () => {
  const policy = {
    scope_type: 'persona',
    scope_id: 2,
    warn_percent: 80,
    requires_approval_percent: 100,
    active: true,
  }

  it('un veredicto de aviso explica el umbral superado y su consecuencia', async () => {
    const wrapper = await mountBreakdown({
      ...celda({ hours: 36, capacity: 40 }),
      policy_verdict: 'aviso',
      policy,
    })

    const linea = wrapper.get('[data-testid="cell-policy-line"]')
    expect(linea.text()).toContain('80 %')
    expect(linea.text()).toContain('40 h')
    expect(linea.text()).toContain('avisa al jefe de departamento')
    // Ambar, para distinguirlo de la aprobacion sin depender del texto.
    expect(linea.classes().join(' ')).toContain('text-aviso-texto')
  })

  it('un veredicto de aprobacion explica el umbral y que hay que aprobar', async () => {
    const wrapper = await mountBreakdown({
      ...celda({ hours: 48, capacity: 40 }),
      policy_verdict: 'aprobacion',
      policy,
    })

    const linea = wrapper.get('[data-testid="cell-policy-line"]')
    expect(linea.text()).toContain('100 %')
    expect(linea.text()).toContain('requiere aprobacion')
    expect(linea.classes().join(' ')).toContain('text-peligro-texto')
  })

  it('sin politica no hay linea de veredicto', async () => {
    const wrapper = await mountBreakdown(celda({ hours: 48, capacity: 40 }))

    expect(wrapper.find('[data-testid="cell-policy-line"]').exists()).toBe(false)
  })

  it('con politica pero sin umbral superado no hay linea de veredicto', async () => {
    const wrapper = await mountBreakdown({
      ...celda({ hours: 20, capacity: 40 }),
      policy_verdict: null,
      policy,
    })

    expect(wrapper.find('[data-testid="cell-policy-line"]').exists()).toBe(false)
  })
})
