import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useToastStore } from '../stores/toast'
import { pildora } from '../utils/statusColor'
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

// Estados del proyecto 1, en el orden que manda el servidor.
const estados = [
  { id: 11, key: 'nueva', label: 'Nueva', color: '#1f6feb', progress: 0, task_count: 3 },
  { id: 12, key: 'en_desarrollo', label: 'En Desarrollo', color: '#1a7f37', progress: 50, task_count: 5 },
  { id: 13, key: 'revision', label: 'Revisión', color: null, progress: 80, task_count: 0 },
  { id: 14, key: 'completada', label: 'Completada', color: '#0b6e4f', progress: 100, task_count: 2 },
]

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload }
}

/**
 * Doble de la API. `estadosList` es la lista que da el GET del proyecto;
 * `postError` y `orderError` fuerzan un fallo en el POST de alta y en el PUT
 * de orden (para los casos de error en linea). El doble es estatal: el PUT de
 * orden reordena la lista, como haria el servidor, y el POST la alarga.
 */
function setupFetch({ isManager = true, estadosList = estados, postError = null, orderError = null } = {}) {
  const lista = estadosList.map((item) => ({ ...item }))
  global.fetch = vi.fn(async (url, options = {}) => {
    const method = options?.method ?? 'GET'
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
    if (url.endsWith('/projects/1/task-statuses/order') && method === 'PUT') {
      if (orderError) return jsonResponse({ detail: orderError }, false, 409)
      const ids = JSON.parse(options.body).ids
      lista.splice(
        0,
        lista.length,
        ...ids.map((id) => lista.find((item) => item.id === id)),
      )
      return jsonResponse({})
    }
    if (/\/projects\/1\/task-statuses\/\d+/.test(url) && method === 'DELETE') {
      const id = Number(url.match(/\/task-statuses\/(\d+)/)[1])
      const donde = lista.findIndex((item) => item.id === id)
      if (donde !== -1) lista.splice(donde, 1)
      return jsonResponse(null, true, 204)
    }
    if (/\/projects\/1\/task-statuses\/\d+/.test(url) && method === 'PATCH') {
      return jsonResponse({ id: 12, key: 'en_desarrollo', label: 'En Desarrollo', color: '#1a7f37', progress: 50, task_count: 5 })
    }
    if (url.endsWith('/projects/1/task-statuses')) {
      if (method === 'POST') {
        if (postError) return jsonResponse({ detail: postError }, false, 409)
        const payload = JSON.parse(options.body)
        const nuevo = {
          id: 15,
          key: 'nuevo_estado',
          label: payload.label,
          color: payload.color,
          progress: payload.progress,
          task_count: 0,
        }
        lista.push(nuevo)
        return jsonResponse(nuevo)
      }
      return jsonResponse(lista)
    }
    if (url.endsWith('/projects/1') && method === 'PATCH') {
      return jsonResponse(projects[0])
    }
    if (url.endsWith('/projects')) return jsonResponse(projects)
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const pinia = createPinia()
  setActivePinia(pinia)
  // En el cuerpo del documento: la vista localiza botones por `data-testid`
  // con `document.querySelector` para devolver el foco tras reordenar.
  const contenedor = document.createElement('div')
  document.body.appendChild(contenedor)
  const wrapper = mount(ProjectSettingsView, {
    props: { id: 1 },
    global: { plugins: [pinia] },
    attachTo: contenedor,
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

/** Hex a la forma `rgb(r, g, b)` en que jsdom pinta el atributo `style`. */
function rgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff})`
}

afterEach(() => {
  // La vista se monta en el cuerpo del documento: cada test empieza limpio.
  document.body.innerHTML = ''
})

function llamadasA(urlParte, method) {
  return global.fetch.mock.calls.filter(
    ([url, options]) => url.includes(urlParte) && (options?.method ?? 'GET') === method,
  )
}

describe('ProjectSettingsView', () => {
  beforeEach(() => {
    localStorage.clear()
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
    expect(useToastStore().items.map((item) => item.message)).toContain('Proyecto guardado.')
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

describe('ProjectSettingsView · estados de tarea', () => {
  beforeEach(() => {
    localStorage.clear()
    setupFetch()
  })

  it('quien no es gerente no ve la seccion de estados', async () => {
    setupFetch({ isManager: false })

    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="task-statuses-section"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="new-task-status"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="task-statuses-table"]').exists()).toBe(false)
    expect(
      global.fetch.mock.calls.some(([url]) => url.includes('/task-statuses')),
    ).toBe(false)
  })

  it('lista los estados en el orden del servidor con etiqueta, color, avance y tareas', async () => {
    const wrapper = await mountView()

    const filas = wrapper.findAll('[data-testid="task-status-row"]')
    expect(filas.map((fila) => fila.attributes('data-status-key'))).toEqual([
      'nueva',
      'en_desarrollo',
      'revision',
      'completada',
    ])

    const primera = wrapper.find('[data-testid="task-status-row"][data-status-key="nueva"]')
    expect(primera.find('[data-testid="task-status-label"]').text()).toBe('Nueva')
    expect(
      primera.find('[data-testid="task-status-label"]').attributes('style'),
    ).toContain(rgb(pildora('#1f6feb').backgroundColor))
    expect(
      primera.find('[data-testid="task-status-key"]').text(),
    ).toBe('nueva · Azul')
    expect(
      primera.find('[data-testid="task-status-progress"]').text(),
    ).toBe('0 %')
    expect(
      primera.find('[data-testid="task-status-count"]').text(),
    ).toBe('3')

    const sinColor = wrapper.find('[data-testid="task-status-row"][data-status-key="revision"]')
    expect(sinColor.find('[data-testid="task-status-key"]').text()).toContain('Sin color')
    expect(
      sinColor.find('[data-testid="task-status-count"]').text(),
    ).toBe('0')
  })

  it('alta: abre el dialogo, guarda con la etiqueta, el color y el avance, y recarga', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="new-task-status"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="task-status-label-input"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Se añade al final del tablero')

    await wrapper.find('[data-testid="task-status-label-input"]').setValue('Planificación')
    await wrapper.find('[data-testid="task-status-progress-input"]').setValue('25')
    await wrapper.find('[data-testid="color-swatch-#1f6feb"]').trigger('click')
    await wrapper.find('[data-testid="task-status-save"]').trigger('click')
    await flushPromises()
    await flushPromises()

    const alta = llamadasA('/projects/1/task-statuses', 'POST')
    expect(alta.length).toBe(1)
    expect(JSON.parse(alta[0][1].body)).toEqual({
      label: 'Planificación',
      color: '#1f6feb',
      progress: 25,
    })
    // La lista se vuelve a pedir desde el servidor despues de la alta.
    expect(llamadasA('/projects/1/task-statuses', 'GET').length).toBeGreaterThan(1)
    expect(useToastStore().items.map((item) => item.message)).toContain('Estado creado.')
    expect(wrapper.find('[data-testid="task-status-label-input"]').exists()).toBe(false)
  })

  it('edicion: abre el dialogo con los datos del estado y la clave no se puede editar', async () => {
    const wrapper = await mountView()

    await wrapper
      .find('[data-testid="task-status-edit"][data-status-key="en_desarrollo"]')
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Editar estado')
    expect(wrapper.text()).toContain('Clave en_desarrollo: no se puede cambiar')
    expect(wrapper.find('[data-testid="task-status-label-input"]').element.value).toBe('En Desarrollo')
    expect(wrapper.find('[data-testid="task-status-progress-input"]').element.value).toBe('50')
    expect(
      wrapper.find('[data-testid="color-swatch-#1a7f37"]').attributes('aria-checked'),
    ).toBe('true')
    expect(
      wrapper.find('[data-testid="task-status-clear-color"]').exists(),
    ).toBe(true)
    // La clave no es un campo: no hay input que la edite.
    expect(wrapper.find('input[value="en_desarrollo"]').exists()).toBe(false)
  })

  it('reordenar: baja un estado con la lista completa de ids, deshabilita los extremos y recarga', async () => {
    const wrapper = await mountView()

    // Extremos: Subir deshabilitado en la primera fila, Bajar en la ultima.
    expect(
      wrapper
        .find('[data-testid="task-status-up"][data-status-key="nueva"]')
        .attributes('disabled'),
    ).toBeDefined()
    expect(
      wrapper
        .find('[data-testid="task-status-down"][data-status-key="completada"]')
        .attributes('disabled'),
    ).toBeDefined()

    await wrapper
      .find('[data-testid="task-status-down"][data-status-key="en_desarrollo"]')
      .trigger('click')
    await flushPromises()
    await flushPromises()

    const orden = llamadasA('/projects/1/task-statuses/order', 'PUT')
    expect(orden.length).toBe(1)
    expect(JSON.parse(orden[0][1].body)).toEqual({ ids: [11, 13, 12, 14] })
    expect(useToastStore().items.map((item) => item.message)).toContain(
      '«En Desarrollo» baja una posición.',
    )
    expect(llamadasA('/projects/1/task-statuses', 'GET').length).toBeGreaterThan(1)
  })

  it('reordenar: si el boton queda deshabilitado, el foco pasa al contrario de la fila', async () => {
    const wrapper = await mountView()

    // "Subir" en la segunda fila: al subir, la fila pasa a ser la primera y
    // su "Subir" queda deshabilitado; el foco va a su "Bajar".
    const subir = wrapper
      .find('[data-testid="task-status-up"][data-status-key="en_desarrollo"]')
    subir.element.focus()
    expect(document.activeElement).toBe(subir.element)

    await subir.trigger('click')
    await flushPromises()
    await flushPromises()

    expect(document.activeElement).toBe(
      wrapper
        .find('[data-testid="task-status-down"][data-status-key="en_desarrollo"]')
        .element,
    )
  })

  it('borrado con tareas: pide el destino, lo exige y llama al borrado con reassign_to', async () => {
    const wrapper = await mountView()

    await wrapper
      .find('[data-testid="task-status-delete"][data-status-key="en_desarrollo"]')
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain(
      '«En Desarrollo» tiene 5 tareas. Al borrarlo, sus tareas pasan al estado que elijas.',
    )
    expect(
      wrapper.find('[data-testid="task-status-delete-confirm"]').text(),
    ).toBe('Borrar y reasignar')
    expect(
      wrapper.find('[data-testid="task-status-delete-confirm"]').attributes('disabled'),
    ).toBeDefined()

    await wrapper
      .find('[data-testid="task-status-reassign-select"]')
      .setValue('completada')
    expect(
      wrapper.find('[data-testid="task-status-delete-confirm"]').attributes('disabled'),
    ).toBeUndefined()
    await wrapper.find('[data-testid="task-status-delete-confirm"]').trigger('click')
    await flushPromises()
    await flushPromises()

    const borrado = global.fetch.mock.calls.find(
      ([url, options]) => url.includes('/projects/1/task-statuses/12') && options.method === 'DELETE',
    )
    expect(borrado).toBeTruthy()
    expect(borrado[0]).toContain('reassign_to=completada')
    expect(useToastStore().items.map((item) => item.message)).toContain(
      '«En Desarrollo» borrado. Las 5 tareas pasan a «Completada».',
    )
  })

  it('borrado sin tareas: se confirma sin reasignar', async () => {
    const wrapper = await mountView()

    await wrapper
      .find('[data-testid="task-status-delete"][data-status-key="revision"]')
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain(
      '«Revisión» no tiene tareas. Se puede borrar sin reasignar.',
    )
    expect(
      wrapper.find('[data-testid="task-status-reassign-select"]').exists(),
    ).toBe(false)
    expect(
      wrapper.find('[data-testid="task-status-delete-confirm"]').text(),
    ).toBe('Borrar estado')
    expect(
      wrapper.find('[data-testid="task-status-delete-confirm"]').attributes('disabled'),
    ).toBeUndefined()

    await wrapper.find('[data-testid="task-status-delete-confirm"]').trigger('click')
    await flushPromises()
    await flushPromises()

    const borrado = global.fetch.mock.calls.find(
      ([url, options]) => url.includes('/projects/1/task-statuses/13') && options.method === 'DELETE',
    )
    expect(borrado).toBeTruthy()
    expect(borrado[0]).not.toContain('reassign_to')
    expect(useToastStore().items.map((item) => item.message)).toContain('Estado borrado.')
  })

  it('el ultimo estado no se puede borrar: boton deshabilitado y aviso', async () => {
    setupFetch({ estadosList: [estados[0]] })

    const wrapper = await mountView()

    expect(
      wrapper.find('[data-testid="task-statuses-last-note"]').text(),
    ).toBe(
      'El proyecto necesita al menos un estado: no se puede borrar el único que queda.',
    )
    expect(
      wrapper
        .find('[data-testid="task-status-delete"][data-status-key="nueva"]')
        .attributes('disabled'),
    ).toBeDefined()
  })

  it('un fallo de la API de alta sale en el dialogo, no como toast', async () => {
    setupFetch({
      postError: 'La clave planificacion ya existe en el proyecto',
    })

    const wrapper = await mountView()

    await wrapper.find('[data-testid="new-task-status"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="task-status-label-input"]').setValue('Planificación')
    await wrapper.find('[data-testid="task-status-save"]').trigger('click')
    await flushPromises()

    expect(
      wrapper.find('[data-testid="task-status-form-error"]').text(),
    ).toContain('La clave planificacion ya existe en el proyecto')
    // El dialogo sigue abierto y no hay toast de error.
    expect(wrapper.find('[data-testid="task-status-label-input"]').exists()).toBe(true)
    expect(
      useToastStore().items.map((item) => item.message),
    ).not.toContain('La clave planificacion ya existe en el proyecto')
  })

  it('un fallo de la API de reordenado sale en la seccion, no como toast', async () => {
    setupFetch({
      orderError: 'El orden no coincide con los estados del proyecto',
    })

    const wrapper = await mountView()

    await wrapper
      .find('[data-testid="task-status-down"][data-status-key="nueva"]')
      .trigger('click')
    await flushPromises()
    await flushPromises()

    expect(
      wrapper.find('[data-testid="task-statuses-action-error"]').text(),
    ).toContain('El orden no coincide con los estados del proyecto')
    expect(
      useToastStore().items.map((item) => item.message),
    ).not.toContain('El orden no coincide con los estados del proyecto')
  })
})
