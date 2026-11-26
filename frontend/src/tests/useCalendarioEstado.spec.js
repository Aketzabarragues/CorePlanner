import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useCalendarioEstado } from '../composables/useCalendarioEstado'

/**
 * Prueba del composable con un router de memoria: un componente minimo lo
 * usa en su setup y el test lo toma de la variable compartida. El reloj esta
 * fijado al viernes 6 de noviembre de 2026 (semana 2026-W45, mes 2026-11)
 * para que el resultado no dependa del dia en que se ejecuta.
 */
let estado = null

const Probe = {
  name: 'Probe',
  setup() {
    estado = useCalendarioEstado()
    return () => null
  },
}

async function montar(query = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/calendar', name: 'calendar', component: { template: '<div />' } }],
  })
  await router.push({ path: '/calendar', query })
  await router.isReady()

  mount(Probe, { global: { plugins: [router] } })
  estado.aplicarEstadoDeLaUrl()
  await flushPromises()
  return router
}

/** Consulta de la URL: solo los pares clave-valor. */
function consulta(router) {
  return { ...router.currentRoute.value.query }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date(2026, 10, 6))
})

afterEach(() => {
  estado = null
  vi.useRealTimers()
})

describe('useCalendarioEstado', () => {
  it('sin parametros se abre en la vista de mes, en el mes en curso, y no escribe nada en la URL', async () => {
    const router = await montar()

    expect(estado.view.value).toBe('month')
    expect(estado.month.value).toBe('2026-11')
    expect(estado.day.value).toBe('2026-11-06')
    expect(estado.week.value).toBe('2026-W45')
    expect(consulta(router)).toEqual({})
    await estado.escribirEstado()
    expect(consulta(router)).toEqual({})
  })

  it('?view=week&day=2026-11-09 abre la vista de semana de ese dia', async () => {
    const router = await montar({ view: 'week', day: '2026-11-09' })

    expect(estado.view.value).toBe('week')
    expect(estado.week.value).toBe('2026-W46')
    expect(estado.day.value).toBe('2026-11-09')
    expect(consulta(router)).toEqual({ view: 'week', day: '2026-11-09' })
  })

  it('?view=day&day=2026-11-09 abre la vista de dia en esa fecha', async () => {
    await montar({ view: 'day', day: '2026-11-09' })

    expect(estado.view.value).toBe('day')
    expect(estado.day.value).toBe('2026-11-09')
  })

  it('?month con formato invalido se ignora y se queda el mes en curso', async () => {
    await montar({ month: '2026-13' })

    expect(estado.month.value).toBe('2026-11')
    expect(estado.view.value).toBe('month')
  })

  it('step(1) en la vista de mes avanza un mes y escribe month', async () => {
    const router = await montar()

    await estado.step(1)
    expect(estado.month.value).toBe('2026-12')
    expect(consulta(router)).toEqual({ month: '2026-12' })
  })

  it('step(1) en la vista de dia avanza un dia y escribe day', async () => {
    const router = await montar({ view: 'day', day: '2026-11-09' })

    await estado.step(1)
    expect(estado.day.value).toBe('2026-11-10')
    expect(consulta(router)).toEqual({ view: 'day', day: '2026-11-10' })
  })

  it('step(1) en la vista de semana avanza una semana y escribe el lunes en day', async () => {
    const router = await montar({ view: 'week', day: '2026-11-09' })

    await estado.step(1)
    expect(estado.week.value).toBe('2026-W47')
    // El lunes de la 2026-W47 es el 16 de noviembre.
    expect(consulta(router)).toEqual({ view: 'week', day: '2026-11-16' })
  })

  it("setView('day') desde el mes coloca el dia en hoy y escribe solo view (hoy es el defecto)", async () => {
    const router = await montar()

    await estado.setView('day')
    expect(estado.view.value).toBe('day')
    expect(estado.day.value).toBe('2026-11-06')
    expect(consulta(router)).toEqual({ view: 'day' })
  })

  it("setView('month') desde la semana deja la vista por defecto y el mes de la semana", async () => {
    const router = await montar({ view: 'week', day: '2026-11-09' })

    await estado.setView('month')
    expect(estado.view.value).toBe('month')
    expect(estado.month.value).toBe('2026-11')
    // La vista de mes es el defecto: no se escribe en la URL.
    expect(consulta(router)).toEqual({})
  })

  it('goToday() vuelve a hoy y deja la URL sin fechas por defecto', async () => {
    const router = await montar({ view: 'week', day: '2026-11-09' })

    await estado.goToday()
    expect(estado.view.value).toBe('week')
    expect(estado.month.value).toBe('2026-11')
    expect(estado.week.value).toBe('2026-W45')
    expect(estado.day.value).toBe('2026-11-06')
    // La vista no cambia: solo la fecha vuelve a hoy, que no se escribe.
    expect(consulta(router)).toEqual({ view: 'week' })
  })

  it('el filtro de proyecto de la URL se conserva al cambiar de vista y de fecha', async () => {
    const router = await montar({ project: '1' })

    await estado.setView('day')
    expect(consulta(router)).toMatchObject({ project: '1', view: 'day' })

    await estado.step(1)
    expect(consulta(router)).toMatchObject({ project: '1', day: '2026-11-07' })
  })
})
