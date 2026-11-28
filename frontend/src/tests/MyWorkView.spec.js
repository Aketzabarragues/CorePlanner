import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useToastStore } from '../stores/toast'
import MyWorkView from '../views/MyWorkView.vue'

const informe = {
  weeks: [
    {
      week: '2026-W45',
      hours: 30,
      capacity: 40,
      capacity_without: 40,
      is_overloaded: false,
      holidays: [],
    },
    {
      week: '2026-W46',
      hours: 48,
      capacity: 40,
      capacity_without: 40,
      is_overloaded: true,
      holidays: [],
    },
    {
      week: '2026-W47',
      hours: 0,
      capacity: 40,
      capacity_without: 40,
      is_overloaded: false,
      holidays: [],
    },
    {
      week: '2026-W50',
      hours: 0,
      capacity: 32,
      capacity_without: 40,
      is_overloaded: false,
      holidays: [{ date: '2026-12-08', name: 'Dia de la Constitucion', scope: 'global' }],
    },
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
      weeks: ['2026-W45', '2026-W46'],
    },
    {
      id: 2,
      project_id: 2,
      project_name: 'Red de tuberias linea 2',
      title: 'Cableado de campo',
      status: 'testing',
      start_date: '2026-11-09',
      end_date: '2026-11-11',
      hours: 24,
      estimated_hours: 24,
      weeks: ['2026-W46'],
    },
    {
      id: 3,
      project_id: 1,
      project_name: 'Linea Pasteurizadora SIVE',
      title: 'Revision de la lista de E/S',
      status: 'done',
      start_date: '2026-11-02',
      end_date: '2026-11-03',
      hours: 8,
      estimated_hours: 8,
      weeks: ['2026-W45'],
    },
  ],
  total_hours: 72,
  has_overload: true,
  current_week: '2026-W45',
}

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

