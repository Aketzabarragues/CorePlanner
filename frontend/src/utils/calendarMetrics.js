/**
 * Medidas fijas del calendario.
 *
 * Tailwind no llega a la geometria del calendario: el HTML (columna de
 * nombres y celdas) y el pintado miden con los mismos numeros de aqui, para
 * que lo medido y lo pintado no se despegue. El umbral de arrastre no va aqui:
 * se toma de `GANTT_METRICS.dragThreshold` (utils/ganttMetrics.js), para que
 * el gesto sea igual en las dos vistas.
 */

export const CALENDAR_METRICS = {
  altoCarril: 28, // Sub-fila de una persona dentro de su fila
  altoCabeceraDia: 56, // Cabecera de los siete dias de la semana
  anchoMinColumnaDia: 96, // Minimo de una columna de dia, antes de desplazar
  anchoNombres: 200, // Columna de nombres
  handleWidth: 8, // Zona sensible del asa de redimension
}
