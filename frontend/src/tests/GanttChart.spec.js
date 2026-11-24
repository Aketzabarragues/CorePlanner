import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import GanttChart from '../components/gantt/GanttChart.vue'
import GanttBar from '../components/gantt/GanttBar.vue'

const ESCALA = { id: 'Week', label: 'Semana', pxPerDay: 14, header: 'week' }

function barraNueva(taskId = 10, overrides = {}) {
  return {
    taskId,
    x: 42,
    width: 56,
    rowIndex: overrides.rowIndex ?? 0,
    label: 'Programacion SCADA WinCC',
    title: 'Programacion SCADA WinCC',
    color: 'persona-0',
    startIso: '2026-11-03',
    endIso: '2026-11-06',
    assignedName: 'Ana',
    progress: 0,
    projectName: 'Linea Pasteurizadora SIVE',
    ...overrides,
  }
}

/**
 * Layout minimo de `buildLayout`, con la barra ya pegada a la fila.
 *
 * Tres filas de barra por defecto: el doble clic en el hueco tiene que poder
 * comprobar que cae en la fila que toca, y con una sola fila no se distingue
 * un calculo de fila malo de otro bueno.
 */
function layoutDe(barras = [barraNueva(10), barraNueva(11, { rowIndex: 1 }), barraNueva(12, { rowIndex: 2 })], extras = {}) {
  const rows = barras.map((barra, index) => ({ type: 'bar', rowIndex: index, barra }))
  return {
    scale: ESCALA,
    pxPerDay: 14,
    start: '2026-11-01',
    end: '2026-11-14',
    days: 14,
    width: 196,
    axis: { days: 14, width: 196, cells: [], ticks: [{ x: 0, kind: 'week' }] },
    rows,
    bars: barras,
    shaded: [],
    todayIndex: null,
    dependencies: [],
    ...extras,
  }
}

function montar(layout, overrides = {}) {
  return mount(GanttChart, {
    props: {
      layout,
      columnas: [],
      filasNombres: layout.rows,
      editableDe: () => true,
      barraEnfocada: null,
      etiquetaDe: (taskId) => `Etiqueta de la ${taskId}`,
      descripcion: '3 tareas.',
      aviso: '',
      ...overrides,
    },
  })
}

