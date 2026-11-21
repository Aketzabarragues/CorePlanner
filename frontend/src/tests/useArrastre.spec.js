import { describe, expect, it, vi } from 'vitest'

import { useArrastre, DRAG_THRESHOLD } from '../composables/useArrastre'

/**
 * Lanza el composable sin componente: los callbacks que devuelve se prueban
 * ahi y los eventos de ventana se disparan a mano, como hace la suite del
 * Gantt.
 */
function lanzar(opciones = {}) {
  const drag = useArrastre(opciones)
  const mover = (clientX, clientY) =>
    window.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY }))
  const soltar = (clientX, clientY) =>
    window.dispatchEvent(new MouseEvent('mouseup', { clientX, clientY }))
  const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  const pulsar = (clientX, clientY) =>
    drag.empezarArrastre({
      contexto: { nombre: 'tarjeta' },
      event: { clientX, clientY },
    })
  return { drag, mover, soltar, escape, pulsar }
}

describe('useArrastre', () => {
  it('mover 2 px no arrastra: el umbral son 5 px', () => {
    const alMover = vi.fn()
    const alConfirmar = vi.fn()
    const { drag, mover, soltar, pulsar } = lanzar({ alMover, alConfirmar })

    pulsar(100, 100)
    mover(102, 100)

    expect(alMover).not.toHaveBeenCalled()
    expect(drag.fantasma.value).toBeNull()
    expect(drag.movido()).toBe(false)

    soltar(102, 100)

    expect(alConfirmar).not.toHaveBeenCalled()
    expect(drag.movido()).toBe(false)
  })

  it('mover mas de 5 px arrastra y el fantasma sigue al puntero', () => {
    const alMover = vi.fn()
    const fantasmaDe = vi.fn((contexto, event) => ({
      x: event.clientX + 10,
      y: event.clientY - 10,
      etiqueta: contexto.datos.nombre,
    }))
    const { drag, mover, soltar, pulsar } = lanzar({ alMover, fantasmaDe })

    pulsar(100, 100)
    mover(108, 100)

    expect(alMover).toHaveBeenCalledTimes(1)
    expect(drag.movido()).toBe(true)
    expect(drag.fantasma.value).toEqual({ x: 118, y: 90, etiqueta: 'tarjeta' })

    mover(150, 140)
    expect(drag.fantasma.value).toEqual({ x: 160, y: 130, etiqueta: 'tarjeta' })

    soltar(150, 140)
    expect(drag.fantasma.value).toBeNull()
  })

  it('Escape anula el gesto y la soltura no confirma', () => {
    const alConfirmar = vi.fn()
    const { drag, mover, soltar, escape, pulsar } = lanzar({
      alConfirmar,
      fantasmaDe: () => ({ x: 0, y: 0 }),
    })

    pulsar(100, 100)
    mover(130, 100)
    expect(drag.fantasma.value).not.toBeNull()
    expect(drag.movido()).toBe(true)

    escape()
    expect(drag.fantasma.value).toBeNull()

    soltar(130, 100)

    expect(alConfirmar).not.toHaveBeenCalled()
  })

  it('un soltar dentro del objetivo confirma al callback con los datos del gesto', () => {
    const alConfirmar = vi.fn()
    const { mover, soltar, pulsar } = lanzar({
      alConfirmar,
      dentroDe: (contexto, event) => event.clientX <= 200,
    })

    pulsar(10, 10)
    mover(60, 10)
    soltar(120, 10)

    expect(alConfirmar).toHaveBeenCalledTimes(1)
    const [contexto, event] = alConfirmar.mock.calls[0]
    expect(contexto.datos).toEqual({ nombre: 'tarjeta' })
    expect(event.clientX).toBe(120)
  })

  it('un soltar fuera del objetivo anula el gesto, como un Escape', () => {
    const alConfirmar = vi.fn()
    const { drag, mover, soltar, pulsar } = lanzar({
      alConfirmar,
      dentroDe: (contexto, event) => event.clientX <= 200,
      fantasmaDe: () => ({ x: 0, y: 0 }),
    })

    pulsar(10, 10)
    mover(60, 10)
    soltar(250, 10)

    expect(alConfirmar).not.toHaveBeenCalled()
    expect(drag.fantasma.value).toBeNull()
  })

  it('un gesto arrastrado deja la bandera movido y un gesto sin mover no', () => {
    const { drag, mover, soltar, pulsar } = lanzar()

    pulsar(100, 100)
    mover(120, 100)
    soltar(120, 100)
    // Con la bandera en true, el clic que sigue al soltar no abre nada.
    expect(drag.movido()).toBe(true)

    // Un mousedown nuevo empieza de cero: si no se mueve, es un pulsar y
    // el clic que viene abre lo que abra.
    pulsar(100, 100)
    expect(drag.movido()).toBe(false)
    soltar(100, 100)
    expect(drag.movido()).toBe(false)
  })

  it('alAnular se llama cuando el gesto se anula, ya sea por Escape o por soltar fuera', () => {
    const alConfirmar = vi.fn()
    const alAnular = vi.fn()
    const dentroDe = (contexto, event) => event.clientX <= 200
    const { mover, soltar, escape, pulsar } = lanzar({ alConfirmar, dentroDe, alAnular })

    pulsar(10, 10)
    mover(60, 10)
    escape()
    expect(alAnular).toHaveBeenCalledTimes(1)
    soltar(60, 10)
    expect(alConfirmar).not.toHaveBeenCalled()
    expect(alAnular).toHaveBeenCalledTimes(1)

    pulsar(10, 10)
    mover(60, 10)
    soltar(250, 10)
    expect(alAnular).toHaveBeenCalledTimes(2)
    expect(alConfirmar).not.toHaveBeenCalled()
  })
})
