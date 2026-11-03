import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import LoginView from '../views/LoginView.vue'
import { useAuthStore } from '../stores/auth'

const Empty = { render: () => null }

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch(loginOk = true) {
  global.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/login')) {
      if (!loginOk) return jsonResponse({ detail: 'Credenciales invalidas' }, false, 401)
      return jsonResponse({
        access_token: 'tok-demo',
        token_type: 'bearer',
        user: { id: 9, name: 'Admin', email: 'admin@example.com', is_global_admin: true },
      })
    }
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountLogin(path = '/login') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Empty },
      { path: '/login', name: 'login', component: Empty },
      { path: '/projects/:id/capacity', name: 'capacity', component: Empty },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('LoginView', () => {
  beforeEach(() => {
    localStorage.clear()
    setupFetch()
  })

  it('muestra el formulario cuando no hay sesion', async () => {
    const { wrapper } = await mountLogin()

    expect(wrapper.find('form').exists()).toBe(true)
    expect(wrapper.find('input[type=email]').exists()).toBe(true)
  })

  it('entra y guarda el token', async () => {
    const { wrapper } = await mountLogin()

    await wrapper.find('input[type=email]').setValue('admin@example.com')
    await wrapper.find('input[type=password]').setValue('coreplanner')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(localStorage.getItem('coreplanner_token')).toBe('tok-demo')
    expect(useAuthStore().user.name).toBe('Admin')
  })

  it('vuelve a la vista que se quiso abrir antes del acceso', async () => {
    const { wrapper, router } = await mountLogin('/login?next=/projects/1/capacity')

    await wrapper.find('input[type=email]').setValue('admin@example.com')
    await wrapper.find('input[type=password]').setValue('coreplanner')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/projects/1/capacity')
  })

  it('ignora un destino que no es una ruta interna', async () => {
    const { wrapper, router } = await mountLogin('/login?next=https://ejemplo.com')

    await wrapper.find('input[type=email]').setValue('admin@example.com')
    await wrapper.find('input[type=password]').setValue('coreplanner')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
  })

  it('con sesion guardada entra sin mostrar el formulario', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    useAuthStore().setSession('tok', { id: 9, name: 'Admin' })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: Empty },
        { path: '/login', name: 'login', component: Empty },
      ],
    })
    await router.push('/login')
    await router.isReady()
    const wrapper = mount(LoginView, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
  })

  it('muestra el error si las credenciales no valen', async () => {
    setupFetch(false)
    const { wrapper } = await mountLogin()

    await wrapper.find('input[type=email]').setValue('admin@example.com')
    await wrapper.find('input[type=password]').setValue('mala')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Credenciales invalidas')
  })
})
