import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'

import { useProyectoFiltro } from '../composables/useProyectoFiltro'

/** Componente de prueba: pinta el proyecto que filtra la vista. */
const Montaje = {
  setup() {
    return { proyecto: useProyectoFiltro() }
  },
  template: '<span data-testid="proyecto">{{ proyecto }}</span>',
}

async function mountConRuta(path) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/projects/:id/capacity',
        name: 'project-capacity',
        component: { template: '<div />' },
      },
      { path: '/capacity', name: 'capacity', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()

  return mount(Montaje, { global: { plugins: [router] } })
}

describe('useProyectoFiltro', () => {
  it('con el proyecto en la ruta devuelve su identificador', async () => {
    const wrapper = await mountConRuta('/projects/2/capacity')

    expect(wrapper.get('[data-testid="proyecto"]').text()).toBe('2')
  })

  it('el proyecto de la ruta gana sobre el filtro de la url', async () => {
    const wrapper = await mountConRuta('/projects/2/capacity?project=3')

    expect(wrapper.get('[data-testid="proyecto"]').text()).toBe('2')
  })

  it('sin proyecto en la ruta usa el filtro de la url', async () => {
    const wrapper = await mountConRuta('/capacity?project=2')

    expect(wrapper.get('[data-testid="proyecto"]').text()).toBe('2')
  })

  it('sin proyecto ni filtro devuelve cadena vacia', async () => {
    const wrapper = await mountConRuta('/capacity')

    expect(wrapper.get('[data-testid="proyecto"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="proyecto"]').text()).toBe('')
  })
})
