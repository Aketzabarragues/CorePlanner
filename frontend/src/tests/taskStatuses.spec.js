import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useTaskStatusesStore } from '../stores/taskStatuses'

function estado(id, clave, etiqueta) {
  return {
    id,
    project_id: 7,
    key: clave,
    label: etiqueta,
    color: '#1f6feb',
    progress: 50,
    order_index: id,
    task_count: 0,
  }
}

function mapaDeDemo() {
  return {
    '7': [estado(1, 'backlog', 'Backlog'), estado(2, 'done', 'Completado')],
    '8': [],
  }
}

describe('tienda de estados de tarea', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loadAll guarda los estados de los proyectos con las claves en texto', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mapaDeDemo(),
    }))

    const store = useTaskStatusesStore()
    await store.loadAll('tkn')

    expect(store.statesOf(7).map((item) => item.key)).toEqual(['backlog', 'done'])
    expect(store.statesOf(8)).toEqual([])
    expect(store.statesOf(9)).toEqual([])
    expect(store.stateOf(7, 'done')?.label).toBe('Completado')
    expect(store.stateOf(7, 'no-existe')).toBeNull()
    expect(store.labelOf(7, 'backlog')).toBe('Backlog')
    expect(store.labelOf(7, 'no-existe')).toBe('no-existe')
  })

  it('loadProject no repite la peticion si el proyecto ya esta cargado', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mapaDeDemo(),
    }))

    const store = useTaskStatusesStore()
    await store.loadAll('tkn')
    await store.loadProject('tkn', 7)

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('loadProject pide solo el proyecto que falta', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [estado(1, 'backlog', 'Backlog')],
    }))

    const store = useTaskStatusesStore()
    await store.loadProject('tkn', 8)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe('/api/projects/8/task-statuses')
    expect(store.statesOf(8).map((item) => item.key)).toEqual(['backlog'])
  })

  it('reload vacia la lista del proyecto y vuelve a pedirla', async () => {
    global.fetch = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes('/projects/')
          ? [estado(1, 'backlog', 'Backlog'), estado(2, 'done', 'Completado')]
          : mapaDeDemo(),
    }))

    const store = useTaskStatusesStore()
    await store.loadAll('tkn')
    await store.reload('tkn', 7)

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(store.statesOf(7).map((item) => item.key)).toEqual(['backlog', 'done'])
  })
})
