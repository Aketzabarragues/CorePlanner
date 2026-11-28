import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import DepartmentsView from '../views/DepartmentsView.vue'

const departments = [
  { id: 1, name: 'Automatización & SCADA', manager_id: 1, manager_name: 'Ana', color: '#005566' },
  { id: 2, name: 'Oficina Técnica / EPLAN', manager_id: 3, manager_name: 'Jorge', color: '#1f6feb' },
  { id: 3, name: 'Energía', manager_id: 2, manager_name: 'Sebastian', color: '#f59e0b' },
]

const projects = [
  {
    id: 1,
    name: '26009 - FLUID SYSTEM - Pasteurizador',
    status: 'active',
    department_id: 1,
    color: '#0e7490',
  },
  { id: 2, name: 'Red de tuberias linea 2', status: 'on_hold', department_id: 2 },
  { id: 3, name: 'Ampliacion linea 3', status: 'active', department_id: null },
]

const people = [
  { id: 1, name: 'Ana', email: 'ana@example.com', department_id: 1 },
  { id: 2, name: 'Sebastian', email: 'sebastian@example.com', department_id: 1 },
  { id: 3, name: 'Jorge', email: 'jorge@example.com', department_id: 2 },
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
    if (url.endsWith('/departments')) return jsonResponse(departments)
    if (url.endsWith('/projects')) return jsonResponse(projects)
    if (url.endsWith('/people')) return jsonResponse(people)
    return jsonResponse({ detail: 'no encontrado' }, false, 404)
  })
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/projects/:id', name: 'project', component: { render: () => null } }],
  })
  await router.push('/projects/1')
  await router.isReady()
  const wrapper = mount(DepartmentsView, {
    global: { plugins: [createPinia(), router] },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('DepartmentsView', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    setupFetch()
  })

  it('dibuja una tarjeta por departamento en la rejilla', async () => {
    const wrapper = await mountView()

    const rejilla = wrapper.find('[data-testid="departments-grid"]')
    expect(rejilla.classes()).toEqual(
      expect.arrayContaining(['grid', 'items-stretch', 'gap-4', 'xl:grid-cols-3']),
    )
    const tarjetas = rejilla.findAll('section')
    expect(tarjetas).toHaveLength(3)
    expect(tarjetas[0].text()).toContain('Automatización & SCADA')
    expect(tarjetas[1].text()).toContain('Oficina Técnica / EPLAN')
    expect(tarjetas[2].text()).toContain('Energía')
  })

  it('muestra el responsable con avatar y nombre en negrita', async () => {
    const wrapper = await mountView()

    const cabeceras = wrapper
      .findAll('section')
      .map((seccion) => seccion.findAll('.min-w-0.flex-1 p'))
      .map((lista) => lista[0])
    // Etiqueta "Responsable:" y nombre de cada area.
    expect(cabeceras[0].text()).toContain('Responsable:')
    expect(cabeceras[1].text()).toContain('Jorge')
    expect(cabeceras[2].text()).toContain('Sebastian')
    // PersonAvatar xs: iniciales y pastel del color del area, texto legible.
    const avatar = cabeceras[0].find('span[style]')
    expect(avatar.text()).toBe('AN')
    expect(avatar.attributes('style')).toContain('background-color: rgb(224, 235, 237)')
    // El nombre va en negrita junto al avatar.
    expect(cabeceras[0].find('.font-semibold').find('span.truncate').text()).toBe('Ana')
  })

  it('coloca bajo cada departamento sus proyectos', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('FLUID SYSTEM - Pasteurizador')
    expect(wrapper.text()).toContain('Red de tuberias linea 2')
    expect(wrapper.text()).toContain('Activo')
    expect(wrapper.text()).toContain('Pausado')
  })

  it('deja aparte los proyectos sin departamento', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('Sin departamento')
    expect(wrapper.text()).toContain('Ampliacion linea 3')
  })

  it('enlaza cada proyecto con su resumen', async () => {
    const wrapper = await mountView()

    const enlace = wrapper.findAll('a').find((a) => a.text().includes('Pasteurizador'))
    expect(enlace.attributes('href')).toBe('/projects/1')
  })

  it('el icono del departamento va con su color en estilo en linea', async () => {
    const wrapper = await mountView()

    const seccion = wrapper.findAll('section')[0]
    const icono = seccion.find('[style]')
    // Tinte claro del color para el fondo y el color oscurecido para el trazo.
    expect(icono.attributes('style')).toContain('background-color: rgb(217, 230, 232)')
    expect(icono.attributes('style')).toContain('color: rgb(0, 55, 66)')
  })

  it('la cabecera cuenta areas operativas y proyectos activos', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="departments-context"]').text()).toBe(
      '3 áreas operativas · 2 proyectos activos',
    )
  })

  it('la tarjeta cuenta sus proyectos y etiqueta la lista', async () => {
    const wrapper = await mountView()

    const seccion = wrapper.findAll('section')[0]
    expect(seccion.find('[data-testid="department-projects-count"]').text()).toBe('1 proy.')
    // La etiqueta va en versal por CSS: el texto sigue en su forma natural.
    const etiqueta = seccion.findAll('p').find((elemento) =>
      elemento.classes().includes('uppercase'),
    )
    expect(etiqueta.text()).toBe('Proyectos gestionados')
  })

  it('la fila de proyecto lleva franja de color, codigo en mono y estado con punto', async () => {
    const wrapper = await mountView()

    const seccion = wrapper.findAll('section')[0]
    const enlace = seccion.find('a[href="/projects/1"]')
    expect(enlace.text()).toContain('26009')
    expect(enlace.text()).toContain('FLUID SYSTEM - Pasteurizador')
    // La franja usa el color del proyecto (dato del backend) en estilo en linea.
    const franja = enlace.find('span[style]')
    expect(franja.attributes('style')).toContain('background-color: rgb(14, 116, 144)')
    // La pastilla de estado va con el punto de color.
    const pastilla = seccion.find('a[href="/projects/1"] ~ *')
    expect(pastilla.text()).toBe('Activo')
  })

  it('el pie de la tarjeta cuenta miembros y apila avatares con el color del area', async () => {
    const wrapper = await mountView()

    const seccion = wrapper.findAll('section')[0]
    expect(seccion.find('[data-testid="department-members"]').text()).toBe('2 miembros en el area')
    const avatares = seccion.findAll('[data-testid="department-member"]')
    expect(avatares).toHaveLength(2)
    // PersonAvatar sm: el pastel del color del area (dato del backend).
    expect(avatares[0].attributes('style')).toContain('background-color: rgb(224, 235, 237)')
    // Apilados: anillo de tarjeta y solapamiento de un token.
    expect(avatares[0].classes()).toContain('ring-2')
    expect(avatares[1].classes()).toContain('-ml-1.5')
  })
})
