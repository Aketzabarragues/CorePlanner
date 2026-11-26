import { describe, expect, it, vi } from 'vitest'

import { useCalendarioDrag } from '../composables/useCalendarioDrag'
import { weekDays } from '../utils/weeks'

// 2026-W45: lunes 2 de noviembre a domingo 8 de noviembre de 2026.
const DIAS = weekDays('2026-W45')

/** Tarea de prueba: del lunes 2 al viernes 6 de noviembre de 2026. */
function tareaNueva(overrides = {}) {
  return {
    id: 10,
    title: 'Programacion SCADA WinCC',
    start: '2026-11-02',
    end: '2026-11-06',
    assigned_to: 7,
    ...overrides,
  }
}

/**
 * Geometria de la rejilla: la tabla mide de 0 a 700, la columna de nombres
 * ocupa 0 a 100 y cada columna de dia mide 85.5. La semana unica ocupa toda
 * la altura de la tabla.
 */
function geometria() {
  return {
    izquierda: 0,
    derecha: 700,
    arriba: 0,
    abajo: 1000,
    anchoNombres: 100,
    anchoDia: 85.5,
    semanas: [{ indice: 0, top: 0, bottom: 1000 }],
    dias: [DIAS],
  }
}

/**
 * Lanza el composable y devuelve, junto al estado, una forma de disparar los
 * eventos de ventana que el composable escucha.
 */
function lanzar(alConfirmar) {
  const drag = useCalendarioDrag({
    geometriaDe: () => geometria(),
    alConfirmar: alConfirmar ?? (() => {}),
  })
  const mover = (clientX, clientY) =>
    window.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY }))
  const soltar = (clientX, clientY) =>
    window.dispatchEvent(new MouseEvent('mouseup', { clientX, clientY }))
  const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  return { drag, mover, soltar, escape }
}

/** Arrastra desde la barra: cuerpo por defecto. */
function agarrar(drag, { zona = 'body', x = 200, y = 100 } = {}) {
  drag.empezarArrastre({
    barra: { tarea: tareaNueva() },
    zona,
    event: { clientX: x, clientY: y },
    dias: DIAS,
  })
}

describe('useCalendarioDrag', () => {
  it('mover el cuerpo conserva la duracion en dias laborables y confirma al soltar', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    // Cinco dias laborables (lunes 2 a viernes 6) con destino martes 3:
    // cae del 3 al lunes 9, que son los mismos cinco dias laborables.
    agarrar(drag)
    mover(228.25, 100) // Columna 1: martes 3.
    expect(drag.previsualizacion.value).toEqual({
      taskId: 10,
      start: '2026-11-03',
      end: '2026-11-09',
      fecha: '2026-11-03',
      personaId: 7,
    })
    expect(drag.fantasma.value.rango).toBe('2026-11-03 → 2026-11-09')
    soltar(228.25, 100)

    expect(confirmado).toHaveBeenCalledWith({
      taskId: 10,
      start: '2026-11-03',
      end: '2026-11-09',
    })
    expect(drag.fantasma.value).toBeNull()
    expect(drag.previsualizacion.value).toBeNull()
  })

  it('redimensionar el inicio cambia solo el inicio', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    agarrar(drag, { zona: 'start' })
    mover(313.75, 100) // Columna 2: miercoles 4.
    expect(drag.previsualizacion.value).toEqual({
      taskId: 10,
      start: '2026-11-04',
      end: '2026-11-06',
      fecha: '2026-11-04',
      personaId: 7,
    })
    soltar(313.75, 100)

    expect(confirmado).toHaveBeenCalledWith({
      taskId: 10,
      start: '2026-11-04',
      end: '2026-11-06',
    })
  })

  it('redimensionar el fin cambia solo el fin', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    agarrar(drag, { zona: 'end' })
    mover(399.25, 100) // Columna 3: jueves 5.
    expect(drag.previsualizacion.value).toEqual({
      taskId: 10,
      start: '2026-11-02',
      end: '2026-11-05',
      fecha: '2026-11-05',
      personaId: 7,
    })
    soltar(399.25, 100)

    expect(confirmado).toHaveBeenCalledWith({
      taskId: 10,
      start: '2026-11-02',
      end: '2026-11-05',
    })
  })

  it('redimensionar el inicio hacia atras adelanta la barra sin mover el fin', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    agarrar(drag, { zona: 'start' })
    mover(142.75, 100) // Columna 0: lunes 2.
    soltar(142.75, 100)

    expect(confirmado).toHaveBeenCalledWith({
      taskId: 10,
      start: '2026-11-02',
      end: '2026-11-06',
    })
  })

  it('el destino en sabado cae en el viernes y en domingo en el lunes', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    agarrar(drag)
    mover(570.25, 100) // Columna 5: sabado 7.
    // Dia laborable: viernes 6; cinco dias laborables desde el 6: jueves 12.
    expect(drag.previsualizacion.value).toEqual({
      taskId: 10,
      start: '2026-11-06',
      end: '2026-11-12',
      fecha: '2026-11-06',
      personaId: 7,
    })
    expect(drag.fantasma.value.rango).toBe('2026-11-06 → 2026-11-12')
    soltar(570.25, 100)
    expect(confirmado).toHaveBeenCalledWith({
      taskId: 10,
      start: '2026-11-06',
      end: '2026-11-12',
    })

    const { drag: drag2, mover: mover2, soltar: soltar2 } = lanzar(confirmado)
    agarrar(drag2)
    mover2(655.75, 100) // Columna 6: domingo 8.
    expect(drag2.previsualizacion.value).toEqual({
      taskId: 10,
      start: '2026-11-09',
      end: '2026-11-13',
      fecha: '2026-11-09',
      personaId: 7,
    })
    soltar2(655.75, 100)
    expect(confirmado).toHaveBeenLastCalledWith({
      taskId: 10,
      start: '2026-11-09',
      end: '2026-11-13',
    })
  })

  it('Escape anula el gesto y el soltar no confirma', () => {
    const confirmado = vi.fn()
    const { drag, mover, escape, soltar } = lanzar(confirmado)

    agarrar(drag)
    mover(228.25, 100)
    expect(drag.previsualizacion.value).not.toBeNull()
    escape()
    expect(drag.previsualizacion.value).toBeNull()
    expect(drag.fantasma.value).toBeNull()
    soltar(285.5, 100)

    expect(confirmado).not.toHaveBeenCalled()
  })

  it('soltar fuera de la rejilla no confirma', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    agarrar(drag)
    mover(228.25, 100)
    expect(drag.previsualizacion.value).not.toBeNull()
    soltar(1200, 100)

    expect(confirmado).not.toHaveBeenCalled()
    expect(drag.previsualizacion.value).toBeNull()
    expect(drag.fantasma.value).toBeNull()
  })

  it('un soltar sin pasar el umbral es un clic, no un arrastre', () => {
    const confirmado = vi.fn()
    const { drag, mover, soltar } = lanzar(confirmado)

    agarrar(drag)
    mover(202, 100)
    soltar(202, 100)

    expect(confirmado).not.toHaveBeenCalled()
    expect(drag.previsualizacion.value).toBeNull()
    expect(drag.movido()).toBe(false)
  })

  it('el clic que sigue a un arrastre se deja de contar como arrastre', () => {
    const { drag, mover, soltar } = lanzar(() => {})

    agarrar(drag)
    mover(228.25, 100)
    expect(drag.movido()).toBe(true)
    soltar(228.25, 100)
    expect(drag.movido()).toBe(true)

    agarrar(drag)
    expect(drag.movido()).toBe(false)
  })
})
