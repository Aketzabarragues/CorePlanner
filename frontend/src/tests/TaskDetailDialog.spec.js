import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import TaskDetailDialog from '../components/TaskDetailDialog.vue'

const AHORA = new Date(2026, 10, 8, 19, 30)

function haceMinutos(minutos) {
  return new Date(AHORA.getTime() - minutos * 60 * 1000).toISOString()
}

const tarea = {
  id: 1,
  project_id: 1,
  assigned_to: 2,
  title: 'Revision del PLC',
  status: 'in_progress',
  description: 'Revisar los bloques SCL',
  start_date: '2026-11-16',
  end_date: '2026-11-18',
  estimated_hours: 8,
}

const equipo = [{ user_id: 2, name: 'Sebastian', role_name: 'Ingeniero' }]

const comentarios = [
  {
    id: 1,
    task_id: 1,
    author_id: 2,
    author_name: 'Sebastian',
    body: 'Empezamos por el bloque 3.',
    created_at: haceMinutos(10),
  },
]

const checklist = [
  { id: 5, task_id: 1, label: 'Revisar el programa', done: false, position: 1 },
]

const imputaciones = [
  {
    id: 1,
    task_id: 1,
    user_id: 9,
    user_name: 'Admin',
    work_date: '2026-11-05',
    hours: '6.50',
    note: 'Montaje y prueba',
    created_at: haceMinutos(0),
  },
  {
    id: 2,
    task_id: 1,
    user_id: 2,
    user_name: 'Sebastian',
    work_date: '2026-11-06',
    hours: '3.00',
    note: null,
    created_at: haceMinutos(0),
  },
]

const entradas = [
  {
    id: 9,
    actor_id: 2,
    actor_name: 'Sebastian',
    action: 'task.moved',
    entity_type: 'task',
    entity_id: 1,
    project_id: 1,
    project_name: 'Linea Pasteurizadora',
    payload: { title: 'Revision del PLC', from: 'backlog', to: 'in_progress' },
    created_at: haceMinutos(5),
  },
]

/**
 * Monta el panel con el servidor simulado.
 *
 * El estado de comentarios, checklist y actividad se guarda en variables, de
 * modo que lo que se anade se ve en la siguiente lectura, como en el servidor.
 */
function setupFetch({
  comments = [...comentarios],
  items = [...checklist],
  activity = [...entradas],
  timeEntries = [...imputaciones],
} = {}) {
  const calls = []
  global.fetch = vi.fn(async (url, options = {}) => {
    const method = options.method ?? 'GET'
    calls.push({ url, method, body: options.body })

    if (url.endsWith('/auth/login')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'tok', user: { id: 9, name: 'Admin' } }),
      }
    }
    if (url.includes('/activity')) {
      return { ok: true, status: 200, json: async () => ({ items: activity, total: activity.length }) }
    }
    if (url.endsWith('/comments') && method === 'POST') {
      comments.push({
        id: comments.length + 1,
        task_id: 1,
        author_id: 2,
        author_name: 'Sebastian',
        body: JSON.parse(options.body).body,
        created_at: haceMinutos(0),
      })
      activity.unshift({
        id: activity.length + 1,
        actor_id: 2,
        actor_name: 'Sebastian',
        action: 'task.commented',
        entity_type: 'task',
        entity_id: 1,
        project_id: 1,
        project_name: 'Linea Pasteurizadora',
        payload: { title: 'Revision del PLC', body: 'Nuevo comentario' },
        created_at: haceMinutos(0),
      })
      return { ok: true, status: 201, json: async () => comments[comments.length - 1] }
    }
    if (url.endsWith('/comments')) {
      return { ok: true, status: 200, json: async () => comments }
    }
    if (url.endsWith('/checklist') && method === 'POST') {
      items.push({
        id: items.length + 5,
        task_id: 1,
        label: JSON.parse(options.body).label,
        done: false,
        position: items.length + 1,
      })
      return { ok: true, status: 201, json: async () => items[items.length - 1] }
    }
    if (/\/checklist\/\d+$/.test(url) && method === 'PATCH') {
      const cambios = JSON.parse(options.body)
      const item = items.find((punto) => punto.id === Number(url.split('/').pop()))
      if (cambios.done !== undefined) item.done = cambios.done
      if (cambios.label !== undefined) item.label = cambios.label
      return { ok: true, status: 200, json: async () => item }
    }
    if (/\/checklist\/\d+$/.test(url) && method === 'DELETE') {
      const id = Number(url.split('/').pop())
      const indice = items.findIndex((punto) => punto.id === id)
      items.splice(indice, 1)
      return { ok: true, status: 204, json: async () => null }
    }
    if (url.endsWith('/checklist')) {
      return { ok: true, status: 200, json: async () => items }
    }
    if (url.includes('/time-entries') && method === 'DELETE') {
      const id = Number(url.split('/').pop())
      const indice = timeEntries.findIndex((entry) => entry.id === id)
      timeEntries.splice(indice, 1)
      return { ok: true, status: 204, json: async () => null }
    }
    if (url.includes('/time-entries') && method === 'POST') {
      const cuerpo = JSON.parse(options.body)
      timeEntries.push({
        id: timeEntries.length + 1,
        task_id: 1,
        user_id: 9,
        user_name: 'Admin',
        work_date: cuerpo.work_date,
        hours: cuerpo.hours,
        note: cuerpo.note ?? null,
        created_at: haceMinutos(0),
      })
      return { ok: true, status: 201, json: async () => timeEntries[timeEntries.length - 1] }
    }
    if (url.includes('/time-entries')) {
      // Como el servidor: cada respuesta trae su propia copia del array.
      return { ok: true, status: 200, json: async () => timeEntries.map((entry) => ({ ...entry })) }
    }
    if (url.endsWith('/members')) {
      return { ok: true, status: 200, json: async () => equipo }
    }
    if (url.endsWith('/api/tasks/1') && method === 'PATCH') {
      return { ok: true, status: 200, json: async () => ({ ...tarea, ...JSON.parse(options.body) }) }
    }
    if (url.endsWith('/api/tasks/1') && method === 'DELETE') {
      return { ok: true, status: 204, json: async () => null }
    }
    if (url.endsWith('/api/tasks/1')) {
      return { ok: true, status: 200, json: async () => ({ ...tarea }) }
    }
    return { ok: true, status: 200, json: async () => ({}) }
  })
  return calls
}

