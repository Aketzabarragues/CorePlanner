import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import ToastHost from '../components/common/ToastHost.vue'
import { useToastStore } from '../stores/toast'

describe('ToastHost', () => {
  function montar() {
    const pinia = createPinia()
    setActivePinia(pinia)
    return mount(ToastHost, { global: { plugins: [pinia] } })
  }

  afterEach(() => {
    useToastStore().clear()
  })

  it('pinta el aviso del store con su mensaje y su variante', async () => {
    const wrapper = montar()
    const store = useToastStore()

    store.success('Tarea «Cableado» creada.')
    await nextTick()

    const toast = wrapper.get('[data-testid="toast"]')
    expect(toast.text()).toContain('Tarea «Cableado» creada.')
    expect(toast.classes()).toContain('bg-green-50')
  })

  it('el error se pinta con su variante', async () => {
    const wrapper = montar()
    const store = useToastStore()

    store.error('No se ha podido guardar')
    await nextTick()

    const toast = wrapper.get('[data-testid="toast"]')
    expect(toast.text()).toContain('No se ha podido guardar')
    expect(toast.classes()).toContain('bg-red-50')
  })

  it('el contenedor es una region activa suave por encima del velo del dialogo', () => {
    const wrapper = montar()

    const host = wrapper.get('[data-testid="toast-host"]')
    expect(host.attributes('aria-live')).toBe('polite')
    expect(host.classes()).toContain('z-[60]')
  })

  it('el error se anuncia de inmediato y los demas avisos no', async () => {
    const wrapper = montar()
    const store = useToastStore()

    store.success('Hecho')
    store.error('Fallo')
    await nextTick()

    const [exito, aviso] = wrapper.findAll('[data-testid="toast"]')
    expect(aviso.attributes('role')).toBe('alert')
    expect(exito.attributes('role')).toBe('status')
  })

  it('la x de cerrar quita el aviso del store', async () => {
    const wrapper = montar()
    const store = useToastStore()

    store.info('Hecho')
    await nextTick()

    await wrapper.get('[title="Cerrar aviso"]').trigger('click')

    expect(store.items).toHaveLength(0)
  })
})