describe('GanttChart', () => {
  it('pinta un gantt-bar por barra y el eje con sus celdas', () => {
    const wrapper = montar(layoutDe())

    expect(wrapper.get('[data-testid="gantt-chart"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="gantt-svg"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="gantt-axis"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="gantt-bar"]').exists()).toBe(true)

    const eje = wrapper.get('[data-testid="gantt-axis"]')
    expect(eje.attributes('aria-hidden')).toBe('true')
  })

  it('la barra se coloca con un transform de SVG sin unidades', () => {
    // El atributo `transform` de un elemento SVG NO admite unidades CSS: con
    // `translate(98px, 42px)` el navegador descarta el atributo entero y la
    // barra no se dibuja. Solo la propiedad CSS `transform` acepta `px`.
    const wrapper = montar(layoutDe())

    const transform = wrapper
      .findAll('[data-testid="gantt-bar"]')
      .map((barra) => barra.attributes('transform'))
    expect(transform.length).toBe(3)
    for (const valor of transform) {
      expect(valor).toMatch(/^translate\(\d+(\.\d+)?, -?\d+(\.\d+)?\)$/)
      expect(valor).not.toContain('px')
    }
  })

  it('pinta una cabecera de grupo con su testid por fila', () => {
    const layout = layoutDe()
    layout.rows.unshift({ type: 'group', label: 'Alimentacion', rowIndex: 0 })
    const wrapper = montar(layout)

    expect(wrapper.get('[data-testid="gantt-group-0"]').attributes('aria-label')).toContain('Alimentacion')
  })

  it('la barra seleccionada lleva el tabindex y el resto no', () => {
    const wrapper = montar(layoutDe(), { barraEnfocada: 10 })

    const barras = wrapper.findAll('[data-testid="gantt-bar"]')
    expect(barras.map((barra) => barra.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('sin permiso la barra va en solo lectura, sin asas', () => {
    const wrapper = montar(layoutDe(), {
      editableDe: () => false,
      etiquetaDe: () => 'Programacion SCADA WinCC. Solo lectura.',
    })

    const barras = wrapper.findAll('[data-testid="gantt-bar"]')
    expect(barras.length).toBe(3)
    for (const barra of barras) {
      expect(barra.attributes('aria-disabled')).toBe('true')
      expect(barra.attributes('tabindex')).toBe('-1')
      expect(barra.attributes('aria-label')).toBe('Programacion SCADA WinCC. Solo lectura.')
      expect(barra.classes()).toContain('gantt__barra--solo-lectura')
    }
    expect(wrapper.find('[data-testid="gantt-handle-start"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gantt-handle-end"]').exists()).toBe(false)
  })

  it('con permiso la barra lleva las dos asas', () => {
    const wrapper = montar(layoutDe())

    expect(wrapper.findAll('[data-testid="gantt-handle-start"]').length).toBe(3)
    expect(wrapper.findAll('[data-testid="gantt-handle-end"]').length).toBe(3)
  })

  it('un clic emite abrir y el foco emite seleccionar', async () => {
    const wrapper = montar(layoutDe())

    await wrapper.findAll('[data-testid="gantt-bar"]')[0].trigger('click')
    expect(wrapper.emitted('abrir')).toEqual([[10]])

    await wrapper.findAll('[data-testid="gantt-bar"]')[0].trigger('focus')
    expect(wrapper.emitted('seleccionar')).toEqual([[10]])
  })

  it('un doble clic en el hueco emite crear con la fecha y la fila del punto', async () => {
    const layout = layoutDe()
    const wrapper = montar(layout)

    // En jsdom la caja del SVG mide cero: se fijo para apuntar con el raton.
    // La y es la coordenada de contenido (clientY menos el top del SVG, que
    // con scroll sube de la ventana). El cuerpo va desplazado 64 px dentro
    // del SVG: la fila 0 empieza en la y 64 del contenido y la fila es
    // floor((y - 64) / 36). La cabecera pegajosa tapa la banda [scroll,
    // scroll + 64) y se descarta antes de mirar la fila: con scroll 0 la
    // primera fila pulsable es la fila 0, contenido [64, 100). x 30 a 14
    // px/dia es el dia 3 (2026-11-03); y 80 da floor((80 - 64) / 36) = 0.
    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 196, bottom: 84 })
    await svg.trigger('dblclick', { clientX: 30, clientY: 80 })

    const [payload] = wrapper.emitted('crear')[0]
    expect(payload.dateIso).toBe('2026-11-03')
    expect(payload.fila).toEqual(expect.objectContaining({ type: 'bar', rowIndex: 0 }))
  })

  it('un doble clic fuera del rango de filas no emite crear', async () => {
    const wrapper = montar(layoutDe())

    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 196, bottom: 84 })
    // Con scroll 0 la cabecera pegajosa tapa la banda [0, 64): y 40 cae
    // dentro y se descarta antes de mirar la fila. y 200 da floor((200 - 64)
    // / 36) = 3 y el layout solo tiene 3 filas (0, 1, 2): sin fila tampoco
    // emite nada.
    await svg.trigger('dblclick', { clientX: 30, clientY: 40 })
    await svg.trigger('dblclick', { clientX: 30, clientY: 200 })

    expect(wrapper.emitted('crear')).toBeUndefined()
  })

  it('un doble clic con el panel desplazado cae en la fila del contenido visible', async () => {
    const layout = layoutDe()
    const wrapper = montar(layout)

    const panel = wrapper.get('[data-testid="gantt-scroll"]')
    panel.element.scrollTop = 40
    await panel.trigger('scroll')

    // Con scroll nativo el borde superior del SVG sube con el contenido: el
    // rect del SVG lo imita con top -40, como en el navegador. La y queda
    // en coordenada de contenido (clientY + 40) y la banda tapada por la
    // cabecera pegajosa pasa a ser [40, 104) (desplazamiento + 64). El
    // cuerpo va desplazado 64, asi que la fila es floor((y - 64) / 36).
    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: -40, right: 196, bottom: 204 })
    // clientY 80 es y 120 en contenido, por encima de la banda tapada, y da
    // floor((120 - 64) / 36) = 1: la fila 1, contenido [100, 136).
    await svg.trigger('dblclick', { clientX: 30, clientY: 80 })

    const [payload] = wrapper.emitted('crear')[0]
    expect(payload.fila).toEqual(expect.objectContaining({ type: 'bar', rowIndex: 1 }))
  })

  it('un doble clic bajo la cabecera pegajosa no emite crear', async () => {
    const wrapper = montar(layoutDe())

    const panel = wrapper.get('[data-testid="gantt-scroll"]')
    panel.element.scrollTop = 40
    await panel.trigger('scroll')

    // Con scroll 40 la cabecera pegajosa tapa la banda [40, 104) del
    // contenido. El rect del SVG imita el navegador con top -40: clientY 44
    // da y = 44 + 40 = 84, dentro de la banda tapada. Por mucho que 84 - 64
    // caiga en la fila 0, el guard y < desplazamiento + 64 descarta el clic
    // antes de mirar la fila.
    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: -40, right: 196, bottom: 204 })
    await svg.trigger('dblclick', { clientX: 30, clientY: 44 })

    expect(wrapper.emitted('crear')).toBeUndefined()
  })

  it('un doble clic sobre la barra no emite crear', async () => {
    const wrapper = montar(layoutDe())

    await wrapper.get('[data-testid="gantt-bar"]').trigger('dblclick')

    expect(wrapper.emitted('crear')).toBeUndefined()
  })

  it('el scroll del panel sube el contenido sin traslacion extra del cuerpo', async () => {
    const wrapper = montar(layoutDe())

    // El cuerpo va desplazado el alto de la cabecera (64) antes de todo
    // scroll: la fila 0 empieza debajo de la cabecera pegajosa.
    expect(wrapper.get('.gantt__cuerpo').attributes('transform')).toBe('translate(0, 64)')

    const panel = wrapper.get('[data-testid="gantt-scroll"]')
    panel.element.scrollTop = 40
    await panel.trigger('scroll')

    // El desplazamiento propagado es 40: el eje lo invierte y queda clavado
    // arriba.
    const eje = wrapper.get('.gantt__eje')
    expect(eje.attributes('transform')).toBe('translate(0, 40)')

    // El cuerpo sube con el scroll nativo del SVG: su traslacion es la
    // misma constante, sin variacion con el scroll.
    expect(wrapper.get('.gantt__cuerpo').attributes('transform')).toBe('translate(0, 64)')

    // La columna de nombres no esta dentro del panel: su pista replica el
    // desplazamiento una sola vez.
    const pista = wrapper.get('.gantt__nombres-pista')
    expect(pista.attributes('style')).toContain('translateY(-40px)')
  })

  it('el eje se monta con el alto de la cabecera y las bandas de mes en escala dia', () => {
    const layout = layoutDe([barraNueva(10)])
    const wrapper = montar(layout, {
      columnas: [
        {
          key: '2026-11-01',
          label: '1',
          sublabel: 'S',
          x: 0,
          width: 44,
          kind: 'day',
          hoy: false,
          festivo: null,
        },
      ],
      bandasCabecera: [{ key: '2026-11', label: 'nov 2026', x: 0, width: 196 }],
    })

    // El fondo del eje lleva el alto de la cabecera (64), no el antiguo 48:
    // la banda 3 (festivo / inicial del dia) cabe dentro.
    const eje = wrapper.get('[data-testid="gantt-axis"]')
    expect(eje.find('rect').attributes('height')).toBe('64')

    // La banda del mes entra en el g de testid propio, con su separador y su
    // etiqueta de la banda 1 (y 15).
    const banda = wrapper.get('[data-testid="gantt-axis-banda-2026-11"]')
    expect(banda.find('line').attributes('y2')).toBe('64')
    expect(banda.find('text').text()).toBe('nov 2026')
    expect(banda.find('text').attributes('y')).toBe('15')

    // La celda de dia lleva el numero (banda 2, y 33) y la inicial (banda 3,
    // y 54), cada uno en su banda.
    const celda = wrapper.get('[data-testid="gantt-axis-column-2026-11-01"]')
    expect(celda.findAll('text').map((texto) => texto.attributes('y'))).toEqual(['33', '54'])
  })

  it('arrastrar la barra pinta la banda de destino con la fila y el rango nuevo', async () => {
    const wrapper = montar(layoutDe([barraNueva(10), barraNueva(11, { rowIndex: 1 })]))
    wrapper
      .get('[data-testid="gantt-scroll"]')
      .element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 400 })

    const barra = wrapper.get('[data-testid="gantt-bar"]')
    await barra.trigger('mousedown', { clientX: 40, clientY: 40 })
    // 30 px a 14 px/dia son 2 dias: el rango nuevo es 2026-11-05 a
    // 2026-11-08. El gesto esta en juego (umbral de 5 px) y la banda se
    // lee con el raton a punto de soltar, no despues.
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 70, clientY: 40 }))
    await flushPromises()

    // El layout empieza en 2026-11-01: el 5 de noviembre es el dia 4 (x 4 * 14)
    // y el rango de cuatro dias mide 4 * 14.
    const banda = wrapper.get('[data-testid="gantt-drag-preview"]')
    expect(banda.attributes('y')).toBe('0')
    expect(banda.attributes('height')).toBe('36')
    expect(Number(banda.attributes('x'))).toBe(4 * 14)
    expect(Number(banda.attributes('width'))).toBe(4 * 14)

    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 70, clientY: 40 }))
    await flushPromises()
    // Al soltar, la previsualizacion se limpia: no queda banda pintada.
    expect(wrapper.find('[data-testid="gantt-drag-preview"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gantt-drag-ghost"]').exists()).toBe(false)
  })

  it('redimensionar el asa de final pinta la banda con el rango recortado', async () => {
    const wrapper = montar(layoutDe([barraNueva(10, { x: 28, width: 28 })]))
    wrapper
      .get('[data-testid="gantt-scroll"]')
      .element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 400 })

    // El asa de final esta en el extremo derecho del cuerpo (x 28 a 56 en
    // la barra): el mousedown cae en la zona 'end', no en el cuerpo.
    const asa = wrapper.get('[data-testid="gantt-handle-end"]')
    await asa.trigger('mousedown', { clientX: 54, clientY: 40 })
    // 28 px a 14 px/dia son 2 dias: el final pasa de 2026-11-06 a
    // 2026-11-08 y el inicio no se toca.
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 82, clientY: 40 }))
    await flushPromises()

    const banda = wrapper.get('[data-testid="gantt-drag-preview"]')
    expect(banda.attributes('y')).toBe('0')
    expect(banda.attributes('height')).toBe('36')
    expect(Number(banda.attributes('x'))).toBe(2 * 14)
    expect(Number(banda.attributes('width'))).toBe(6 * 14)

    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 82, clientY: 40 }))
    await flushPromises()
  })

  it('una tecla sube a la vista con el identificador de la barra', async () => {
    const wrapper = montar(layoutDe())

    await wrapper.findAll('[data-testid="gantt-bar"]')[0].trigger('keydown', { key: 'ArrowRight' })

    const evento = wrapper.emitted('tecla')[0][0]
    expect(evento.key).toBe('ArrowRight')
    expect(wrapper.emitted('tecla')[0][1]).toBe(10)
  })

  it('un vinculo precedes dibuja una flecha del fin del requisito al inicio de la dependiente', () => {
    const layout = layoutDe([barraNueva(10), barraNueva(12, { x: 126, rowIndex: 1 })], {
      dependencies: [{ task_id: 12, depends_on_id: 10, type: 'precedes' }],
    })
    const wrapper = montar(layout)

    const flecha = wrapper.get('[data-testid="gantt-dependency-10-12"]')
    // Fin de la barra 10: 42 + 56 = 98, centro de la fila 0: 18. Inicio de
    // la barra 12: 126, centro de la fila 1: 36 + 18 = 54. El quiebre cae en
    // el punto medio horizontal: (98 + 126) / 2 = 112.
    expect(flecha.attributes('points')).toBe('98,18 112,18 112,54 126,54')
    expect(flecha.attributes('marker-end')).toBe('url(#gantt-punta)')
    expect(flecha.attributes('stroke-dasharray')).toBeUndefined()
  })

  it('un vinculo en la misma fila dibuja la flecha horizontal', () => {
    const barras = [barraNueva(10), barraNueva(12, { x: 126, rowIndex: 0 })]
    const layout = layoutDe(barras, {
      dependencies: [{ task_id: 12, depends_on_id: 10, type: 'precedes' }],
      // Las dos barras pintan en la fila 0: la fila no lleva barra propia.
      rows: [{ type: 'bar', rowIndex: 0, barra: barras[0] }],
    })
    const wrapper = montar(layout)

    expect(wrapper.get('[data-testid="gantt-dependency-10-12"]').attributes('points')).toBe(
      '98,18 126,18',
    )
  })

  it('un vinculo relates se dibuja discontinuo y sin punta', () => {
    const layout = layoutDe([barraNueva(10), barraNueva(12, { x: 126 })], {
      dependencies: [{ task_id: 12, depends_on_id: 10, type: 'relates' }],
    })
    const wrapper = montar(layout)

    const flecha = wrapper.get('[data-testid="gantt-dependency-10-12"]')
    expect(flecha.attributes('stroke-dasharray')).toBe('5 4')
    expect(flecha.attributes('marker-end')).toBeUndefined()
  })

  it('un vinculo cuya otra tarea no esta visible no se dibuja', () => {
    const layout = layoutDe([barraNueva(10)], {
      // La dependiente (12) no tiene barra en el layout.
      dependencies: [{ task_id: 12, depends_on_id: 10, type: 'precedes' }],
    })
    const wrapper = montar(layout)

    expect(wrapper.find('[data-testid="gantt-dependency-10-12"]').exists()).toBe(false)
  })

  it('el SVG lleva el ancho del layout como width y min-width, no el del panel', () => {
    const wrapper = montar(layoutDe())

    const svg = wrapper.get('[data-testid="gantt-svg"]')
    expect(svg.attributes('width')).toBe('196')
    expect(svg.attributes('style')).toContain('min-width: 196px')
  })

  it('al montar emite ancho-panel con el ancho medido del panel', () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 480,
    })
    try {
      const wrapper = montar(layoutDe())
      expect(wrapper.emitted('ancho-panel')).toEqual([[480]])
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'clientWidth', original)
      else delete HTMLElement.prototype.clientWidth
    }
  })

  it('sin ResizeObserver ni ancho, no emite ancho-panel (jsdom)', () => {
    expect(typeof globalThis.ResizeObserver).toBe('undefined')
    const wrapper = montar(layoutDe())
    expect(wrapper.emitted('ancho-panel')).toBeUndefined()
  })

  it('emite ancho-panel cuando el ancho cambia y desconecta al desmontar', () => {
    const original = globalThis.ResizeObserver
    const originalAncho = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const callbacks = []
    globalThis.ResizeObserver = class {
      constructor(callback) {
        this.callback = callback
        callbacks.push(this)
      }
      observe() {}
      disconnect() {}
    }
    // El panel arranca a 0 (jsdom): con 0 no se emite nada.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 0,
    })
    try {
      const wrapper = montar(layoutDe())
      expect(wrapper.emitted('ancho-panel')).toBeUndefined()

      const observador = callbacks[0]
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 520 })
      observador.callback()
      expect(wrapper.emitted('ancho-panel')).toEqual([[520]])

      // Ancho repetido: no se re-emite.
      observador.callback()
      expect(wrapper.emitted('ancho-panel')).toEqual([[520]])

      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 640 })
      observador.callback()
      expect(wrapper.emitted('ancho-panel')).toEqual([[520], [640]])

      // A 0 no se emite de nuevo.
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 0 })
      observador.callback()
      expect(wrapper.emitted('ancho-panel')).toEqual([[520], [640]])
    } finally {
      globalThis.ResizeObserver = original
      if (originalAncho) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalAncho)
      else delete HTMLElement.prototype.clientWidth
    }
  })

  it('al cambiar el layout vuelve a medir el panel y emite el ancho nuevo solo si cambio', async () => {
    const originalAncho = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 480,
    })
    try {
      const wrapper = montar(layoutDe())
      expect(wrapper.emitted('ancho-panel')).toEqual([[480]])

      // El hueco del panel se mueve con el layout (por ejemplo, cuando
      // `main` gana o pierde la barra de scroll vertical): a 520.
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { value: 520 })
      await wrapper.setProps({ layout: layoutDe([barraNueva(10)]) })

      expect(wrapper.emitted('ancho-panel')).toEqual([[480], [520]])

      // Ancho igual al ya informado: el layout cambia y no se re-emite.
      await wrapper.setProps({ layout: layoutDe([barraNueva(10), barraNueva(11, { rowIndex: 1 })]) })
      expect(wrapper.emitted('ancho-panel')).toEqual([[480], [520]])
    } finally {
      if (originalAncho) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalAncho)
      else delete HTMLElement.prototype.clientWidth
    }
  })

  it('la raiz del diagrama se tope al hueco de la vista, no a la pantalla', () => {
    const wrapper = montar(layoutDe())

    const raiz = wrapper.get('[data-testid="gantt-chart"]')
    // El tope es relativo al hueco que le deja la vista (`max-h-full`); el
    // tope fijo de pantalla (`max-h-[70vh]`) ya no existe.
    expect(raiz.classes()).toContain('max-h-full')
    expect(raiz.classes()).not.toContain('max-h-[70vh]')
  })

  it('una barra que viola una dependencia lleva la marca y su aria-label lo dice', () => {
    const layout = layoutDe([
      barraNueva(10, { violates: true, title: 'Programacion SCADA WinCC' }),
      barraNueva(11),
    ])
    const wrapper = montar(layout, {
      etiquetaDe: (id) =>
        id === 10
          ? 'Programacion SCADA WinCC. Empieza antes de que termine Montajes.'
          : `Etiqueta de la ${id}`,
    })

    const barra = wrapper.findAll('[data-testid="gantt-bar"]')[0]
    expect(barra.find('[data-testid="gantt-bar-violation"]').exists()).toBe(true)
    expect(barra.attributes('aria-label')).toContain(
      'Empieza antes de que termine Montajes.',
    )
    expect(
      wrapper.findAll('[data-testid="gantt-bar"]')[1].find('[data-testid="gantt-bar-violation"]')
        .exists(),
    ).toBe(false)
  })

  it('el raton sobre el cuerpo pinta la cruz del dia bajo el puntero y la quita al salir', async () => {
    const wrapper = montar(layoutDe())

    // En jsdom la caja del SVG mide cero: se fija para apuntar con el raton.
    // clientX 30 a 14 px/dia es el dia 2 del rango (2026-11-03, martes);
    // clientY 80 esta bajo la cabecera (64), dentro del cuerpo.
    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 196, bottom: 200 })
    await svg.trigger('mousemove', { clientX: 30, clientY: 80 })

    // La linea va en el centro de la columna del puntero: dia 2 * 14 + 7 = 35,
    // y baja por todo el cuerpo (3 filas * 36).
    const linea = wrapper.get('.gantt__cruz line')
    expect(linea.attributes('x1')).toBe('35')
    expect(linea.attributes('x2')).toBe('35')
    expect(linea.attributes('y2')).toBe('108')

    // La etiqueta va en la tercera banda de la cabecera (rect y 42, texto
    // y 55), con la fecha corta del dia.
    const etiqueta = wrapper.get('.gantt__cruz-etiqueta')
    expect(etiqueta.find('rect').attributes('y')).toBe('42')
    expect(etiqueta.find('text').attributes('y')).toBe('55')
    expect(etiqueta.find('text').text()).toBe('mar 3 nov')

    // Al salir del diagrama no queda ni linea ni etiqueta.
    await svg.trigger('mouseleave')
    expect(wrapper.find('.gantt__cruz line').exists()).toBe(false)
    expect(wrapper.find('.gantt__cruz-etiqueta').exists()).toBe(false)
  })

  it('la cruz se esconde sobre la cabecera pegajosa, al desplazarse y fuera del rango', async () => {
    const wrapper = montar(layoutDe())

    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 196, bottom: 200 })

    // clientY 50 esta dentro de la cabecera pegajosa [0, 64): no hay cruz.
    await svg.trigger('mousemove', { clientX: 30, clientY: 50 })
    expect(wrapper.find('.gantt__cruz line').exists()).toBe(false)

    // Con el panel desplazado 40 la banda tapada sube a [40, 104): clientY 70
    // cae dentro y no hay cruz.
    const panel = wrapper.get('[data-testid="gantt-scroll"]')
    panel.element.scrollTop = 40
    await panel.trigger('scroll')
    await svg.trigger('mousemove', { clientX: 30, clientY: 70 })
    expect(wrapper.find('.gantt__cruz line').exists()).toBe(false)

    // Fuera del rango horizontal tampoco: x 200 pasa el ancho del lienzo (196).
    await svg.trigger('mousemove', { clientX: 200, clientY: 130 })
    expect(wrapper.find('.gantt__cruz line').exists()).toBe(false)

    // Dentro del cuerpo con el panel desplazado la cruz vuelve: la fecha sale
    // del dia bajo el puntero, no de la fila.
    await svg.trigger('mousemove', { clientX: 30, clientY: 130 })
    expect(wrapper.find('.gantt__cruz line').exists()).toBe(true)
    expect(wrapper.get('.gantt__cruz-etiqueta').find('text').text()).toBe('mar 3 nov')
  })

  it('el puntero sobre el diagrama resalta la fila en las dos mitades y lo quita al salir', async () => {
    const wrapper = montar(layoutDe())

    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 196, bottom: 200 })
    // clientY 80 esta bajo la cabecera (64) y dentro de la fila 0, contenido
    // [64, 100).
    await svg.trigger('mousemove', { clientX: 30, clientY: 80 })

    // En el diagrama la banda mide una fila y ocupa todo el ancho del lienzo.
    const banda = wrapper.get('.gantt__fila-resaltada')
    expect(banda.attributes('y')).toBe('0')
    expect(banda.attributes('height')).toBe('36')

    // En la columna de nombres la misma fila lleva su tinte.
    const filas = wrapper.findAll('.gantt__nombres-pista > div')
    expect(
      filas.map((fila) => fila.classes().join(' ')).some((clases) =>
        clases.includes('gantt__nombre-fila--resaltada'),
      ),
    ).toBe(true)

    // Fuera del diagrama no queda ni banda ni tinte.
    await svg.trigger('mouseleave')
    expect(wrapper.find('.gantt__fila-resaltada').exists()).toBe(false)
    expect(wrapper.find('[class*="gantt__nombre-fila--"]').exists()).toBe(false)
  })

  it('la fila de la barra enfocada lleva su propia marca en las dos mitades', async () => {
    const wrapper = montar(layoutDe(), { barraEnfocada: 11 })

    // La barra 11 esta en la fila 1: la banda del diagrama cae en y 36 y la
    // fila 1 de la columna de nombres lleva su tinte.
    expect(wrapper.find('.gantt__fila-resaltada').exists()).toBe(false)
    const banda = wrapper.get('.gantt__fila-activa')
    expect(banda.attributes('y')).toBe('36')
    expect(banda.attributes('height')).toBe('36')

    const filas = wrapper.findAll('.gantt__nombres-pista > div')
    expect(
      filas.map((fila) => fila.classes().join(' ')).some((clases) =>
        clases.includes('gantt__nombre-fila--activa'),
      ),
    ).toBe(true)

    // El puntero sobre la fila enfocada (clientY 120: (120 - 64) / 36 = 1)
    // no pinta la marca del puntero: manda la de la enfocada.
    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 196, bottom: 200 })
    await svg.trigger('mousemove', { clientX: 30, clientY: 120 })
    expect(wrapper.find('.gantt__fila-resaltada').exists()).toBe(false)
    expect(wrapper.get('.gantt__fila-activa').attributes('y')).toBe('36')

    // El puntero sobre la fila 0, que no es la enfocada, y las dos marcas se
    // pintan, cada una en su fila.
    await svg.trigger('mousemove', { clientX: 30, clientY: 80 })
    expect(wrapper.get('.gantt__fila-activa').attributes('y')).toBe('36')
    expect(wrapper.get('.gantt__fila-resaltada').attributes('y')).toBe('0')
  })

  it('la columna de nombres avisa de la fila bajo el puntero y el chart la resalta', async () => {
    const wrapper = montar(layoutDe())

    const fila = wrapper.findAll('.gantt__nombres-pista > div')[1]
    await fila.trigger('mouseenter')

    // El aviso de la fila 1 llega al chart: la banda cae en y 36.
    expect(wrapper.get('.gantt__fila-resaltada').attributes('y')).toBe('36')

    // Al salir de la columna, el chart la quita.
    await wrapper.get('[data-testid="gantt-names"]').trigger('mouseleave')
    expect(wrapper.find('.gantt__fila-resaltada').exists()).toBe(false)
  })

  it('la barra emite entrar con su id y salir al pasar el raton por encima', async () => {
    const barra = barraNueva(10)
    const wrapper = mount(GanttBar, {
      props: { barra, y: 0, editable: true, etiquetaAria: 'Etiqueta de la 10' },
    })

    await wrapper.trigger('mouseenter')
    expect(wrapper.emitted('entrar')).toEqual([[10]])

    await wrapper.trigger('mouseleave')
    expect(wrapper.emitted('salir')).toEqual([[]])
  })

  it('pasar el raton por una barra muestra el globo con sus datos y lo quita al salir', async () => {
    const wrapper = montar(layoutDe([
      barraNueva(10, {
        title: 'Programacion SCADA WinCC',
        startIso: '2026-11-03',
        endIso: '2026-11-06',
        progress: 40,
      }),
    ]))

    const barra = wrapper.get('[data-testid="gantt-bar"]')
    await barra.trigger('mouseenter')

    // El globo sale en el viewport (fixed, pointer-events-none) con el titulo,
    // las fechas, la duracion inclusiva y el avance de la barra.
    const globo = wrapper.get('[data-testid="gantt-tooltip"]')
    expect(globo.attributes('aria-hidden')).toBe('true')
    expect(globo.text()).toContain('Programacion SCADA WinCC')
    expect(globo.text()).toContain('3 nov 2026')
    expect(globo.text()).toContain('6 nov 2026')
    expect(globo.text()).toContain('4 días')
    expect(globo.text()).toContain('40 %')
    expect(globo.find('dt').text()).toBe('Inicio')
    expect(globo.text()).toContain('Fin')

    // Sin avance el globo no deja la fila hueca: no la pinta.
    await barra.trigger('mouseleave')
    expect(wrapper.find('[data-testid="gantt-tooltip"]').exists()).toBe(false)

    const sinAvance = montar(layoutDe([barraNueva(10, { progress: 0 })]))
    await sinAvance.get('[data-testid="gantt-bar"]').trigger('mouseenter')
    expect(sinAvance.get('[data-testid="gantt-tooltip"]').text()).not.toContain('Avance')
  })

  it('con la prop dependencias el globo lista requisitos y dependientes con su tipo', async () => {
    const wrapper = montar(layoutDe([
      barraNueva(10, { title: 'Tarea central' }),
    ]), {
      dependencias: {
        10: [
          { titulo: 'Diseño de proceso', tipo: 'precedes', sentido: 'requisito' },
          { titulo: 'Pruebas de linea', tipo: 'precedes', sentido: 'dependiente' },
          { titulo: 'Notas de operacion', tipo: 'relates', sentido: 'relacionada' },
        ],
      },
    })

    await wrapper.get('[data-testid="gantt-bar"]').trigger('mouseenter')

    const globo = wrapper.get('[data-testid="gantt-tooltip"]')
    const texto = globo.text()
    // Los tres grupos salen solo con sus entradas, y cada requisito y
    // dependiente lleva el tipo del vinculo (FS).
    expect(texto).toContain('Depende de')
    expect(texto).toContain('Diseño de proceso')
    expect(texto).toContain('Requerida por')
    expect(texto).toContain('Pruebas de linea')
    expect(texto).toContain('Relacionada con')
    expect(texto).toContain('Notas de operacion')
    expect(texto.match(/FS/g)).toHaveLength(2)
  })

  it('durante un arrastre no hay cruz ni globo, y el globo vuelve al soltar', async () => {
    const wrapper = montar(layoutDe())
    wrapper
      .get('[data-testid="gantt-scroll"]')
      .element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 400 })

    const svg = wrapper.get('[data-testid="gantt-svg"]')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 196, bottom: 200 })

    const barra = wrapper.get('[data-testid="gantt-bar"]')
    await barra.trigger('mousedown', { clientX: 40, clientY: 80 })
    // El gesto pasa el umbral de 5 px: fantasma y previsualizacion en juego.
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 70, clientY: 80 }))
    await flushPromises()

    // Sobre el diagrama el raton sigue moviendose, pero la cruz no sale ni el
    // globo se pinta sobre la barra agarrada.
    await barra.trigger('mouseenter')
    await svg.trigger('mousemove', { clientX: 70, clientY: 80 })
    expect(wrapper.find('.gantt__cruz line').exists()).toBe(false)
    expect(wrapper.find('.gantt__cruz-etiqueta').exists()).toBe(false)
    expect(wrapper.find('[data-testid="gantt-tooltip"]').exists()).toBe(false)

    // Al soltar, el gesto se acaba y el globo vuelve sobre la barra agarrada.
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 70, clientY: 80 }))
    await flushPromises()
    expect(wrapper.get('[data-testid="gantt-tooltip"]').exists()).toBe(true)
  })
})
