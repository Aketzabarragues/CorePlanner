import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProjectSettingsView from '../views/ProjectSettingsView.vue'

const projects = [
  {
    id: 1,
    name: 'Linea Pasteurizadora SIVE',
    status: 'active',
    department_id: 1,
    owner_id: 2,
  },
]

const departments = [
  { id: 1, name: 'Automatización & SCADA', manager_name: 'Ana' },
  { id: 2, name: 'Mantenimiento', manager_name: 'Iván' },
]

const people = [
  { id: 2, name: 'Ana', email: 'ana@example.com' },
  { id: 3, name: 'Marta', email: 'm@example.com' },
]

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch({ isManager = true } = {}) {
  global.fetch = vi.fn(async (url, options = {}) => {
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin' },
      })
    }
    if (url.endsWith('/me')) return jsonResponse({ is_manager: isManager })
    if (url.endsWith('/users')) return jsonResponse(people)
    if (url.endsWith('/departments')) return jsonResponse(departments)
    if (url.endsWith('/projects/1') && options.method === 'PATCH') {
      return jsonResponse(projects[0])
    }
    if (url.endsWith('/projects')) return jsonResponse(projects)
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const wrapper = mount(ProjectSettingsView, {
    props: { id: 1 },
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('ProjectSettingsView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
  })

  it('muestra los datos del proyecto', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="project-name"]').element.value).toBe(
      'Linea Pasteurizadora SIVE',
    )
    expect(wrapper.find('[data-testid="project-status"]').element.value).toBe('active')
    expect(wrapper.find('[data-testid="project-department"]').element.value).toBe('1')
    expect(wrapper.find('[data-testid="project-owner"]').element.value).toBe('2')
  })

  it('el gerente guarda los cambios del proyecto', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="project-name"]').setValue('Linea Pasteurizadora SIVE II')
    await wrapper.find('[data-testid="project-status"]').setValue('on_hold')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(
      ([url, options]) => url.endsWith('/projects/1') && options.method === 'PATCH',
    )
    expect(llamada).toBeTruthy()
    expect(JSON.parse(llamada[1].body)).toEqual({
      name: 'Linea Pasteurizadora SIVE II',
      status: 'on_hold',
      department_id: 1,
      owner_id: 2,
    })
    expect(wrapper.find('[data-testid="project-settings-notice"]').exists()).toBe(true)
  })

  it('quien no es gerente ve los datos pero no puede cambiarlos', async () => {
    setupFetch({ isManager: false })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="project-name"]').element.value).toBe(
      'Linea Pasteurizadora SIVE',
    )
    expect(wrapper.find('[data-testid="save-project"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="project-name"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Solo el gerente puede cambiar los datos')
  })
})
