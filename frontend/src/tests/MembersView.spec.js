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

const people = [
  { id: 1, name: 'Ana', email: 'ana@example.com' },
  { id: 2, name: 'Sebastián', email: 's@example.com' },
  { id: 3, name: 'Marta', email: 'm@example.com' },
]

const roles = [
  { id: 1, name: 'Project Manager', permissions: ['task.write'] },
  { id: 2, name: 'Ingeniero', permissions: ['task.write'] },
  { id: 3, name: 'Lector', permissions: [] },
]

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch({ isManager = true } = {}) {
  global.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.endsWith('/me')) return jsonResponse({ is_manager: isManager })
    if (url.endsWith('/users')) return jsonResponse(people)
    if (url.endsWith('/roles/project')) return jsonResponse(roles)
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
      if (url.endsWith('/me')) return jsonResponse({ is_manager: true })
      if (url.includes('/members')) return jsonResponse([])
      return jsonResponse([])
    })

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('No hay personas asignadas')
  })

  it('el gerente ve el boton de anadir y el selector de rol', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="new-member"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="member-role-1"]').exists()).toBe(true)
  })

  it('quien no es gerente ve la lista sin botones', async () => {
    setupFetch({ isManager: false })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="new-member"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="member-role-1"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Project Manager')
  })

  it('anade una persona al proyecto', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="new-member"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="member-person"]').setValue('3')
    await wrapper.find('[data-testid="member-role"]').setValue('3')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) => url.endsWith('/projects/1/members') && options.method === 'POST',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toEqual({ user_id: 3, role_id: 3 })
  })

  it('cambia el rol de un miembro', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="member-role-1"]').setValue('3')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) => url.endsWith('/projects/1/members/1') && options.method === 'PATCH',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toEqual({ role_id: 3 })
  })

  it('el aviso no oculta la lista de miembros', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="remove-member-2"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="members-notice"]').text()).toContain('Sebastián')
    expect(wrapper.findAll('[data-testid="member-row"]')).toHaveLength(2)
  })

  it('un fallo al anadir se muestra dentro del modal', async () => {
    const base = global.fetch.getMockImplementation()
    global.fetch = vi.fn(async (url, options) => {
      if (options?.method === 'POST' && url.endsWith('/projects/1/members')) {
        return jsonResponse({ detail: 'Ya es miembro del proyecto' }, false, 409)
      }
      return base(url, options)
    })

    const wrapper = await mountView()

    await wrapper.find('[data-testid="new-member"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="member-person"]').setValue('3')
    await wrapper.find('[data-testid="member-role"]').setValue('3')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="member-form-error"]').text()).toContain('Ya es miembro')
    expect(wrapper.find('[data-testid="members-error"]').exists()).toBe(false)
  })

  it('saca a una persona del proyecto', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="remove-member-2"]').trigger('click')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) => url.endsWith('/projects/1/members/2') && options.method === 'DELETE',
    )
    expect(llamada).toBeTruthy()
  })
})
