/**
 * Meses del calendario.
 *
 * El mes se identifica con la clave YYYY-MM. La rejilla empieza en lunes y
 * termina en domingo, como el calendario laboral.
 */

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const WEEKDAY_NAMES = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']

/** Clave del mes de una fecha: "2026-11". */
export function monthKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/** Clave del mes en curso. */
export function currentMonthKey(now = new Date()) {
  return monthKey(now)
}

/** Etiqueta del mes: "Noviembre 2026". */
export function monthLabel(key) {
  const [year, month] = key.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${year}`
}

/** Nombre corto del mes: "nov". */
export function shortMonthName(monthNumber) {
  return MONTH_NAMES[monthNumber - 1].slice(0, 3).toLowerCase()
}

/** Etiquetas de los dias de la semana, de lunes a domingo. */
export function weekdayNames() {
  return [...WEEKDAY_NAMES]
}

/** Mes que va delta meses mas adelante, o antes si delta es negativo. */
export function shiftMonth(key, delta) {
  const [year, month] = key.split('-').map(Number)
  return monthKey(new Date(year, month - 1 + delta, 1))
}

/** Fecha local en formato YYYY-MM-DD. */
function toIsoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Rejilla del mes: semanas de lunes a domingo.
 *
 * Cada celda lleva su fecha, su numero de dia y si el dia pertenece al mes
 * que se esta viendo. La rejilla tiene las semanas que hacen falta, ni una
 * mas.
 */
export function monthGrid(key) {
  const [year, month] = key.split('-').map(Number)
  const first = new Date(year, month - 1, 1)
  // getDay() va de domingo a sabado: el lunes es el primer dia de la semana.
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const weekCount = Math.ceil((offset + daysInMonth) / 7)

  const weeks = []
  for (let week = 0; week < weekCount; week += 1) {
    const days = []
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const day = new Date(year, month - 1, week * 7 + weekday - offset + 1)
      days.push({
        date: toIsoDate(day),
        day: day.getDate(),
        weekday,
        inMonth: day.getMonth() === month - 1,
        weekend: weekday >= 5,
      })
    }
    weeks.push(days)
  }
  return weeks
}

/**
 * Tareas que ocupan un dia.
 *
 * Las fechas van en ISO, asi que se comparan como texto y el resultado no
 * depende de la zona horaria.
 */
export function tasksOnDay(tasks, date) {
  return tasks.filter((task) => task.start <= date && date <= task.end)
}

/** Cuantas tareas caben en una celda del mes. */
export const MAX_TASKS_PER_CELL = 3

/**
 * Tareas de una celda del mes, repartidas entre las que se ven y las que no.
 *
 * La celda tiene un alto fijo, asi que solo caben unas cuantas tareas. Las que
 * sobran se cuentan en un "+N mas" en vez de desbordar la celda.
 */
export function splitTasks(tasks, limit = MAX_TASKS_PER_CELL) {
  return {
    visible: tasks.slice(0, limit),
    hidden: tasks.slice(limit),
  }
}
