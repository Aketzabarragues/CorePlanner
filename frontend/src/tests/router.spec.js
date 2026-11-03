import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { redirectToFirstProject, requireSession } from '../router/guards'
import { useAuthStore } from '../stores/auth'
import { useProjectsStore } from '../stores/projects'

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

const projects = [
  { id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active', department_id: 1 },
  { id: 2, name: 'Ampliacion linea 2', status: 'active', department_id: 2 },
]

function setupFetch(loginOk = true) {
  global.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/login')) {
      if (!loginOk) return jsonResponse({ detail: 'Credenciales invalidas' }, false, 401)
      return jsonResponse({
        access_token: 'tok-demo',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin', is_global_admin: true },
      })
    }
    if (url.endsWith('/departments')) return jsonResponse([])
    if (url.endsWith('/projects')) return jsonResponse(projects)
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

describe('guardas del router', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('deja pasar a una vista publica sin sesion', async () => {
    setupFetch(false)

    const result = await requireSession({ meta: { public: true }, fullPath: '/login' })

    expect(result).toBe(true)
  })

  it('deja pasar con la sesion guardada', async () => {
    setupFetch()
    useAuthStore().setSession('tok', { id: 9, name: 'Admin' })

    const result = await requireSession({ meta: {}, fullPath: '/projects/1/capacity' })

    expect(result).toBe(true)
  })

  it('lleva al acceso cuando la sesion no se puede establecer', async () => {
    setupFetch(false)

    const result = await requireSession({ meta: {}, fullPath: '/projects/1/capacity' })

    expect(result).toEqual({
      name: 'login',
      query: { next: '/projects/1/capacity' },
    })
  })

  it('no repone la sesion si el usuario la cerro', async () => {
    setupFetch()
    useAuthStore().signOut()

    const result = await requireSession({ meta: {}, fullPath: '/projects/1/capacity' })

    expect(result).toEqual({
      name: 'login',
      query: { next: '/projects/1/capacity' },
    })
  })

  it('lleva la raiz a la matriz del primer proyecto', async () => {
    setupFetch()

    const result = await redirectToFirstProject()

    expect(result).toEqual({ name: 'capacity', params: { id: '1' } })
  })

  it('lleva la raiz al listado si no hay proyectos', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ access_token: 'tok', user: { id: 9, name: 'Admin' } })
      }
      if (url.endsWith('/departments')) return jsonResponse([])
      return jsonResponse([])
    })

    const result = await redirectToFirstProject()

    expect(result).toEqual({ name: 'projects' })
  })

  it('lleva la raiz al listado si la peticion falla', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ access_token: 'tok', user: { id: 9, name: 'Admin' } })
      }
      return jsonResponse({ detail: 'error' }, false, 500)
    })

    const result = await redirectToFirstProject()

    expect(result).toEqual({ name: 'projects' })
  })

  it('carga los proyectos una sola vez en el store', async () => {
    setupFetch()
    const store = useProjectsStore()

    await redirectToFirstProject()
    await redirectToFirstProject()

    const calls = global.fetch.mock.calls.filter(([url]) => url.endsWith('/projects'))
    expect(calls).toHaveLength(1)
  })
})