function setupFetch(payload = informe, user = { id: 3, name: 'Sebastian', department_id: 5 }) {
  global.fetch = vi.fn(async (url) => {
    if (url.endsWith('/auth/login')) {
      return jsonResponse({ access_token: 'tok', token_type: 'bearer', user })
    }
    if (url.endsWith('/departments')) {
      return jsonResponse([{ id: 5, name: 'Alimentación' }])
    }
    if (url.endsWith('/my-work')) return jsonResponse(payload)
    if (url.includes('/tasks/')) return jsonResponse({ id: 1, status: 'done' })
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(MyWorkView, { global: { plugins: [pinia] } })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('MyWorkView', () => {
  beforeEach(() => {
    localStorage.clear()
    setupFetch()
  })

  it('avisa de la semana sobrecargada con sus horas', async () => {
    const wrapper = await mountView()

    const aviso = wrapper.find('[data-testid="my-work-overload"]')
    expect(aviso.exists()).toBe(true)
    expect(aviso.text()).toContain('La semana 46 está sobrecargada')
    expect(aviso.text()).toContain('48 h')
    expect(aviso.text()).toContain('40 h')
  })

  it('dibuja el grafico con una barra por semana', async () => {
    const wrapper = await mountView()

    const grafico = wrapper.find('[data-testid="my-work-bars"]')
    expect(grafico.exists()).toBe(true)
    expect(grafico.attributes('role')).toBe('img')
    expect(grafico.attributes('aria-label')).toContain('semana 45')
    // Una barra por semana, tambien las que no tienen carga.
    expect(wrapper.findAll('[data-testid="my-work-bars-bar"]')).toHaveLength(4)
  })

  it('marca el festivo de la semana', async () => {
    const wrapper = await mountView()

    const festivo = wrapper.find('[data-testid="holiday-badge"]')
    expect(festivo.exists()).toBe(true)
    expect(festivo.text()).toContain('Dia de la Constitucion')
  })

  it('enseña la tarjeta de esta semana con su estado', async () => {
    const wrapper = await mountView()

    const tarjeta = wrapper.find('[data-testid="my-work-card-state"]')
    expect(tarjeta.exists()).toBe(true)
    expect(tarjeta.text()).toContain('Carga media')
    expect(tarjeta.text()).toContain('75 %')
    expect(wrapper.text()).toContain('30 h')
  })

  it('avisa del proximo festivo con fecha corta y la perdida con una sola unidad', async () => {
    const wrapper = await mountView()

    const festivo = wrapper.find('[data-testid="my-work-next-holiday"]')
    expect(festivo.exists()).toBe(true)
    expect(festivo.text()).toContain('08 dic')
    // `formatHours` ya lleva la unidad: no puede salir "8 h h".
    expect(festivo.text()).toContain('−8 h')
    expect(festivo.text()).not.toContain('h h')
    expect(festivo.text()).not.toContain('2026-12-08')
  })

  it('pone el subtitulo de la carga bajo el titulo con el rango de semanas', async () => {
    const wrapper = await mountView()

    const tarjeta = wrapper.find('[aria-label="Carga de las próximas semanas"]')
    const titulo = tarjeta.find('h2')
    const subtitulo = tarjeta.find('p')
    expect(titulo.text()).toBe('Mi carga, próximas semanas')
    expect(subtitulo.text()).toBe('La línea discontinua marca el 100 % de tu capacidad semanal')
    // El subtitulo esta bajo el titulo, no en la misma linea.
    expect(
      titulo.element.compareDocumentPosition(subtitulo.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(wrapper.find('[data-testid="my-work-weeks-range"]').text()).toBe('Sem 45 → Sem 50')
  })

  it('separa la asignacion activa y el proximo festivo en dos filas', async () => {
    const wrapper = await mountView()

    const texto = wrapper.find('[data-testid="my-work-card-free"]').element.closest('section').textContent
    expect(texto).toContain('Asignación activa')
    // Las dos tareas del informe tocan la semana W45, en un solo proyecto.
    expect(texto).toContain('2 tareas en 1 proyecto')
    expect(texto).toContain('Próximo festivo')
  })

  it('muestra la insignia de contexto con persona y departamento', async () => {
    const wrapper = await mountView()

    const insignia = wrapper.find('[data-testid="vista-cabecera"] span.truncate')
    expect(insignia.text()).toBe('Sebastian · Alimentación')
  })

  it('muestra el contador de tareas de la pestana abierta', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="my-work-task-count"]').text()).toBe('1')
    await wrapper.find('[data-testid="my-work-tab-done"]').trigger('click')
    expect(wrapper.find('[data-testid="my-work-task-count"]').text()).toBe('1')
    setupFetch({
      ...informe,
      tasks: [],
      total_hours: 0,
      has_overload: false,
      weeks: informe.weeks.map((semana) => ({ ...semana, is_overloaded: false })),
    })
    const vacia = await mountView()
    expect(vacia.find('[data-testid="my-work-task-count"]').text()).toBe('0')
  })

  it('reparte las tareas en las tres pestanas', async () => {
    const wrapper = await mountView()

    // Esta semana: la que toca la semana de referencia.
    expect(wrapper.findAll('[data-testid="my-work-task"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('Programacion SCADA WinCC')

    await wrapper.find('[data-testid="my-work-tab-next"]').trigger('click')
    expect(wrapper.findAll('[data-testid="my-work-task"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('Cableado de campo')

    await wrapper.find('[data-testid="my-work-tab-done"]').trigger('click')
    expect(wrapper.findAll('[data-testid="my-work-task"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('Revision de la lista de E/S')
  })

  it('cambia el estado de una tarea', async () => {
    const wrapper = await mountView()

    const select = wrapper.findAll('[data-testid="my-work-status"]')[0]
    await select.setValue('done')
    await flushPromises()
    await flushPromises()

    const llamada = global.fetch.mock.calls.find(([url]) => url.endsWith('/tasks/1'))
    expect(llamada).toBeTruthy()
    expect(llamada[1].method).toBe('PATCH')
    expect(JSON.parse(llamada[1].body)).toEqual({ status: 'done' })
    expect(useToastStore().items.map((item) => item.message)).toContain(
      '"Programacion SCADA WinCC" pasa a Completado.',
    )
  })

  it('avisa cuando no hay tareas en la pestana', async () => {
    setupFetch({
      ...informe,
      weeks: informe.weeks.map((semana) => ({ ...semana, is_overloaded: false })),
      tasks: [],
      total_hours: 0,
      has_overload: false,
    })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="my-work-empty"]').exists()).toBe(true)
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

  it('las horas libres de la semana salen con una sola unidad', async () => {
    setupFetch()

    const wrapper = await mountView()

    // W45 del informe: 30 h de carga y 40 h de capacidad, 10 h libres.
    // `formatHours` ya lleva la unidad: no puede salir "10 h h libres".
    expect(wrapper.find('[data-testid="my-work-card-free"]').text()).toBe('10 h libres')
  })
})
