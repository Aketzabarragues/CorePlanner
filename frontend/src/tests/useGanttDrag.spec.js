import { describe, expect, it, vi } from 'vitest'

import { useGanttDrag } from '../composables/useGanttDrag'

const PX_POR_DIA = 14

/** Barra de prueba: una semana a partir del 3 de noviembre de 2026. */
function barraNueva(overrides = {}) {
  return {
    taskId: 10,
    title: 'Programacion SCADA WinCC',
    color: 'persona-0',
    startIso: '2026-11-03',
    endIso: '2026-11-06',
    ...overrides,
  }
}

/**
 * Lanza el composable y devuelve, junto al estado, una forma de disparar los
 * eventos de ventana que el composable escucha.
 */
/** Caja del diagrama para los tests: el chart siempre pasa un ref al panel. */
const cajaDiagrama = {
  value: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 500, bottom: 400 }) },
}

function lanzar(alConfirmar) {
  const drag = useGanttDrag({
    pxPerDayDe: () => PX_POR_DIA,
    alConfirmar: alConfirmar ?? (() => {}),
  })
  const mover = (clientX, clientY) =>
    window.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY }))
  const soltar = (clientX, clientY) =>
    window.dispatchEvent(new MouseEvent('mouseup', { clientX, clientY }))
  const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  return { drag, mover, soltar, escape }
}

describe('useGanttDrag', () => {
  it('mover el cuerpo desplaza el rango y lo confirma al soltar', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    drag.empezarArrastre({
      barra: barraNueva(),
      zona: 'body',
      event: { clientX: 100, clientY: 40 },
      dentro: cajaDiagrama,
    })
    mover(114, 40)
    expect(drag.previsualizacion.value).toEqual({
      taskId: 10,
      start: '2026-11-04',
      end: '2026-11-07',
    })
    expect(drag.fantasma.value.rango).toBe('2026-11-04 → 2026-11-07')
    soltar(114, 40)

    expect(confirmado).toHaveBeenCalledWith({ taskId: 10, start: '2026-11-04', end: '2026-11-07' })
    expect(drag.fantasma.value).toBeNull()
    expect(drag.previsualizacion.value).toBeNull()
  })

  it('un soltar sin pasar el umbral es un clic, no un arrastre', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    drag.empezarArrastre({
      barra: barraNueva(),
      zona: 'body',
      event: { clientX: 100, clientY: 40 },
      dentro: cajaDiagrama,
    })
    mover(102, 40)
    soltar(102, 40)

    expect(confirmado).not.toHaveBeenCalled()
    expect(drag.previsualizacion.value).toBeNull()
  })

  it('el asa del final alarga la barra sin mover el inicio', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    drag.empezarArrastre({
      barra: barraNueva(),
      zona: 'end',
      event: { clientX: 200, clientY: 40 },
      dentro: cajaDiagrama,
    })
    mover(214, 40)
    soltar(214, 40)

    expect(confirmado).toHaveBeenCalledWith({ taskId: 10, start: '2026-11-03', end: '2026-11-07' })
  })

  it('el asa del inicio adelanta la barra sin mover el final', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    drag.empezarArrastre({
      barra: barraNueva(),
      zona: 'start',
      event: { clientX: 100, clientY: 40 },
      dentro: cajaDiagrama,
    })
    mover(114, 40)
    soltar(114, 40)

    expect(confirmado).toHaveBeenCalledWith({ taskId: 10, start: '2026-11-04', end: '2026-11-06' })
  })

  it('Escape anula el gesto y el soltar no confirma', () => {
    const confirmado = vi.fn()
    const { drag, mover, escape, soltar } = lanzar(confirmado)

    drag.empezarArrastre({
      barra: barraNueva(),
      zona: 'body',
      event: { clientX: 100, clientY: 40 },
      dentro: cajaDiagrama,
    })
    mover(128, 40)
    expect(drag.previsualizacion.value).not.toBeNull()
    escape()
    expect(drag.previsualizacion.value).toBeNull()
    expect(drag.fantasma.value).toBeNull()
    soltar(128, 40)

    expect(confirmado).not.toHaveBeenCalled()
  })

  it('soltar fuera del diagrama anula el gesto, como un Escape', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    drag.empezarArrastre({
      barra: barraNueva(),
      zona: 'body',
      event: { clientX: 100, clientY: 40 },
      dentro: cajaDiagrama,
    })
    mover(114, 40)
    expect(drag.previsualizacion.value).not.toBeNull()
    soltar(1200, 40)

    expect(confirmado).not.toHaveBeenCalled()
    expect(drag.previsualizacion.value).toBeNull()
    expect(drag.fantasma.value).toBeNull()
  })

  it('soltar dentro del diagrama sigue confirmando', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    drag.empezarArrastre({
      barra: barraNueva(),
      zona: 'body',
      event: { clientX: 100, clientY: 40 },
      dentro: cajaDiagrama,
    })
    mover(114, 40)
    soltar(114, 40)

    expect(confirmado).toHaveBeenCalledWith({ taskId: 10, start: '2026-11-04', end: '2026-11-07' })
  })
})
