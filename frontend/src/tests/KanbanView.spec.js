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

/**
 * Monta el tablero.
 *
 * `editable` son los proyectos en los que quien entra puede escribir: el
 * tablero se ve en solo lectura si el proyecto no esta entre ellos.
 */
function setupFetch({ editable = [1], failPatch = false } = {}) {
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
    if (url.endsWith('/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: 9, name: 'Admin' },
          role_label: 'Tecnico',
          is_manager: false,
          visible_project_ids: [1],
          editable_project_ids: editable,
        }),
      }
    }
    if (url.includes('/kanban')) {
      // Copia nueva en cada llamada: la vista mueve las tarjetas al instante
      // y no debe tocar los datos del test.
      return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(board)) }
    }
    if (options.method === 'PATCH' && failPatch) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ detail: 'No se pudo guardar' }),
      }
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

  it('el arrastre cancela la seleccion de texto del navegador', async () => {
    setupFetch()
    const wrapper = await mountKanban()

    // El navegador solo selecciona texto si el mousedown no llega cancelado.
    const evento = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    wrapper.findAll('article')[0].element.dispatchEvent(evento)

    expect(evento.defaultPrevented).toBe(true)
  })

  it('la tarjeta no deja seleccionar su texto', async () => {
    setupFetch()
    const wrapper = await mountKanban()

    expect(wrapper.findAll('article')[0].classes()).toContain('select-none')
  })

  it('mientras se arrastra, una copia de la tarjeta sigue al cursor', async () => {
    setupFetch()
    const wrapper = await mountKanban()
    stubColumns(wrapper)

    expect(wrapper.find('[data-testid="kanban-drag-ghost"]').exists()).toBe(false)

    const tarjeta = wrapper.findAll('article')[0]
    await tarjeta.trigger('mousedown', { clientX: 0, clientY: 0 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 120 }))
    await flushPromises()

    const copia = wrapper.find('[data-testid="kanban-drag-ghost"]')
    expect(copia.exists()).toBe(true)
    expect(copia.text()).toContain('Esquemas EPLAN')
    expect(copia.text()).toContain('Ana')
    expect(copia.text()).toContain('10 h')
    expect(copia.attributes('style')).toContain('left: 250px')
    expect(copia.attributes('style')).toContain('top: 120px')

    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 250, clientY: 120 }))
    await flushPromises()

    // Al soltar, la copia se va: solo existe mientras dura el gesto.
    expect(wrapper.find('[data-testid="kanban-drag-ghost"]').exists()).toBe(false)
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

  it('sin permiso de escritura el desplegable esta deshabilitado', async () => {
    setupFetch({ editable: [] })
    const wrapper = await mountKanban()

    const select = wrapper.findAll('select')[0]
    expect(select.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Solo lectura')
  })

  it('con permiso de escritura el subtitulo ofrece el arrastre', async () => {
    setupFetch()
    const wrapper = await mountKanban()

    expect(wrapper.text()).toContain('Arrastra una tarjeta a otra columna')
    expect(wrapper.text()).not.toContain('Solo lectura')
  })

  it('sin permiso de escritura la tarjeta no se puede arrastrar', async () => {
    const calls = setupFetch({ editable: [] })
    const wrapper = await mountKanban()
    stubColumns(wrapper)

    const tarjeta = wrapper.findAll('article')[0]
    await tarjeta.trigger('mousedown', { clientX: 10, clientY: 10 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 10 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 250, clientY: 10 }))
    await flushPromises()

    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined()
  })

  it('sin permiso de escritura el cambio de estado no sale al servidor', async () => {
    const calls = setupFetch({ editable: [] })
    const wrapper = await mountKanban()

    // El desplegable esta deshabilitado, de modo que el cambio no se dispara
    // y no sale nada al servidor.
    const select = wrapper.findAll('select')[0]
    expect(select.attributes('disabled')).toBeDefined()

    await select.setValue('done')
    await flushPromises()

    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined()
  })

  it('si el servidor rechaza el cambio, el aviso se ve', async () => {
    setupFetch({ failPatch: true })
    const wrapper = await mountKanban()

    await wrapper.findAll('select')[0].setValue('done')
    await flushPromises()

    // El aviso no lo tapa la recarga que viene despues del intento.
    const aviso = wrapper.find('[data-testid="kanban-warning"]')
    expect(aviso.exists()).toBe(true)
    expect(aviso.text()).toContain('No se ha podido mover la tarea')
    expect(aviso.text()).toContain('No se pudo guardar')
  })
})