async function mountPanel({ canEdit = true } = {}) {
  const wrapper = mount(TaskDetailDialog, {
    props: { open: true, taskId: 1, canEdit },
    global: { plugins: [createPinia()] },
  })
  await flushPromises()
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('TaskDetailDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(AHORA)
  })

  it('enseña los datos de la tarea', async () => {
    setupFetch()

    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('Revision del PLC')
    expect(wrapper.find('[data-testid="task-description"]').element.value).toBe(
      'Revisar los bloques SCL',
    )
    expect(wrapper.find('[data-testid="task-status"]').element.value).toBe('in_progress')
  })

  it('guarda la descripcion y solo lo que ha cambiado', async () => {
    const calls = setupFetch()
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="task-description"]').setValue('Nuevo texto')
    await wrapper.find('[data-testid="task-save"]').trigger('click')
    await flushPromises()

    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body)).toEqual({ description: 'Nuevo texto' })
  })

  it('anade un punto a la lista de comprobacion', async () => {
    const calls = setupFetch()
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="checklist-new"]').setValue('Revisar el HMI')
    await wrapper.find('[data-testid="checklist-add"]').trigger('submit')
    await flushPromises()

    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/checklist'))
    expect(post).toBeDefined()
    expect(JSON.parse(post.body)).toEqual({ label: 'Revisar el HMI' })
    expect(wrapper.findAll('[data-testid="checklist-item"]')).toHaveLength(2)
  })

  it('marca y desmarca un punto de la lista', async () => {
    const calls = setupFetch()
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="checklist-toggle"]').setValue(true)
    await flushPromises()

    const patch = calls.find((call) => call.method === 'PATCH' && call.url.includes('/checklist'))
    expect(patch).toBeDefined()
    expect(JSON.parse(patch.body)).toEqual({ done: true })
  })

  it('quita un punto de la lista', async () => {
    const calls = setupFetch()
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="checklist-remove"]').trigger('click')
    await flushPromises()

    const deleteCall = calls.find((call) => call.method === 'DELETE')
    expect(deleteCall).toBeDefined()
    expect(deleteCall.url).toContain('/checklist/5')
  })

  it('anade un comentario y lo muestra', async () => {
    const calls = setupFetch()
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="comment-new"]').setValue('Hay que revisar el bloque 3')
    await wrapper.find('[data-testid="comment-add"]').trigger('submit')
    await flushPromises()

    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/comments'))
    expect(post).toBeDefined()
    expect(JSON.parse(post.body)).toEqual({ body: 'Hay que revisar el bloque 3' })
    expect(wrapper.findAll('[data-testid="comment"]')).toHaveLength(2)
  })

  it('el comentario aparece en la actividad sin recargar', async () => {
    setupFetch()
    const wrapper = await mountPanel()

    expect(wrapper.findAll('[data-testid="task-activity-entry"]')).toHaveLength(1)

    await wrapper.find('[data-testid="comment-new"]').setValue('Un comentario')
    await wrapper.find('[data-testid="comment-add"]').trigger('submit')
    await flushPromises()

    const entradas = wrapper.findAll('[data-testid="task-activity-entry"]')
    expect(entradas).toHaveLength(2)
    expect(entradas[0].text()).toContain('comentó la tarea «Revision del PLC»')
  })

  it('la actividad pide solo la de esa tarea', async () => {
    const calls = setupFetch()
    await mountPanel()

    const llamada = calls.find((call) => call.url.includes('/activity'))
    expect(llamada.url).toContain('entity_type=task')
    expect(llamada.url).toContain('entity_id=1')
  })

  it('eliminar la tarea pide confirmacion y la borra', async () => {
    const calls = setupFetch()
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="task-delete"]').trigger('click')
    expect(wrapper.find('[data-testid="task-delete-confirm"]').exists()).toBe(true)

    await wrapper.find('[data-testid="task-delete-confirm"]').trigger('click')
    await flushPromises()

    const deleteCall = calls.find((call) => call.method === 'DELETE')
    expect(deleteCall).toBeDefined()
    expect(deleteCall.url).toContain('/api/tasks/1')
    expect(wrapper.emitted('deleted')).toBeTruthy()
  })

  it('sin permiso de escritura los campos van deshabilitados', async () => {
    setupFetch()

    const wrapper = await mountPanel({ canEdit: false })

    expect(wrapper.find('[data-testid="task-description"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="comment-new"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="checklist-new"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="task-delete"]').exists()).toBe(false)
  })

  it('la seccion de horas lista las imputaciones con su total', async () => {
    setupFetch()
    const wrapper = await mountPanel()

    const items = wrapper.findAll('[data-testid="time-entry"]')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('2026-11-05')
    expect(items[0].text()).toContain('6.50 h')
    expect(items[0].text()).toContain('Admin')
    expect(items[0].text()).toContain('Montaje y prueba')
    expect(items[1].text()).toContain('Sebastian')
    // 6.5 + 3 = 9.5 h.
    expect(wrapper.text()).toContain('total 9.5 h')
  })

  it('imputar manda el POST con fecha y horas y recarga la lista', async () => {
    const calls = setupFetch()
    const wrapper = await mountPanel()

    await wrapper.find('[data-testid="time-entry-date"]').setValue('2026-11-10')
    await wrapper.find('[data-testid="time-entry-hours"]').setValue('4')
    await wrapper.find('[data-testid="time-entry-note"]').setValue('Pruebas en planta')
    await wrapper.find('[data-testid="time-entry-add"]').trigger('submit')
    await flushPromises()

    const post = calls.find(
      (call) => call.method === 'POST' && call.url.includes('/time-entries'),
    )
    expect(JSON.parse(post.body)).toEqual({
      work_date: '2026-11-10',
      hours: '4.00',
      note: 'Pruebas en planta',
    })
    expect(wrapper.findAll('[data-testid="time-entry"]')).toHaveLength(3)
    expect(wrapper.text()).toContain('total 13.5 h')
  })

  it('la imputacion propia se puede borrar y la ajena no trae boton', async () => {
    const calls = setupFetch()
    const wrapper = await mountPanel()

    const items = wrapper.findAll('[data-testid="time-entry"]')
    expect(items[0].find('[data-testid="time-entry-remove"]').exists()).toBe(true)
    expect(items[1].find('[data-testid="time-entry-remove"]').exists()).toBe(false)

    await items[0].find('[data-testid="time-entry-remove"]').trigger('click')
    await flushPromises()

    const deleteCall = calls.find(
      (call) => call.method === 'DELETE' && call.url.includes('/time-entries/'),
    )
    expect(deleteCall.url).toContain('/api/time-entries/1')
    expect(wrapper.findAll('[data-testid="time-entry"]')).toHaveLength(1)
    expect(wrapper.text()).toContain('total 3 h')
  })

  it('sin permiso de escritura la seccion de horas va en solo lectura', async () => {
    setupFetch()

    const wrapper = await mountPanel({ canEdit: false })

    expect(wrapper.findAll('[data-testid="time-entry"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="time-entry-add"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="time-entry-remove"]').exists()).toBe(false)
  })
})
