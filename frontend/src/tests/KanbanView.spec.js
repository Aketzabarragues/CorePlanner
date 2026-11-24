import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TaskDetailDialog from '../components/TaskDetailDialog.vue'
import KanbanView from '../views/KanbanView.vue'
import { useToastStore } from '../stores/toast'
import { localDateKey } from '../utils/month'

/**
 * Tablero de prueba: dos columnas con una sola tarjeta y dos con dos, para
 * que el indice de insercion se pueda distinguir por la y de la soltura.
 * Los contadores y las horas son los del feed: el frontend no los calcula.
 */
const board = {
  columns: [
    {
      status: 'backlog',
      task_count: 1,
      estimated_hours: 10,
      tasks: [
        {
          id: 1,
          title: 'Esquemas EPLAN',
          status: 'backlog',
          assigned_to: 1,
          assigned_name: 'Ana',
          estimated_hours: 10,
          start_date: '2026-11-02',
          end_date: '2026-11-04',
        },
      ],
    },
    {
      status: 'in_progress',
      task_count: 1,
      estimated_hours: 40,
      tasks: [
        {
          id: 2,
          title: 'Programacion SCADA',
          status: 'in_progress',
          assigned_to: 2,
          assigned_name: 'Sebastian',
          estimated_hours: 40,
          start_date: '2026-11-05',
          end_date: '2026-11-11',
        },
      ],
    },
    {
      status: 'testing',
      task_count: 2,
      estimated_hours: 7,
      tasks: [
        {
          id: 3,
          title: 'Pruebas FAT',
          status: 'testing',
          assigned_to: 1,
          assigned_name: 'Ana',
          estimated_hours: 4,
          start_date: '2026-11-12',
          end_date: '2026-11-14',
        },
        {
          id: 4,
          title: 'Pruebas SAT',
          status: 'testing',
          assigned_to: 2,
          assigned_name: 'Sebastian',
          estimated_hours: 3,
          start_date: '2026-11-15',
          end_date: '2026-11-16',
        },
      ],
    },
    {
      status: 'done',
      task_count: 2,
      estimated_hours: 6,
      tasks: [
        {
          id: 5,
          title: 'Revision de requisitos',
          status: 'done',
          assigned_to: 3,
          assigned_name: 'Lucia',
          estimated_hours: 2,
          start_date: '2026-10-26',
          end_date: '2026-10-28',
        },
        {
          id: 6,
          title: 'Informe de entrega',
          status: 'done',
          assigned_to: null,
          assigned_name: null,
          estimated_hours: 4,
          start_date: '2026-10-29',
          end_date: '2026-10-30',
        },
      ],
    },
  ],
}

const miembros = [
  { user_id: 1, name: 'Ana' },
  { user_id: 2, name: 'Sebastian' },
  { user_id: 3, name: 'Lucia' },
]

/**
 * Monta el tablero.
 *
 * `editable` son los proyectos en los que quien entra puede escribir: el
 * tablero se ve en solo lectura si el proyecto no esta entre ellos.
 * `failOrder` y `failPatch` hacen fallar la peticion de orden o el PATCH,
 * para ver el aviso en el banner.
 */
