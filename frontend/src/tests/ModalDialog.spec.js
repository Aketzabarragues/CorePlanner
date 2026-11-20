import { h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ModalDialog from '../components/ModalDialog.vue'

describe('ModalDialog', () => {
  it('el boton del pie con el submit del slot envia el formulario del cuerpo', async () => {
    const enviado = ref(false)

    const harness = {
      components: { ModalDialog },
      setup() {
        return () =>
          h(
            ModalDialog,
            { open: true, title: 'Prueba' },
            {
              default: () =>
                h(
                  'form',
                  {
                    id: 'form-prueba',
                    onSubmit: (evento) => {
                      evento.preventDefault()
                      enviado.value = true
                    },
                  },
                  [h('input', { type: 'text', placeholder: 'Titulo' })],
                ),
              footer: ({ submit }) =>
                h(
                  'button',
                  { type: 'button', 'data-testid': 'guardar', onClick: submit },
                  'Guardar',
                ),
            },
          )
      },
    }

    const wrapper = mount(harness)
    await wrapper.find('[data-testid="guardar"]').trigger('click')

    expect(enviado.value).toBe(true)
  })
})
