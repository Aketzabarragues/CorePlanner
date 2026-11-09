import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'

import VisibilityPanel from '../components/common/VisibilityPanel.vue'
import { useVisibilidad } from '../composables/useVisibilidad'

/** Personas de prueba: dos del departamento 1 y una sin departamento. */
const PERSONAS = [
  { id: 1, name: 'Ana', department_id: 1, department_name: 'Alimentacion' },
  { id: 2, name: 'Sebastian', department_id: 1, department_name: 'Alimentacion' },
  { id: 3, name: 'Nerea', department_id: null, department_name: null },
]

let montajes = []

function montar(props = {}) {
  const wrapper = mount(VisibilityPanel, {
    props: {
      personas: PERSONAS,
      idsOcultos: [],
      departamentosOcultos: [],
      ocultosCount: 0,
      ...props,
    },
    attachTo: document.body,
  })
  montajes.push(wrapper)
  return wrapper
}

/** Monta el composable con una lista de personas. */
function montarComposable(personas = PERSONAS) {
  const lista = ref(personas)
  const estado = useVisibilidad(lista)
  return { lista, ...estado }
}

afterEach(() => {
  for (const wrapper of montajes) wrapper.unmount()
  montajes = []
})

describe('useVisibilidad', () => {
  it('esconde una persona y cuenta las que quedan fuera', () => {
    const { idsOcultos, ocultosCount, alternarPersona } = montarComposable()

    alternarPersona(1)

    expect(idsOcultos.value).toEqual(['1'])
    expect(ocultosCount.value).toBe(1)
  })

  it('esconder un departamento esconde a todos sus miembros', () => {
    const { idsOcultos, ocultosCount, alternarDepartamento } = montarComposable()

    alternarDepartamento('1')

    expect(idsOcultos.value).toEqual(['1', '2'])
    expect(ocultosCount.value).toBe(2)
  })

  it('la persona sin departamento se agrupa aparte', () => {
    const { idsOcultos, alternarDepartamento } = montarComposable()

    alternarDepartamento('sin')

    expect(idsOcultos.value).toEqual(['3'])
  })

  it('mostrar a todos deja la vista como estaba', () => {
    const { idsOcultos, ocultosCount, alternarPersona, mostrarTodos } = montarComposable()

    alternarPersona(1)
    mostrarTodos()

    expect(idsOcultos.value).toEqual([])
    expect(ocultosCount.value).toBe(0)
  })

  it('marcar a una persona de un departamento escondido no cambia quien se ve', () => {
    const { idsOcultos, alternarDepartamento, alternarPersona } = montarComposable()

    alternarDepartamento('1')
    alternarPersona(1)

    // El departamento se muestra y sus companeros se esconden: solo cambia
    // quien se ve, no quien esta escondido.
    expect(idsOcultos.value).toEqual(['2'])
  })

  it('una persona escondida sigue escondida aunque ya no este en la lista', () => {
    const { lista, alternarPersona, ocultoPara } = montarComposable()

    alternarPersona(1)
    lista.value = PERSONAS.slice(1)

    expect(ocultoPara(1)).toBe(true)
    expect(ocultoPara(3)).toBe(false)
  })
})

describe('VisibilityPanel', () => {
  it('el boton es cuadrado y el contador sigue en pastilla', async () => {
    const wrapper = montar({ ocultosCount: 1 })

    const boton = wrapper.get('[data-testid="toggle-visibility"]')
    expect(boton.classes()).toContain('rounded')
    expect(boton.classes()).not.toContain('rounded-full')

    const contador = wrapper.get('[data-testid="hidden-count"]')
    expect(contador.classes()).toContain('rounded-full')
    expect(contador.text()).toContain('1 oculto')
  })

  it('abre y cierra el panel', async () => {
    const wrapper = montar()

    await wrapper.get('[data-testid="toggle-visibility"]').trigger('click')
    expect(wrapper.find('[data-testid="visibility-panel"]').exists()).toBe(true)

    await wrapper.get('[data-testid="toggle-visibility"]').trigger('click')
    expect(wrapper.find('[data-testid="visibility-panel"]').exists()).toBe(false)
  })

  it('se cierra al pulsar fuera', async () => {
    const wrapper = montar()
    await wrapper.get('[data-testid="toggle-visibility"]').trigger('click')
    expect(wrapper.find('[data-testid="visibility-panel"]').exists()).toBe(true)

    document.body.click()
    await flushPromises()

    expect(wrapper.find('[data-testid="visibility-panel"]').exists()).toBe(false)
  })

  it('agrupa a las personas por departamento', async () => {
    const wrapper = montar()
    await wrapper.get('[data-testid="toggle-visibility"]').trigger('click')

    expect(wrapper.find('[data-testid="hide-department-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hide-department-sin"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hide-person-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="hide-person-3"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Alimentacion')
    expect(wrapper.text()).toContain('Sin departamento')
  })

  it('las casillas reflejan lo que esta escondido', async () => {
    const wrapper = montar({ idsOcultos: ['1', '2'], departamentosOcultos: ['1'] })
    await wrapper.get('[data-testid="toggle-visibility"]').trigger('click')

    expect(wrapper.get('[data-testid="hide-department-1"]').element.checked).toBe(true)
    expect(wrapper.get('[data-testid="hide-person-1"]').element.checked).toBe(true)
    expect(wrapper.get('[data-testid="hide-person-3"]').element.checked).toBe(false)
  })

  it('devuelve lo que se pulsa', async () => {
    const wrapper = montar()
    await wrapper.get('[data-testid="toggle-visibility"]').trigger('click')

    await wrapper.get('[data-testid="hide-person-2"]').trigger('change')
    expect(wrapper.emitted('alternar-persona')[0]).toEqual([2])

    await wrapper.get('[data-testid="hide-department-1"]').trigger('change')
    expect(wrapper.emitted('alternar-departamento')[0]).toEqual(['1'])
  })

  it('mostrar todos solo aparece cuando hay alguien escondido', async () => {
    const wrapper = montar()
    await wrapper.get('[data-testid="toggle-visibility"]').trigger('click')
    expect(wrapper.find('[data-testid="show-all"]').exists()).toBe(false)

    await wrapper.setProps({ ocultosCount: 2 })
    const boton = wrapper.get('[data-testid="show-all"]')
    await boton.trigger('click')

    expect(wrapper.emitted('mostrar-todos')).toHaveLength(1)
  })
})