function setupFetch({ editable = [1], failOrder = false, failPatch = false, falloTablero = null } = {}) {
  const calls = []
  /**
   * Tareas creadas en la prueba, por columna: el feed las sirve en la
   * recarga que sigue al alta, para comprobar que la tarjeta queda.
   */
  const creadas = {}
  let siguienteId = 101
  global.fetch = vi.fn(async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', body: options.body })
    if (url.includes('/kanban') && falloTablero) {
      // La carga del tablero cae con el estado y el detalle dados, como un
      // 403 o un 500 reales.
      return { ok: false, status: falloTablero.status, json: async () => ({ detail: falloTablero.detail }) }
    }
    if (url.endsWith('/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'tok', user: { id: 9, name: 'Admin' } }),
      }
    }
    if (url.endsWith('/me')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: 9, name: 'Admin' },
          role_label: 'Tecnico',
          is_manager: false,
          visible_project_ids: [1],
          editable_project_ids: editable,
        }),
      }
    }
    if (url.includes('/kanban')) {
      // Copia nueva en cada llamada: la vista mueve las tarjetas al instante
      // y no debe tocar los datos del test.
      const copia = JSON.parse(JSON.stringify(board))
      for (const columna of copia.columns) {
        for (const tarea of creadas[columna.status] ?? []) {
          columna.tasks.push(tarea)
          columna.task_count += 1
          columna.estimated_hours += Number(tarea.estimated_hours)
        }
      }
      return { ok: true, status: 200, json: async () => copia }
    }
    if (url.endsWith('/api/tasks/1') && (options.method ?? 'GET') === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 1,
          project_id: 1,
          title: 'Esquemas EPLAN',
          status: 'backlog',
          assigned_to: 1,
          start_date: '2026-11-02',
          end_date: '2026-11-04',
          estimated_hours: 10,
          description: '',
        }),
      }
    }
    if (url.endsWith('/members')) {
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(JSON.stringify(miembros)),
      }
    }
    if (options.method === 'PUT' && failOrder) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ detail: 'No se pudo mover' }),
      }
    }
    if (options.method === 'PATCH' && failPatch) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ detail: 'No se pudo guardar' }),
      }
    }
    if (options.method === 'POST' && url.endsWith('/tasks')) {
      const creada = JSON.parse(options.body)
      const status = creada.status ?? 'backlog'
      creadas[status] = [
        ...(creadas[status] ?? []),
        {
          id: siguienteId++,
          title: creada.title,
          status,
          assigned_to: creada.assigned_to,
          assigned_name: creada.assigned_to ? 'Ana' : null,
          estimated_hours: Number.parseFloat(creada.estimated_hours),
          start_date: creada.start_date,
          end_date: creada.end_date,
        },
      ]
      return { ok: true, status: 200, json: async () => ({}) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  })
  return calls
}

async function mountKanban() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const wrapper = mount(KanbanView, {
    props: { id: 1 },
    global: { plugins: [pinia] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

/** Coloca cada columna en un sitio fijo para poder apuntar con el raton. */
function stubColumns(wrapper) {
  wrapper.findAll('section').forEach((section, index) => {
    section.element.getBoundingClientRect = () => ({
      left: index * 100,
      right: index * 100 + 100,
      top: 0,
      bottom: 200,
    })
  })
}

/**
 * Coloca cada tarjeta en un bloque fijo de 40 px dentro de su columna.
 *
 * Con bloques fijos, la y de la soltura decide el hueco: por debajo del
 * punto medio de una tarjeta, la soltura cae tras ella.
 */
function stubCards(wrapper) {
  wrapper
    .findAll('article[data-testid="kanban-card"]')
    .forEach((card, index) => {
      card.element.getBoundingClientRect = () => ({
        left: 0,
        right: 100,
        top: index * 40,
        bottom: index * 40 + 40,
      })
    })
}

/**
 * Arrastra la tarjeta primera vez que se la agarra: mousedown sobre ella y
 * el resto del gesto en la ventana, como el raton real.
 */
async function arrastrar(wrapper, moverX, moverY, soltarX, soltarY, indice = 0) {
  const tarjeta = wrapper.findAll('article')[indice]
  await tarjeta.trigger('mousedown', { clientX: 0, clientY: 0 })
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: moverX, clientY: moverY }))
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: soltarX, clientY: soltarY }))
  await flushPromises()
}

