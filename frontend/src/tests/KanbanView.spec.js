import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import KanbanView from '../views/KanbanView.vue'

const board = {
  columns: [
    {
      status: 'backlog',
      tasks: [
        {
          id: 1,
          title: 'Esquemas EPLAN',
          status: 'backlog',
          assigned_to: 1,
          assigned_name: 'Ana',
          estimated_hours: 10,
          start_date: '2026-11-02',
          end_date: '2026-11-04',
        },
      ],
    },
    {
      status: 'in_progress',
      tasks: [
        {
          id: 2,
          title: 'Programacion SCADA',
          status: 'in_progress',
          assigned_to: 2,
          assigned_name: 'Sebastian',
          estimated_hours: 40,
          start_date: '2026-11-05',
          end_date: '2026-11-11',
        },
      ],
    },
    { status: 'testing', tasks: [] },
    { status: 'done', tasks: [] },
  ],
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
    if (url.includes('/kanban')) {
      // Copia nueva en cada llamada: la vista mueve las tarjetas al instante
      // y no debe tocar los datos del test.
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(board)) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  })
  return calls
}

async function mountKanban() {
  const wrapper = mount(KanbanView, {
    props: { id: 1 },
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

/** Coloca cada columna en un sitio fijo para poder apuntar con el raton. */
function stubColumns(wrapper) {
  wrapper.findAll('section').forEach((section, index) => {
    section.element.getBoundingClientRect = () => ({
      left: index * 100,
      right: index * 100 + 100,
      top: 0,
      bottom: 200,
    })
  })
}

describe('KanbanView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('pide el tablero al endpoint del proyecto', async () => {
    const calls = setupFetch()

    await mountKanban()

    const call = calls.find((c) => c.url.includes('/kanban'))
    expect(call).toBeDefined()
    expect(call.url).toBe('/api/projects/1/kanban')
  })

  it('dibuja las cuatro columnas con su etiqueta y su contador', async () => {
    setupFetch()

    const wrapper = await mountKanban()

    const cabeceras = wrapper
      .findAll('section h2')
      .map((h) => h.text().replace(/\s+/g, ' ').trim())
    expect(cabeceras).toEqual([
      'Backlog 1',
      'En Desarrollo 1',
      'Pruebas (FAT/SAT) 0',
      'Completado 0',
    ])
  })

  it('la tarjeta muestra titulo, persona, horas y fechas', async () => {
    setupFetch()

    const wrapper = await mountKanban()

    const texto = wrapper.text()
    expect(texto).toContain('Esquemas EPLAN')
    expect(texto).toContain('Ana')
    expect(texto).toContain('10 h')
    expect(texto).toContain('2026-11-02')
  })

  it('cambiar el estado en el desplegable guarda la tarea', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()

    const select = wrapper.findAll('select')[0]
    await select.setValue('done')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(patch.url).toBe('/api/tasks/1')
    expect(JSON.parse(patch.body)).toEqual({ status: 'done' })
  })

  it('arrastrar una tarjeta a otra columna guarda el estado', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()
    stubColumns(wrapper)

    const tarjeta = wrapper.findAll('article')[0]
    await tarjeta.trigger('mousedown', { clientX: 10, clientY: 10 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 10 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 250, clientY: 10 }))
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(patch.url).toBe('/api/tasks/1')
    // x=250 cae en la tercera columna.
    expect(JSON.parse(patch.body)).toEqual({ status: 'testing' })
  })

  it('soltar la tarjeta en su propia columna no guarda nada', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()
    stubColumns(wrapper)

    const tarjeta = wrapper.findAll('article')[0]
    await tarjeta.trigger('mousedown', { clientX: 10, clientY: 10 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 10 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 10 }))
    await flushPromises()

    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined()
  })
})
