/**
 * Medidas de geometria del diagrama de Gantt.
 *
 * Tailwind no llega a la geometria del SVG: el ancho de columna sale de
 * `pxPerDay` (utils/ganttScale.js) y el resto son medidas fijas. El HTML
 * (columna de nombres) y el SVG (cuerpo) miden con los mismos numeros, para
 * que lo pintado por ambas partes no se despegue.
 */

export const GANTT_METRICS = {
  // Cabecera del eje y de la columna de nombres: tres bandas de ~21 px
  // (numero o nombre, rango o ano, festivo).
  headerHeight: 64,
  barHeight: 24, // Barra, dentro de la fila de tarea (40 px) o de grupo (36 px)
  barRadius: 8,
  namesWidth: 240, // Columna de nombres (escritorio)
  namesWidthSmall: 160, // Columna de nombres (pantalla estrecha)
  gridWidth: 1,
  separatorWidth: 1,
  todayWidth: 2,
  focusWidth: 2,
  handleWidth: 8, // Zona sensible del asa de redimension
  handleInset: 2,
  labelPadding: 6,
  labelMinWidth: 72,
  // Reserva de la derecha para el porcentaje: 6 px de padding + "100%" en
  // mono micro (~24 px) + 6 px de hueco. El clip de la etiqueta acaba ahi.
  porcentajeReserva: 36,
  dragThreshold: 5, // Mismo umbral que el Kanban
}
