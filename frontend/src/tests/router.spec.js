import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CapacityMatrix from '../components/CapacityMatrix.vue'
import { redirectByRole, requireSession } from '../router/guards'
import router from '../router'
import { useAuthStore } from '../stores/auth'
import ActivityView from '../views/ActivityView.vue'
import CalendarView from '../views/CalendarView.vue'
import GanttView from '../views/GanttView.vue'

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

/** Respuesta del ambito con el rol de empresa que se le pasa. */
function ambito(companyRole) {
  return {
    user: { id: 9, name: 'Persona', company_role: companyRole },
    role_label: companyRole,
    is_manager: companyRole === 'gerente',
    visible_project_ids: [1],
    editable_project_ids: [1],
  }
}

function setupFetch(companyRole = 'gerente', loginOk = true) {
  global.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/login')) {
      if (!loginOk) return jsonResponse({ detail: 'Credenciales invalidas' }, false, 401)
      return jsonResponse({
        access_token: 'tok-demo',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin', is_global_admin: true, company_role: companyRole },
      })
    }
    if (url.endsWith('/me')) return jsonResponse(ambito(companyRole))
    if (url.endsWith('/departments')) return jsonResponse([])
    if (url.endsWith('/projects')) return jsonResponse([])
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

describe('guardas del router', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('deja pasar a una vista publica sin sesion', async () => {
    setupFetch('gerente', false)

    const result = await requireSession({ meta: { public: true }, fullPath: '/login' })

    expect(result).toBe(true)
  })

  it('deja pasar con la sesion guardada', async () => {
    setupFetch()
    useAuthStore().setSession('tok', { id: 9, name: 'Admin' })

    const result = await requireSession({ meta: {}, fullPath: '/capacity' })

    expect(result).toBe(true)
  })

  it('lleva al acceso cuando la sesion no se puede establecer', async () => {
    setupFetch('gerente', false)

    const result = await requireSession({ meta: {}, fullPath: '/capacity' })

    expect(result).toEqual({
      name: 'login',
      query: { next: '/capacity' },
    })
  })

  it('no repone la sesion si el usuario la cerro', async () => {
    setupFetch()
    useAuthStore().signOut()

    const result = await requireSession({ meta: {}, fullPath: '/capacity' })

    expect(result).toEqual({
      name: 'login',
      query: { next: '/capacity' },
    })
  })

  it('el gerente entra por el panel', async () => {
    setupFetch('gerente')

    const result = await redirectByRole()

    expect(result).toEqual({ name: 'panel' })
  })

  it('el jefe de departamento entra por el panel', async () => {
    setupFetch('jefe_departamento')

    const result = await redirectByRole()

    expect(result).toEqual({ name: 'panel' })
  })

  it('el tecnico entra por Mi trabajo', async () => {
    setupFetch('tecnico')

    const result = await redirectByRole()

    expect(result).toEqual({ name: 'my-work' })
  })

  it('lleva al acceso si no puede saber el rol', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ access_token: 'tok', user: { id: 9, name: 'Admin' } })
      }
      return jsonResponse({ detail: 'error' }, false, 500)
    })

    const result = await redirectByRole()

    expect(result).toEqual({ name: 'login' })
  })

  it('las vistas de planificacion viven en el espacio del proyecto', () => {
    const esperados = {
      '/projects/2/capacity': { name: 'project-capacity', componente: CapacityMatrix },
      '/projects/2/gantt': { name: 'project-gantt', componente: GanttView },
      '/projects/2/calendar': { name: 'project-calendar', componente: CalendarView },
      '/projects/2/activity': { name: 'project-activity', componente: ActivityView },
    }

    for (const [path, { name, componente }] of Object.entries(esperados)) {
      const ruta = router.resolve(path)
      expect(ruta.name).toBe(name)
      expect(ruta.matched[0].components.default).toBe(componente)
      expect(ruta.params.id).toBe('2')
    }
  })
})
