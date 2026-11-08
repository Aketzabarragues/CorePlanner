import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import ModalDialog from '../components/ModalDialog.vue'

/** Dialogo de prueba con dos botones dentro. */
const Montaje = {
  components: { ModalDialog },
  data() {
    return { abierto: false }
  },
  template: `
    <div>
      <button type="button" data-testid="abridor" @click="abierto = true">Abrir</button>
      <ModalDialog :open="abierto" title="Prueba" @close="abierto = false">
        <button type="button" data-testid="uno">Uno</button>
        <button type="button" data-testid="dos">Dos</button>
      </ModalDialog>
    </div>
  `,
}

let montajes = []

function montar() {
  const wrapper = mount(Montaje, { attachTo: document.body })
  montajes.push(wrapper)
  return wrapper
}

async function abrir(wrapper) {
  const abridor = wrapper.get('[data-testid="abridor"]')
  abridor.element.focus()
  await abridor.trigger('click')
  await flushPromises()
}

function pulsar(key, opciones = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, ...opciones }))
}

afterEach(() => {
  for (const wrapper of montajes) wrapper.unmount()
  montajes = []
  document.body.style.overflow = ''
})

describe('comportamiento de los dialogos', () => {
  it('Esc pide el cierre', async () => {
    const wrapper = montar()
    await abrir(wrapper)

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    pulsar('Escape')
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('el fondo deja de desplazarse mientras el dialogo esta abierto', async () => {
    const wrapper = montar()
    await abrir(wrapper)

    expect(document.body.style.overflow).toBe('hidden')
  })

  it('al cerrarse, el fondo vuelve a desplazarse', async () => {
    const wrapper = montar()
    await abrir(wrapper)

    pulsar('Escape')
    await flushPromises()

    expect(document.body.style.overflow).toBe('')
  })

  it('el foco entra en el dialogo', async () => {
    const wrapper = montar()
    await abrir(wrapper)

    expect(document.activeElement).toBe(wrapper.get('[data-testid="modal-close"]').element)
  })

  it('Tab salta del ultimo elemento al primero', async () => {
    const wrapper = montar()
    await abrir(wrapper)

    wrapper.get('[data-testid="dos"]').element.focus()
    pulsar('Tab')
    await flushPromises()

    expect(document.activeElement).toBe(wrapper.get('[data-testid="modal-close"]').element)
  })

  it('Shift+Tab salta del primer elemento al ultimo', async () => {
    const wrapper = montar()
    await abrir(wrapper)

    wrapper.get('[data-testid="modal-close"]').element.focus()
    pulsar('Tab', { shiftKey: true })
    await flushPromises()

    expect(document.activeElement).toBe(wrapper.get('[data-testid="dos"]').element)
  })

  it('al cerrarse, el foco vuelve al elemento que abrio el dialogo', async () => {
    const wrapper = montar()
    await abrir(wrapper)

    pulsar('Escape')
    await flushPromises()

    expect(document.activeElement).toBe(wrapper.get('[data-testid="abridor"]').element)
  })

  it('un dialogo cerrado no atrapa el foco', async () => {
    const wrapper = montar()

    pulsar('Escape')
    await flushPromises()

    expect(document.body.style.overflow).toBe('')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})