describe('KanbanView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('pide el tablero al endpoint del proyecto y a los miembros', async () => {
    const calls = setupFetch()

    await mountKanban()

    const call = calls.find((c) => c.url.includes('/kanban'))
    expect(call).toBeDefined()
    expect(call.url).toBe('/api/projects/1/kanban')
    expect(calls.find((c) => c.url === '/api/projects/1/members')).toBeDefined()
  })

  it('con un 403 de la carga el aviso se pinta sin reintentar', async () => {
    setupFetch({ falloTablero: { status: 403, detail: 'Sin permiso' } })

    const wrapper = await mountKanban()

    const aviso = wrapper.get('[role="alert"]')
    expect(aviso.text()).toContain('Sin permiso')
    expect(aviso.find('button').exists()).toBe(false)
  })

  it('con un 500 de la carga el aviso ofrece reintentar y repite la peticion', async () => {
    const calls = setupFetch({
      falloTablero: { status: 500, detail: 'Sin conexion con el servidor' },
    })

    const wrapper = await mountKanban()

    const boton = wrapper.get('[role="alert"] button')
    expect(boton.text()).toBe('Reintentar')

    await boton.trigger('click')
    await flushPromises()
    await flushPromises()

    // El servidor sigue caido: el aviso se queda y la peticion se repite.
    expect(wrapper.get('[role="alert"]').text()).toContain('Sin conexion con el servidor')
    expect(calls.filter((c) => c.url.includes('/kanban')).length).toBe(2)
  })

  it('cada columna muestra el contador y las horas del feed', async () => {
    setupFetch()

    const wrapper = await mountKanban()

    const cabeceras = wrapper
      .findAll('section h2')
      .map((h) => h.text().replace(/\s+/g, ' ').trim())
    expect(cabeceras).toEqual([
      'Backlog 1 tarea · 10 h',
      'En Desarrollo 1 tarea · 40 h',
      'Pruebas (FAT/SAT) 2 tareas · 7 h',
      'Completado 2 tareas · 6 h',
    ])
  })

  it('la tarjeta muestra titulo, persona, horas y fechas', async () => {
    setupFetch()

    const wrapper = await mountKanban()

    const texto = wrapper.text()
    expect(texto).toContain('Esquemas EPLAN')
    expect(texto).toContain('Ana')
    expect(texto).toContain('10 h')
    expect(texto).toContain('2026-11-02')
  })

  it('cambiar el estado en el desplegable ordena la tarea al final de la columna destino', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()

    // El segundo select de la tarjeta es el de estado.
    const select = wrapper.findAll('article')[0].findAll('select')[1]
    await select.setValue('done')
    await flushPromises()

    const put = calls.find((c) => c.method === 'PUT')
    expect(put).toBeDefined()
    expect(put.url).toBe('/api/projects/1/tasks/order')
    // La tarjeta va tras las que ya estaban en la columna destino.
    expect(JSON.parse(put.body)).toEqual({
      task_id: 1,
      status: 'done',
      task_ids: [5, 6, 1],
    })
    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined()
    expect(useToastStore().items.map((item) => item.message)).toContain(
      '"Esquemas EPLAN" pasa a Completado.',
    )
  })

  it('arrastrar una tarjeta a otra columna la guarda en el orden de la soltura', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()
    stubColumns(wrapper)
    stubCards(wrapper)

    // x=250 cae en la tercera columna y y=120 esta entre los puntos medios de
    // sus dos tarjetas (100 y 140), tras la primera.
    await arrastrar(wrapper, 250, 120, 250, 120)

    const put = calls.find((c) => c.method === 'PUT')
    expect(put).toBeDefined()
    expect(put.url).toBe('/api/projects/1/tasks/order')
    expect(JSON.parse(put.body)).toEqual({
      task_id: 1,
      status: 'testing',
      task_ids: [3, 1, 4],
    })
    expect(useToastStore().items.map((item) => item.message)).toContain(
      '"Esquemas EPLAN" pasa a Pruebas (FAT/SAT).',
    )
  })

  it('soltar la tarjeta en su propia columna la reordena', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()
    stubColumns(wrapper)

    // La tarjeta de backlog va tras la de in_progress: al arrastrar, su
    // bloque se mide tras el de la primera tarjeta del tablero.
    wrapper.findAll('article')[0].element.getBoundingClientRect = () => ({
      left: 0,
      right: 100,
      top: 80,
      bottom: 120,
    })

    // y=90 esta tras el punto medio de la tarjeta de la columna, asi que va
    // al final de la lista de su columna.
    await arrastrar(wrapper, 50, 90, 50, 90)

    const put = calls.find((c) => c.method === 'PUT')
    expect(put).toBeDefined()
    expect(JSON.parse(put.body)).toEqual({
      task_id: 1,
      status: 'backlog',
      task_ids: [1],
    })
  })

  it('el arrastre cancela la seleccion de texto del navegador', async () => {
    setupFetch()
    const wrapper = await mountKanban()

    // El navegador solo selecciona texto si el mousedown no llega cancelado.
    const evento = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    wrapper.findAll('article')[0].element.dispatchEvent(evento)

    expect(evento.defaultPrevented).toBe(true)
  })

  it('la tarjeta no deja seleccionar su texto', async () => {
    setupFetch()
    const wrapper = await mountKanban()

    expect(wrapper.findAll('article')[0].classes()).toContain('select-none')
  })

  it('mientras se arrastra, una copia de la tarjeta sigue al cursor', async () => {
    setupFetch()
    const wrapper = await mountKanban()
    stubColumns(wrapper)

    expect(wrapper.find('[data-testid="kanban-drag-ghost"]').exists()).toBe(false)

    const tarjeta = wrapper.findAll('article')[0]
    await tarjeta.trigger('mousedown', { clientX: 0, clientY: 0 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 120 }))
    await flushPromises()

    const copia = wrapper.find('[data-testid="kanban-drag-ghost"]')
    expect(copia.exists()).toBe(true)
    expect(copia.text()).toContain('Esquemas EPLAN')
    expect(copia.text()).toContain('Ana')
    expect(copia.text()).toContain('10 h')
    expect(copia.attributes('style')).toContain('left: 250px')
    expect(copia.attributes('style')).toContain('top: 120px')

    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 250, clientY: 120 }))
    await flushPromises()

    // Al soltar, la copia se va: solo existe mientras dura el gesto.
    expect(wrapper.find('[data-testid="kanban-drag-ghost"]').exists()).toBe(false)
  })

  it('sin permiso de escritura el desplegable esta deshabilitado', async () => {
    setupFetch({ editable: [] })
    const wrapper = await mountKanban()

    const select = wrapper.findAll('article')[0].findAll('select')[1]
    expect(select.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Solo lectura')
  })

  it('con permiso de escritura el subtitulo ofrece el arrastre', async () => {
    setupFetch()
    const wrapper = await mountKanban()

    expect(wrapper.text()).toContain('Arrastra una tarjeta a otra columna')
    expect(wrapper.text()).not.toContain('Solo lectura')
  })

  it('sin permiso de escritura la tarjeta no se puede arrastrar', async () => {
    const calls = setupFetch({ editable: [] })
    const wrapper = await mountKanban()
    stubColumns(wrapper)

    await arrastrar(wrapper, 250, 10, 250, 10)

    expect(calls.find((c) => c.method === 'PUT' || c.method === 'PATCH')).toBeUndefined()
  })

  it('sin permiso de escritura el cambio de estado no sale al servidor', async () => {
    const calls = setupFetch({ editable: [] })
    const wrapper = await mountKanban()

    // El desplegable esta deshabilitado, de modo que el cambio no se dispara
    // y no sale nada al servidor.
    const select = wrapper.findAll('article')[0].findAll('select')[1]
    expect(select.attributes('disabled')).toBeDefined()

    await select.setValue('done')
    await flushPromises()

    expect(calls.find((c) => c.method === 'PUT' || c.method === 'PATCH')).toBeUndefined()
  })

  it('si el servidor rechaza la orden, el aviso se ve', async () => {
    setupFetch({ failOrder: true })
    const wrapper = await mountKanban()

    const select = wrapper.findAll('article')[0].findAll('select')[1]
    await select.setValue('done')
    await flushPromises()

    // El aviso no lo tapa la recarga que viene despues del intento.
    const aviso = wrapper.find('[data-testid="kanban-warning"]')
    expect(aviso.exists()).toBe(true)
    expect(aviso.text()).toContain('No se ha podido mover la tarea')
    expect(aviso.text()).toContain('No se pudo mover')
  })

  it('alta inline: el pie de columna muestra el boton fantasma, no el formulario', async () => {
    setupFetch()
    const wrapper = await mountKanban()

    expect(wrapper.findAll('[data-testid="kanban-new-task"]')).toHaveLength(0)
    const botones = wrapper.findAll('[data-testid="kanban-add-task"]')
    expect(botones).toHaveLength(4)
    for (const boton of botones) {
      expect(boton.text()).toBe('+ Anadir tarea')
    }
  })

  it('alta inline: crear la tarea en la columna del formulario con las fechas de hoy', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()

    const botones = wrapper.findAll('[data-testid="kanban-add-task"]')
    await botones[2].trigger('click')
    await flushPromises()

    const form = wrapper.findAll('[data-testid="kanban-new-task"]')[0]
    await form.find('input[type="text"]').setValue('Nueva tarea FAT')
    await form.find('input[type="number"]').setValue('8')
    await form.findAll('select')[0].setValue('2')
    await form.trigger('submit')
    await flushPromises()
    // La recarga tras la creacion es otra cadena de peticiones.
    await flushPromises()

    const hoy = localDateKey()
    const post = calls.find((c) => c.url === '/api/projects/1/tasks')
    expect(post).toBeDefined()
    expect(post.method).toBe('POST')
    expect(JSON.parse(post.body)).toEqual({
      title: 'Nueva tarea FAT',
      assigned_to: 2,
      estimated_hours: '8.00',
      start_date: hoy,
      end_date: hoy,
    })
    // El formulario se cierra al crear. La API no recibe estado: la tarea
    // cae en backlog, el por defecto, y la tarjeta queda tras la recarga.
    expect(wrapper.findAll('[data-testid="kanban-new-task"]')).toHaveLength(0)
    const columna = wrapper.findAll('section')[0]
    expect(columna.text()).toContain('Nueva tarea FAT')
    expect(columna.text()).toContain('2 tareas · 18 h')
    expect(useToastStore().items.map((item) => item.message)).toContain(
      'Tarea "Nueva tarea FAT" creada.',
    )
  })

  it('alta inline: sin titulo no crea nada', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()

    const [boton] = wrapper.findAll('[data-testid="kanban-add-task"]')
    await boton.trigger('click')
    await flushPromises()

    const form = wrapper.findAll('[data-testid="kanban-new-task"]')[0]
    await form.find('input[type="text"]').setValue('  ')
    await form.trigger('submit')
    await flushPromises()

    expect(calls.find((c) => c.url === '/api/projects/1/tasks')).toBeUndefined()
    // El formulario queda abierto: el alta no se descarto, solo no valido.
    expect(wrapper.findAll('[data-testid="kanban-new-task"]')).toHaveLength(1)
  })

  it('alta inline: abrir el formulario de una columna cierra el de la otra', async () => {
    setupFetch()
    const wrapper = await mountKanban()

    const [botonPrimera] = wrapper.findAll('[data-testid="kanban-add-task"]')
    await botonPrimera.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="kanban-new-task"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="kanban-add-task"]')).toHaveLength(3)

    // El de la primera ya no esta: el tercero de los que quedan es el de
    // la columna de pruebas.
    await wrapper.findAll('[data-testid="kanban-add-task"]')[1].trigger('click')
    await flushPromises()
    const forms = wrapper.findAll('[data-testid="kanban-new-task"]')
    expect(forms).toHaveLength(1)
    // El que queda es el de la columna tercera; el de la primera se cerro.
    expect(forms[0].element.closest('section').querySelector('h2').textContent).toContain('Pruebas')
  })

  it('alta inline: Escape cierra el formulario sin crear nada', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()

    const [boton] = wrapper.findAll('[data-testid="kanban-add-task"]')
    await boton.trigger('click')
    await flushPromises()

    const form = wrapper.find('[data-testid="kanban-new-task"]')
    await form.find('input[type="text"]').setValue('Tarea abandonada')
    await form.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    expect(wrapper.findAll('[data-testid="kanban-new-task"]')).toHaveLength(0)
    expect(calls.find((c) => c.url === '/api/projects/1/tasks')).toBeUndefined()
  })

  it('alta inline: sin permiso de escritura no hay boton de alta ni formulario', async () => {
    setupFetch({ editable: [] })
    const wrapper = await mountKanban()

    expect(wrapper.findAll('[data-testid="kanban-add-task"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="kanban-new-task"]')).toHaveLength(0)
  })

  it('reordenar en la propia columna no cuenta la tarjeta arrastrada', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()
    stubColumns(wrapper)

    // La tarjeta arrastrada sigue en el DOM mientras dura el gesto, asi que
    // el test la mide explicitamente: su punto medio esta en y=180, y el de
    // la otra tarjeta de la columna en y=220.
    const [tarjeta, otra] = [wrapper.findAll('article')[2], wrapper.findAll('article')[3]]
    tarjeta.element.getBoundingClientRect = () => ({
      left: 0,
      right: 100,
      top: 160,
      bottom: 200,
    })
    otra.element.getBoundingClientRect = () => ({
      left: 0,
      right: 100,
      top: 200,
      bottom: 240,
    })

    // Soltar en y=190 esta tras el punto medio de la arrastrada y por encima
    // del de la otra tarjeta: la lista final conserva el orden relativo y la
    // arrastrada cae en su hueco. Con el bug, la arrastrada contaba al medir
    // y la lista salia [4, 3].
    await arrastrar(wrapper, 240, 190, 250, 190, 2)

    const put = calls.find((c) => c.method === 'PUT')
    expect(put).toBeDefined()
    expect(JSON.parse(put.body)).toEqual({
      task_id: 3,
      status: 'testing',
      task_ids: [3, 4],
    })
  })

  it('doble clic en el titulo lo edita in situ y Intro lo guarda con un PATCH parcial', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()

    const tarjeta = wrapper.findAll('article')[0]
    await tarjeta.find('p').trigger('dblclick')
    await flushPromises()

    const input = tarjeta.find('input[type="text"]')
    expect(input.exists()).toBe(true)
    await input.setValue('Esquemas EPLAN revisados')
    await input.trigger('keyup', { key: 'Enter' })
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(patch.url).toBe('/api/tasks/1')
    expect(JSON.parse(patch.body)).toEqual({ title: 'Esquemas EPLAN revisados' })
    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(false)
  })

  it('Escape cancela la edicion del titulo sin guardar', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()

    const tarjeta = wrapper.findAll('article')[0]
    await tarjeta.find('p').trigger('dblclick')
    await flushPromises()

    const input = tarjeta.find('input[type="text"]')
    await input.setValue('Titulo abandonado')
    await input.trigger('keyup', { key: 'Escape' })
    await flushPromises()

    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined()
    expect(tarjeta.text()).toContain('Esquemas EPLAN')
  })

  it('el doble clic en las horas las edita in situ y Intro las guarda', async () => {
    const calls = setupFetch()
    const wrapper = await mountKanban()

    const tarjeta = wrapper.findAll('article')[0]
    // El badge de horas es el span de la fila de controles.
    const badge = tarjeta.findAll('span').find((s) => s.text().includes('h'))
    await badge.trigger('dblclick')
    await flushPromises()

    const input = tarjeta.find('input[type="number"]')
    expect(input.exists()).toBe(true)
    await input.setValue('12')
    await input.trigger('keyup', { key: 'Enter' })
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body)).toEqual({ estimated_hours: '12.00' })
  })

  it('el clic que termina una edicion inline no abre el detalle', async () => {
    setupFetch()
    const wrapper = await mountKanban()

    const tarjeta = wrapper.findAll('article')[0]
    await tarjeta.find('p').trigger('dblclick')
    await flushPromises()

    const input = tarjeta.find('input[type="text"]')
    await input.trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(false)
  })

  it('un clic en la tarjeta abre su detalle', async () => {
    setupFetch()
    const wrapper = await mountKanban()

    await wrapper.findAll('article')[0].trigger('click')
    await flushPromises()

    const panel = wrapper.findComponent(TaskDetailDialog)
    expect(panel.props('open')).toBe(true)
    expect(panel.props('taskId')).toBe(1)
  })

  it('un clic en el desplegable de estado no abre el detalle', async () => {
    setupFetch()
    const wrapper = await mountKanban()

    const select = wrapper.findAll('article')[0].findAll('select')[1]
    await select.trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(false)
  })

  it('un arrastre no abre el detalle', async () => {
    setupFetch()
    const wrapper = await mountKanban()
    stubColumns(wrapper)

    const tarjeta = wrapper.findAll('article')[0]
    await tarjeta.trigger('mousedown', { clientX: 10, clientY: 10 })
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 10 }))
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 250, clientY: 10 }))
    await tarjeta.trigger('click')
    await flushPromises()

    expect(wrapper.findComponent(TaskDetailDialog).props('open')).toBe(false)
  })

  it('el detalle se abre tambien sin permiso de escritura', async () => {
    setupFetch({ editable: [] })
    const wrapper = await mountKanban()

    await wrapper.findAll('article')[0].trigger('click')
    await flushPromises()

    const panel = wrapper.findComponent(TaskDetailDialog)
    expect(panel.props('open')).toBe(true)
    expect(panel.props('canEdit')).toBe(false)
  })
})
