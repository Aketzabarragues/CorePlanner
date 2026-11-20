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

describe('props y slots nuevos', () => {
  it('el titulo se expone via aria-labelledby apuntando al h2', async () => {
    const wrapper = mount(ModalDialog, {
      props: { open: true, title: 'Mi dialogo' },
      attachTo: document.body,
    })
    montajes.push(wrapper)
    await flushPromises()

    const dialog = wrapper.find('[role="dialog"]')
    const labelledby = dialog.attributes('aria-labelledby')
    // El id existe, no depende del texto del titulo
    expect(labelledby).toBeTruthy()
    expect(labelledby).not.toContain('Mi dialogo')
    // El h2 referenciado existe y contiene el titulo
    expect(wrapper.find('h2').text()).toBe('Mi dialogo')
    expect(wrapper.find('h2').attributes('id')).toBe(labelledby)
  })

  it('dos instancias con el mismo titulo tienen aria-labelledby distintos', async () => {
    // Ambas instancias en el mismo arbol para que useId() incremente el contador
    const DobleDialog = {
      components: { ModalDialog },
      template: `
        <div>
          <ModalDialog :open="true" title="Igual" data-instance="a" />
          <ModalDialog :open="true" title="Igual" data-instance="b" />
        </div>
      `,
    }
    const wrapper = mount(DobleDialog, { attachTo: document.body })
    montajes.push(wrapper)
    await flushPromises()

    const dialogos = wrapper.findAll('[role="dialog"]')
    expect(dialogos.length).toBe(2)
    const id1 = dialogos[0].attributes('aria-labelledby')
    const id2 = dialogos[1].attributes('aria-labelledby')
    expect(id1).toBeTruthy()
    expect(id2).toBeTruthy()
    expect(id1).not.toBe(id2)
  })

  it('el subtitulo se pinta cuando se pasa', async () => {
    const wrapper = mount(ModalDialog, {
      props: { open: true, title: 'T', subtitle: 'Descripcion de apoyo' },
      attachTo: document.body,
    })
    montajes.push(wrapper)
    await flushPromises()

    expect(wrapper.find('[data-testid="modal-subtitle"]').text()).toBe('Descripcion de apoyo')
  })

  it('el subtitulo no aparece si no se pasa', async () => {
    const wrapper = mount(ModalDialog, {
      props: { open: true, title: 'T' },
      attachTo: document.body,
    })
    montajes.push(wrapper)
    await flushPromises()

    expect(wrapper.find('[data-testid="modal-subtitle"]').exists()).toBe(false)
  })

  it('size=sm aplica max-w-md a la caja del dialogo', async () => {
    const wrapper = mount(ModalDialog, {
      props: { open: true, title: 'T', size: 'sm' },
      attachTo: document.body,
    })
    montajes.push(wrapper)
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').classes()).toContain('max-w-md')
  })

  it('size=lg aplica max-w-3xl a la caja del dialogo', async () => {
    const wrapper = mount(ModalDialog, {
      props: { open: true, title: 'T', size: 'lg' },
      attachTo: document.body,
    })
    montajes.push(wrapper)
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').classes()).toContain('max-w-3xl')
  })

  it('size=xl aplica max-w-5xl a la caja del dialogo', async () => {
    const wrapper = mount(ModalDialog, {
      props: { open: true, title: 'T', size: 'xl' },
      attachTo: document.body,
    })
    montajes.push(wrapper)
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').classes()).toContain('max-w-5xl')
  })

  it('size=md (por defecto) aplica max-w-lg a la caja del dialogo', async () => {
    const wrapper = mount(ModalDialog, {
      props: { open: true, title: 'T' },
      attachTo: document.body,
    })
    montajes.push(wrapper)
    await flushPromises()

    expect(wrapper.find('[role="dialog"]').classes()).toContain('max-w-lg')
  })

  it('el slot footer se renderiza dentro del pie', async () => {
    const wrapper = mount(ModalDialog, {
      props: { open: true, title: 'T' },
      slots: { footer: '<button data-testid="accion-footer">Guardar</button>' },
      attachTo: document.body,
    })
    montajes.push(wrapper)
    await flushPromises()

    expect(wrapper.find('[data-testid="accion-footer"]').exists()).toBe(true)
  })

  it('el pie no aparece si no se pasa el slot footer', async () => {
    const wrapper = mount(ModalDialog, {
      props: { open: true, title: 'T' },
      attachTo: document.body,
    })
    montajes.push(wrapper)
    await flushPromises()

    expect(wrapper.find('[data-testid="modal-footer"]').exists()).toBe(false)
  })

  it('el boton de cierre emite el evento close', async () => {
    const wrapper = mount(ModalDialog, {
      props: { open: true, title: 'T' },
      attachTo: document.body,
    })
    montajes.push(wrapper)
    await flushPromises()

    await wrapper.find('[data-testid="modal-close"]').trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(wrapper.emitted('close').length).toBeGreaterThan(0)
  })
})
