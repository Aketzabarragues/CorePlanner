import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MyWorkView from '../views/MyWorkView.vue'

const informe = {
  weeks: [
    { week: '2026-W45', hours: 30, capacity: 40, is_overloaded: false },
    { week: '2026-W46', hours: 48, capacity: 40, is_overloaded: true },
  ],
  tasks: [
    {
      id: 1,
      project_id: 1,
      project_name: 'Linea Pasteurizadora SIVE',
      title: 'Programacion SCADA WinCC',
      status: 'in_progress',
      start_date: '2026-11-05',
      end_date: '2026-11-11',
      hours: 40,
      estimated_hours: 40,
    },
    {
      id: 2,
      project_id: 2,
      project_name: 'Red de tuberias linea 2',
      title: 'Cableado de campo',
      status: 'testing',
      start_date: '2026-11-05',
      end_date: '2026-11-11',
      hours: 24,
      estimated_hours: 24,
    },
  ],
  total_hours: 78,
  has_overload: true,
}

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch(payload = informe) {
  global.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/login')) {
      return jsonResponse({
        access_token: 'tok',
        token_type: 'bearer',
        user: { id: 3, name: 'Sebastián' },
      })
    }
    if (url.endsWith('/my-work')) return jsonResponse(payload)
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const wrapper = mount(MyWorkView, {
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('MyWorkView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
  })

  it('lista las tareas propias con su proyecto y sus horas', async () => {
    const wrapper = await mountView()

    expect(wrapper.findAll('[data-testid="my-work-task"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Programacion SCADA WinCC')
    expect(wrapper.text()).toContain('Linea Pasteurizadora SIVE')
    expect(wrapper.text()).toContain('Cableado de campo')
    expect(wrapper.text()).toContain('En Desarrollo')
    expect(wrapper.text()).toContain('40 h')
  })

  it('muestra la carga de cada semana con la marca de sobrecarga', async () => {
    const wrapper = await mountView()

    const semanas = wrapper.findAll('[data-testid="my-work-week"]')
    expect(semanas).toHaveLength(2)
    expect(semanas[0].text()).toContain('2026-W45')
    expect(semanas[0].text()).toContain('En su capacidad')
    expect(semanas[1].text()).toContain('2026-W46')
    expect(semanas[1].text()).toContain('Sobrecargado')
    expect(wrapper.find('[data-testid="my-work-overload"]').exists()).toBe(true)
  })

  it('resume el total de tareas y de horas del periodo', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('2 tarea(s)')
    expect(wrapper.text()).toContain('78 h')
  })

  it('avisa cuando no hay tareas en el periodo', async () => {
    setupFetch({ weeks: [], tasks: [], total_hours: 0, has_overload: false })

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('No tienes tareas asignadas en este periodo')
    expect(wrapper.find('[data-testid="my-work-overload"]').exists()).toBe(false)
  })

  it('muestra el error si el servidor no responde', async () => {
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/login')) {
        return jsonResponse({ access_token: 'tok', token_type: 'bearer', user: {} })
      }
      return jsonResponse({ detail: 'Fallo del servidor' }, false, 500)
    })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="my-work-error"]').text()).toContain('Fallo del servidor')
  })
})
