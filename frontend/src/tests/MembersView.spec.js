import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MembersView from '../views/MembersView.vue'

const members = [
  {
    user_id: 1,
    name: 'Ana',
    email: 'ana@example.com',
    role_id: 1,
    role_name: 'Project Manager',
    weekly_base_hours: 40,
  },
  {
    user_id: 2,
    name: 'Sebastián',
    email: 's@example.com',
    role_id: 2,
    role_name: 'Ingeniero',
    weekly_base_hours: 30,
  },
]

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch() {
  global.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.includes('/members')) return jsonResponse(members)
    if (url.endsWith('/departments')) return jsonResponse([])
    if (url.endsWith('/projects')) {
      return jsonResponse([
        { id: 1, name: 'Linea Pasteurizadora SIVE', status: 'active', department_id: 1 },
      ])
    }
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const wrapper = mount(MembersView, {
    props: { id: 1 },
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('MembersView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
  })

  it('lista las personas del proyecto con su rol y sus horas', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Ana')
    expect(wrapper.text()).toContain('ana@example.com')
    expect(wrapper.text()).toContain('Project Manager')
    expect(wrapper.text()).toContain('Sebastián')
    expect(wrapper.text()).toContain('Ingeniero')
    expect(wrapper.text()).toContain('40 h/semana')
  })

  it('resume el total de personas y de horas base', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('2 persona(s)')
    expect(wrapper.text()).toContain('70 h base en total')
  })

  it('avisa cuando el proyecto no tiene personas', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ access_token: 'tok', user: { id: 9, name: 'Admin' } })
      }
      if (url.includes('/members')) return jsonResponse([])
      return jsonResponse([])
    })

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('No hay personas asignadas')
  })
})
