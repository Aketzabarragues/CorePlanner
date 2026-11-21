/**
 * Medidas de geometria del diagrama de Gantt.
 *
 * Tailwind no llega a la geometria del SVG: el ancho de columna sale de
 * `pxPerDay` (utils/ganttScale.js) y el resto son medidas fijas. El HTML
 * (columna de nombres) y el SVG (cuerpo) miden con los mismos numeros, para
 * que lo pintado por ambas partes no se despegue.
 */

export const GANTT_METRICS = {
  headerHeight: 48, // Cabecera del eje y de la columna de nombres
  barHeight: 24, // Barra, dentro de la fila de 36 px
  barRadius: 4,
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
  dragThreshold: 5, // Mismo umbral que el Kanban
}
