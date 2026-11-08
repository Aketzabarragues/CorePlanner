import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import ActivityView from '../views/ActivityView.vue'

const AHORA = new Date(2026, 10, 8, 19, 30)

function haceMinutos(minutos) {
  return new Date(AHORA.getTime() - minutos * 60 * 1000).toISOString()
}

const entradas = {
  items: [
    {
      id: 2,
      actor_id: 3,
      actor_name: 'Ana Ruiz',
      action: 'task.moved',
      entity_type: 'task',
      entity_id: 7,
      project_id: 1,
      project_name: 'Linea Pasteurizadora SIVE',
      payload: {
        title: 'Cableado de campo',
        from: 'backlog',
        to: 'in_progress',
        changes: {},
      },
      created_at: haceMinutos(10),
    },
    {
      id: 1,
      actor_id: 3,
      actor_name: 'Ana Ruiz',
      action: 'task.created',
      entity_type: 'task',
      entity_id: 8,
      project_id: 1,
      project_name: 'Linea Pasteurizadora SIVE',
      payload: { title: 'Puesta en marcha', assigned_to: 3, estimated_hours: 12 },
      created_at: haceMinutos(120),
    },
  ],
  total: 2,
  limit: 50,
  offset: 0,
}

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch({ payload = entradas, error = false } = {}) {
  const calls = []
  global.fetch = vi.fn(async (url) => {
    calls.push({ url })
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.includes('/activity')) {
      if (error) return jsonResponse({ detail: 'fallo' }, false, 500)
      return jsonResponse(payload)
    }
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
  return calls
}

/**
 * Monta la bitacora.
 *
 * El proyecto es un filtro que vive en la URL, de modo que la vista se monta
 * siempre en la misma ruta y lo que cambia es la consulta.
 */
async function mountView(query = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/activity', name: 'activity', component: { template: '<div />' } }],
  })
  await router.push({ path: '/activity', query })
  await router.isReady()

  const wrapper = mount(ActivityView, {
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  await flushPromises()
  return { wrapper, router }
}

describe('ActivityView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(AHORA)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lista las entradas de la bitacora', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.findAll('[data-testid="activity-entry"]')).toHaveLength(2)
  })

  it('muestra quien, que ha hecho y sobre que', async () => {
    const { wrapper } = await mountView()

    const entrada = wrapper.findAll('[data-testid="activity-entry"]')[0]
    expect(entrada.text()).toContain('Ana Ruiz')
    expect(entrada.text()).toContain('movió «Cableado de campo»')
    expect(entrada.text()).toContain('En Desarrollo')
  })

  it('el tiempo va en relativo y la fecha completa en el title', async () => {
    const { wrapper } = await mountView()

    const tiempos = wrapper.findAll('[data-testid="activity-time"]')
    expect(tiempos[0].text()).toBe('hace 10 min')
    expect(tiempos[0].attributes('title')).toBe('08/11/2026 19:20')
  })

  it('el filtro de proyecto va en la peticion', async () => {
    const calls = setupFetch()

    await mountView({ project: '1' })

    const llamada = calls.find((call) => call.url.includes('/activity'))
    expect(llamada.url).toContain('project_id=1')
  })

  it('sin filtro no se pide ningun proyecto', async () => {
    const calls = setupFetch()

    await mountView()

    const llamada = calls.find((call) => call.url.includes('/activity'))
    expect(llamada.url).not.toContain('project_id')
  })

  it('con filtro no se repite el proyecto de cada entrada', async () => {
    const { wrapper } = await mountView({ project: '1' })

    expect(wrapper.text()).not.toContain('Linea Pasteurizadora SIVE')
  })

  it('sin filtro se ve el proyecto de cada entrada', async () => {
    const { wrapper } = await mountView()

    expect(wrapper.text()).toContain('Linea Pasteurizadora SIVE')
  })

  it('sin entradas sale el aviso de que no hay nada', async () => {
    setupFetch({ payload: { items: [], total: 0, limit: 50, offset: 0 } })

    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="activity-empty"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="activity-list"]').exists()).toBe(false)
  })

  it('el error se muestra y se puede reintentar', async () => {
    setupFetch({ error: true })

    const { wrapper } = await mountView()

    expect(wrapper.find('[data-testid="activity-error"]').exists()).toBe(true)
  })

  it('el boton de ver mas pide la pagina siguiente', async () => {
    // La primera pagina trae las 50 entradas del limite: hay mas de las que
    // se ven, asi que el boton aparece.
    const muchas = Array.from({ length: 50 }, (_, index) => ({
      ...entradas.items[0],
      id: index + 1,
    }))
    const calls = setupFetch({ payload: { ...entradas, items: muchas, total: 120 } })

    const { wrapper } = await mountView()
    await wrapper.find('[data-testid="activity-more"]').trigger('click')
    await flushPromises()

    const llamadas = calls.filter((call) => call.url.includes('/activity'))
    expect(llamadas).toHaveLength(2)
    expect(llamadas[1].url).toContain('offset=50')
  })
})
