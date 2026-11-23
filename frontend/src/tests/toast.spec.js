import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useToastStore } from '../stores/toast'

describe('store de avisos flotantes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('push guarda el aviso con su variante', () => {
    const store = useToastStore()

    store.push({ message: 'Tarea creada', variant: 'success' })

    expect(store.items).toHaveLength(1)
    expect(store.items[0].message).toBe('Tarea creada')
    expect(store.items[0].variant).toBe('success')
  })

  it('success e info se autocierran a los 4000 ms', () => {
    const store = useToastStore()

    store.success('Hecho')
    store.info('Dato')
    vi.advanceTimersByTime(4000)

    expect(store.items).toHaveLength(0)
  })

  it('warning y error no se autocierran', () => {
    const store = useToastStore()

    store.warning('Cuidado')
    store.error('Fallo')
    vi.advanceTimersByTime(30_000)

    expect(store.items.map((item) => item.variant)).toEqual(['warning', 'error'])
  })

  it('un push con la misma key reemplaza el aviso anterior en vez de apilar', () => {
    const store = useToastStore()

    store.push({ message: 'Cargando…', key: 'carga' })
    store.push({ message: 'Listo', key: 'carga' })

    expect(store.items).toHaveLength(1)
    expect(store.items[0].message).toBe('Listo')
  })

  it('la pila no supera 3 items: el cuarto descarta al mas viejo', () => {
    const store = useToastStore()

    for (const mensaje of ['uno', 'dos', 'tres', 'cuatro']) {
      store.push({ message: mensaje })
    }

    expect(store.items.map((item) => item.message)).toEqual(['dos', 'tres', 'cuatro'])
  })

  it('dismiss quita ese aviso', () => {
    const store = useToastStore()

    const id = store.push({ message: 'uno' })
    store.push({ message: 'dos' })

    store.dismiss(id)

    expect(store.items).toHaveLength(1)
    expect(store.items[0].message).toBe('dos')
  })

  it('clear vacia la pila', () => {
    const store = useToastStore()

    store.push({ message: 'uno' })
    store.push({ message: 'dos' })

    store.clear()

    expect(store.items).toHaveLength(0)
  })
})
