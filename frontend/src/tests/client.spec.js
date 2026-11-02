import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authApi, projectsApi } from '../api/client'
import { useAuthStore } from '../stores/auth'

describe('cliente HTTP', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }))
  })

  it('envia el token en la cabecera Authorization', async () => {
    await projectsApi.list('abc123')
    const [url, options] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/projects')
    expect(options.headers.Authorization).toBe('Bearer abc123')
  })

  it('omite la cabecera cuando no hay token', async () => {
    await projectsApi.list(null)
    const [, options] = global.fetch.mock.calls[0]
    expect(options.headers.Authorization).toBeUndefined()
  })

  it('propaga el detalle del error del servidor', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Credenciales invalidas' }),
    }))
    await expect(authApi.login('a@b.com', 'mal')).rejects.toThrow('Credenciales invalidas')
  })

  it('anade la query de la matriz de ocupacion', async () => {
    await projectsApi.capacity('tkn', 7, { year: 2026 })
    const [url] = global.fetch.mock.calls[0]
    expect(url).toBe('/api/projects/7/capacity?year=2026')
  })
})

describe('store de sesion', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('guarda token y usuario en localStorage', () => {
    const store = useAuthStore()
    store.setSession('tok', { id: 1, name: 'Ana' })
    expect(store.token).toBe('tok')
    expect(localStorage.getItem('coreplanner_token')).toBe('tok')
    expect(JSON.parse(localStorage.getItem('coreplanner_user')).name).toBe('Ana')
  })

  it('limpia la sesion', () => {
    const store = useAuthStore()
    store.setSession('tok', { id: 1, name: 'Ana' })
    store.clear()
    expect(store.token).toBeNull()
    expect(localStorage.getItem('coreplanner_token')).toBeNull()
  })
})
