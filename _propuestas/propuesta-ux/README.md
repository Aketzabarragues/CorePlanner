# CorePlanner: propuesta de UX del frontend

Documento de traspaso para el agente que desarrolla la app. Describe **qué cambiar, por qué, dónde y cómo comprobar que está hecho**. Los prototipos visuales están en `prototipos/` (HTML autocontenido, ver la sección 11).

Base analizada: repo `Aketzabarragues/CorePlanner`, commit `3e1b764`, frontend Vue 3 + Vite + Tailwind 3 + Pinia.

> **Cómo usar este documento.** Trabaja por fases (sección 9). Cada fase es una entrega independiente que deja la app funcionando y los tests en verde. No hagas varias fases a la vez. Antes de tocar una pantalla, abre su prototipo en `prototipos/` y úsalo como referencia de estructura y comportamiento, no como código para copiar: los prototipos usan un formato propio (`.dc.html`) y estilos en línea, y el proyecto real usa componentes `.vue` y clases de Tailwind.

---

## 1. Objetivos

1. Una sola pantalla de **Capacidad** en lugar de tres que dibujan la misma matriz.
2. Mostrar **capacidad y porcentaje**, no solo horas, y no depender solo del color.
3. **Eje de tiempo continuo**: ver también las semanas libres.
4. Entrada por rol: el técnico aterriza en *Mi trabajo*, el gerente en *Panel*.
5. Menú agrupado por intención y **estado de la vista en la URL**.
6. Componentes comunes para carga, error, vacío y avisos, en lugar de copias por vista.
7. Accesibilidad básica y uso en móvil donde importa (*Mi trabajo*).

## 2. Lo que NO cambia

- La API y el motor de capacidad (`backend/services/capacity.py`) siguen siendo la fuente de verdad. El frontend no recalcula horas.
- El modelo de permisos y alcance por rol.
- Las vistas que no aparecen en los prototipos (Kanban, Gantt, ficha de persona, paneles de Configuración distintos del calendario laboral) se mantienen y solo heredan el shell, el menú y los componentes comunes.

---

## 3. Sistema visual

### 3.1 Tipografía
- Cuerpo: **Inter** (400, 500, 600).
- Títulos de página y de sección: **Space Grotesk** (500, 600).
- Cifras en tablas y celdas: `font-variant-numeric: tabular-nums` (clase `tabular-nums` de Tailwind).

### 3.2 Colores base
| Uso | Valor |
| --- | --- |
| Primario (acciones, enlace activo) | `#0f766e` |
| Menú lateral | fondo `#0f172a`, ítem activo `#1e293b`, texto `#cbd5e1` |
| Fondo de la app | `#f8fafc` |
| Superficie (tarjetas) | `#ffffff`, borde `#e2e8f0`, radio 12 px |
| Texto principal / secundario | `#0f172a` / `#475569` |

Los colores del proyecto actual se llaman `siemens-*` en `tailwind.config.js`. **Decisión pendiente para el desarrollador:** renombrar esa escala a un nombre neutro (por ejemplo `brand`) y ajustarla al primario `#0f766e`, o añadir los tokens nuevos junto a los existentes. No dupliques valores en las vistas: define los tokens una vez en `tailwind.config.js`.

### 3.3 Escala de carga (la regla más importante)
La escala se calcula con `uso = horas / capacidad` y debe vivir en **un único helper** (propuesta: `frontend/src/utils/load.js`) que usen todas las vistas.

| Estado | Condición | Fondo | Borde / barra | Texto | Icono |
| --- | --- | --- | --- | --- | --- |
| Sin carga | horas = 0 | transparente | — | `#475569` | — |
| Libre | uso < 50 % | `#dbeafe` | `#60a5fa` / `#1d4ed8` | `#1e3a8a` | — |
| Media | 50 % a < 85 % | `#f1f5f9` | `#94a3b8` / `#475569` | `#1e293b` | — |
| Óptimo | 85 % a 100 % | `#bbf7d0` | `#16a34a` / `#15803d` | `#14532d` | — |
| Sobrecarga leve | > 100 % y ≤ 110 % | `#fde68a` | `#b45309` | `#78350f` | ▲ |
| Sobrecarga alta | > 110 % | `#fecaca` | `#b91c1c`, borde de 2 px | `#7f1d1d` | ▲ |

Reglas:
- **Nunca solo color.** La sobrecarga lleva icono de triángulo y el porcentaje en texto. Los estados deben distinguirse también por luminosidad, no solo por tono.
- Capacidad **desconocida** (`capacity === null`): no se marca como sobrecarga ni como libre. Se muestra la cifra sin barra y sin estado. Así lo hace el backend y el frontend debe respetarlo.
- Contraste de texto de al menos 4,5:1.
- Los umbrales (50, 85, 100, 110) son constantes en `load.js`, no valores sueltos en plantillas.

### 3.4 Chips de proyecto
Cada proyecto tiene un código corto (p. ej. `SIVE`, `TUB`, `RET`) con un par fondo/texto fijo. Generarlo de forma determinista a partir del `project_id` para que sea estable entre pantallas.

---

## 4. Navegación

### 4.1 Menú (un solo menú, sin dos contextos)
```
Mi espacio       Panel · Mi trabajo
Planificación    Capacidad · Gantt · Calendario
Organización     Proyectos · Personas · Departamentos
Administración   Configuración            (solo gerente)
```
- El **Calendario laboral** deja de ser un ítem del menú: pasa a ser una pestaña de *Configuración* (ver 5.5).
- Hoy `GLOBAL_SECTIONS` y `PROJECT_SECTIONS` en `frontend/src/utils/navigation.js` definen dos menús. Se unifica en uno.
- Por debajo de `md` el menú es un cajón con botón de apertura (`aria-expanded`). Por encima, barra lateral fija de 248 px.

### 4.2 Rutas: de dos árboles a uno
El proyecto pasa de ser un **espacio** a ser un **filtro**.

| Hoy | Propuesta |
| --- | --- |
| `/capacity` y `/projects/:id/capacity` | `/capacity?project=<id>` |
| `/gantt` y `/projects/:id/gantt` | `/gantt?project=<id>` |
| `/calendar` y `/projects/:id/calendar` | `/calendar?project=<id>` |
| `/planner` | se elimina, lo absorbe `/capacity` |
| `/work-calendar` | `/configuration/calendar` |
| `/projects/:id` (resumen) | se mantiene, con pestañas |
| `/projects/:id/kanban`, `/members`, `/settings` | se mantienen como pestañas del proyecto |

- Mantén **redirecciones** de las rutas antiguas a las nuevas para no romper enlaces guardados.
- `/` redirige según el rol: **técnico → `/my-work`**, **gerente y jefe de departamento → `/panel`**. Hoy `redirectToFirstProject` en `router/guards.js` los lleva a la matriz del primer proyecto.
- Con este cambio, `navigation.js` (284 líneas) y las ramas `isGlobal` de `AppShell.vue`, `CapacityMatrix.vue`, `GanttView.vue` y `CalendarView.vue` se simplifican mucho. Es el cambio más grande de la lista: va en la fase 5.

### 4.3 Estado de la vista en la URL
Estos valores viven en query params, con valores por defecto que no ensucian la URL:

| Pantalla | Params |
| --- | --- |
| Capacidad | `project`, `department`, `skill`, `mode` (`hours`\|`pct`\|`projects`), `from`, `to` (semanas ISO), `scale` (`week`\|`month`), `cell` (`<userId>:<semana>`) |
| Calendario | `project`, `month`, `view` |
| Configuración › Calendario | `month`, `day` |

Recargar o compartir el enlace debe reproducir la misma vista.

---

## 5. Pantallas

Cada subsección enlaza con su prototipo y con los ficheros reales que afecta.

### 5.1 Capacidad  ·  `prototipos/Main.dc.html`
Sustituye a: `components/CapacityMatrix.vue`, `views/PlannerView.vue`, `components/PlannerMatrix.vue`, `components/CellBreakdown.vue` y el modal que `CapacityMatrix` implementa a mano.

**Estructura**
1. Cabecera de página: título, subtítulo y selector de **modo** (Horas / % de uso / Proyectos).
2. Barra de filtros: proyecto, departamento, competencia (nivel mínimo), navegación de rango (anterior, **Hoy**, siguiente), selector de escala (semana / mes).
3. Resumen en chips: celdas sobrecargadas, huecos libres de 20 h o más, uso medio del equipo.
4. Matriz persona × semana + **fila final de equipo** con el uso agregado por semana.
5. Leyenda de la escala de carga (3.3).
6. **Panel lateral de detalle** (derecha), no modal.

**Matriz**
- Eje de semanas **continuo**: incluye semanas sin actividad. El rango por defecto es la semana actual y las siguientes 8.
- Cabecera de semana: `Sem 46` + rango de fechas (`9–15 nov`). Insignia **Hoy** en la semana actual e insignia de **festivo** si algún día no laborable global cae en ella.
- Cabecera y columna de personas **sticky**.
- Una celda es un `<button>` con `aria-label` completo (persona, semana, horas, capacidad, porcentaje, sobrecarga) y `aria-pressed` cuando está seleccionada.
- Contenido de celda por modo:
  - **Horas:** `36/40`, barra de uso e icono si hay sobrecarga.
  - **% de uso:** `90 %` y debajo `36/40 h`.
  - **Proyectos:** chips con el código de cada proyecto y las horas.
- Celdas con 0 horas: un punto `·`, no un `0`.
- La capacidad de cada celda sale del backend (`cell.capacity`), ya descontados horario versionado, factor de disponibilidad y festivos.

**Panel lateral**
- Cabecera: persona, semana y rango. Botón cerrar (`Esc` también cierra).
- Cifra grande `h` de `capacidad h`, píldora de estado + porcentaje, barra y nota (festivo, jornada reducida, etc.).
- Lista de tareas de esa persona esa semana, cada una con título, horas, chip de proyecto, **selector de reasignación** (solo miembros del proyecto) y botón Editar.
- Estado vacío: «Semana libre. Puedes asignar hasta N h» con botón *Asignar tarea*.
- Al editar o reasignar, la matriz se actualiza **sin cerrar el panel**, de modo que se ve cómo la celda deja de estar en rojo.
- Pie: *Nueva tarea esta semana*, *Ver en el Gantt*.

**Arrastrar y soltar**
- Se puede arrastrar una tarea del panel a la fila de otra persona.
- Mientras se arrastra, **todas las celdas de esa semana previsualizan la carga resultante** con la misma escala de colores y borde discontinuo; la celda de origen muestra lo que quedaría tras quitar la tarea.
- Las personas que **no son miembros del proyecto** de la tarea se marcan como destino no permitido (patrón rayado, `cursor: not-allowed`, texto «No es miembro del proyecto») y no aceptan el *drop*. Hoy esto solo falla con un 422 tras soltar.
- Actualización **optimista** con rollback si la API falla, en lugar de recargar todo (`load()`).
- Alternativa de teclado: `Mayús + ↑/↓` sobre una tarea del panel la mueve a la persona anterior o siguiente.

**Datos** (ver sección 7): el informe debe traer las personas dentro de la respuesta y admitir un rango continuo.

### 5.2 Mi trabajo  ·  `prototipos/MiTrabajo.dc.html`  ·  `prototipos/Movil.dc.html`
Archivo: `views/MyWorkView.vue`. Es la pantalla de entrada del técnico.
- Banner de alerta arriba si hay sobrecarga en alguna semana próxima, con acción *Avisar a mi jefe*. Esa acción es una **propuesta**: requiere un endpoint de notificación que hoy no existe; si no se implementa, retirar el botón.
- Gráfico de barras de las próximas 8 semanas con línea del 100 %, etiqueta de horas, icono de sobrecarga y marca de **Hoy** y festivo. El contenedor lleva `role="img"` y un `aria-label` que resume las cifras.
- Tarjeta «Esta semana»: horas, capacidad, barra y estado.
- Lista de tareas con pestañas *Esta semana / Próximas / Completadas*, y un selector para **cambiar el estado** directamente.
- **Móvil (< 640 px):** menú en cajón, tarjetas apiladas, controles de al menos 44 px, selector de estado a todo el ancho. *Mi trabajo* y *Kanban* son las dos vistas que se espera usar desde el móvil.

### 5.3 Panel  ·  `prototipos/Panel.dc.html`
Archivo: `views/PanelView.vue`. Entrada del gerente y del jefe de departamento.
- Cuatro indicadores clicables que llevan a la pantalla de origen: uso del equipo en la semana de referencia, personas con sobrecarga, proyectos activos, planificación incompleta.
- Uso del equipo por semana (barras con línea del 100 %).
- Lista de personas con sobrecarga y su máximo.
- Proyectos con más carga.
- **Planificación incompleta**: tareas sin persona o sin fechas, con acción *Resolver*. Sale de `unassigned_task_ids` y `undated_task_ids`, que el backend ya devuelve.

### 5.4 Proyecto  ·  `prototipos/Proyecto.dc.html`
Archivo: `views/ProjectSummaryView.vue`.
- Cabecera con nombre, estado, departamento gestor y responsable.
- Pestañas: **Resumen · Tablero · Miembros · Ajustes** (Ajustes entra en las pestañas, hoy solo se llega por enlaces internos).
- Accesos a *Ver su capacidad* y *Ver su Gantt*, que abren las vistas globales con `?project=<id>`.
- Estado de las tareas (barra segmentada + contadores), horas por semana del proyecto y equipo con su rol.

### 5.5 Configuración › Calendario laboral  ·  `prototipos/Configuracion.dc.html`
Archivos: `views/SettingsView.vue`, `views/WorkCalendarView.vue`, `components/people/WorkCalendar.vue`.
- Pestañas: **Calendario laboral · Personas · Departamentos · Proyectos · Roles · Competencias**.
- Alta y consulta de días no laborables en el mismo sitio (hoy están en dos: una pestaña de Personas y una vista aparte).
- Cuadrícula mensual con tres alcances, distinguibles por forma/etiqueta y color: **Global**, **Departamento**, **Persona**. Medio día marcado con «½».
- Panel de detalle del día: nombre, alcance, jornada, **impacto por persona** (`antes h → después h`, `−N h`) y aviso de tareas afectadas. Usa el cálculo de `GET /api/work-calendar`, que ya existe.
- Eliminar pide confirmación.

### 5.6 Componentes comunes  ·  `prototipos/Estados.dc.html`
Crear en `frontend/src/components/common/`:

| Componente | Sustituye a |
| --- | --- |
| `AsyncState.vue` (cargando / error / vacío, con `slot` para el contenido) | los «Cargando...» de texto plano (14 vistas) y los bloques de error copiados (23) |
| `AlertBanner.vue` (éxito / aviso / info / error, acción opcional) | los banners en línea y el toast flotante de `AppShell.vue`. Elegir **un** patrón |
| `PageHeader.vue` (migas, título, subtítulo, acciones) | cabeceras repetidas en cada vista |
| `SidePanel.vue` | el modal hecho a mano en `CapacityMatrix.vue`. Cierra con `Esc`, devuelve el foco |

Reglas:
- Carga: esqueleto con la forma de la pantalla, con `role="status"` y `aria-live="polite"`. Respeta `prefers-reduced-motion`.
- Error: `role="alert"`, mensaje comprensible y botón **Reintentar**.
- Vacío: texto y una acción (p. ej. *Crear proyecto*). Eliminar el mensaje «Ejecuta python backend/seed.py…» de la interfaz.
- Los modales y paneles llevan `role="dialog"`, `aria-modal`, trampa de foco y cierre con `Esc`. `ModalDialog.vue` ya cierra con `Esc`; reutilizarlo.

---

## 6. Correcciones de comportamiento (independientes del diseño)

1. **`auth.clear()` ante cualquier error.** `CapacityMatrix.vue` ejecuta `auth.clear()` en el `catch` de `onMounted`, incluso con un 500. Con el login automático de demo, el usuario vuelve a entrar sin enterarse. Debe cerrar sesión **solo ante un 401**.
2. **`<router-view :key="store.tasksRevision">`** (en `AppShell.vue`) remonta toda la vista al crear una tarea y se pierden filtros, scroll y pestañas. Sustituirlo por invalidación y recarga de datos sin remontar.
3. **Login automático de demo** (`stores/auth.js`, `DEMO_CREDENTIALS`). Debe estar detrás de una variable de entorno de desarrollo y desactivado por defecto en producción.
4. **Acentos y textos.** «Matriz de ocupacion», «Linea de tiempo», «Todavia»… sin tilde, mientras otras cadenas sí la llevan. Revisar todas las cadenas visibles.
5. **Cargas redundantes.** `CapacityMatrix.vue` pide los miembros de cada proyecto por separado en el modo global (`store.projects.map(... members ...)`) y descarga todas las tareas de la semana para filtrar por persona en el cliente. Ver sección 7.

---

## 7. Cambios de API necesarios

El frontend nuevo los necesita. **Cada uno es opcional para empezar** (la fase correspondiente puede funcionar con el comportamiento actual), pero la experiencia final los requiere.

| # | Cambio | Para qué |
| --- | --- | --- |
| 1 | `GET /api/capacity` acepta `from` y `to` (semanas ISO) y devuelve **todas** las semanas del rango, con o sin actividad | Eje continuo (5.1) |
| 2 | `GET /api/capacity` acepta `project_id` y `skill_id` + `min_level` | Filtros por proyecto y competencia |
| 3 | Cada fila del informe incluye `department_id`, `job_title` y el listado de proyectos en los que es miembro | Evitar N peticiones de miembros y poder bloquear destinos del arrastre |
| 4 | Cada semana del informe incluye `holidays: [{date, name, scope}]` (solo globales, para la cabecera) | Insignia de festivo |
| 5 | `GET /api/tasks` acepta `assigned_to` filtrando en SQL, y `week` filtrando en SQL | Rendimiento del panel lateral |
| 6 | `NoBusinessDaysError` en `build_capacity_report` se degrada a «tarea con 0 h y aviso» en lugar de lanzar | **Bug existente**: una tarea cuyas fechas quedan íntegramente cubiertas por festivos de la persona rompe toda la matriz (reproducible) |
| 7 | (Opcional) endpoint de aviso a la persona responsable | Botón *Avisar a mi jefe* de 5.2 |

El motor de cálculo sigue siendo el único sitio donde se calculan horas y capacidades.

---

## 8. Accesibilidad (criterios mínimos)

- Controles interactivos con `<button>` o `<a href>`, nunca `div` con `@click`.
- Botones que solo tienen icono: `aria-label`.
- SVG decorativos `aria-hidden="true"`; gráficos con `role="img"` y descripción.
- Tablas y matrices con `role` de tabla/rejilla y cabeceras de fila y columna.
- Foco visible en todos los controles; objetivos táctiles de al menos 40 px (44 px en móvil).
- Estado de carga y de error anunciados (`aria-live` / `role="alert"`).
- No transmitir información solo con color (3.3).

---

## 9. Plan por fases

Cada fase termina con `pytest`, `npm test`, `npm run build` y `npm run verify:css` en verde.

| Fase | Contenido | Riesgo |
| --- | --- | --- |
| **1** | Componentes comunes (5.6), correcciones 6.1, 6.3 y 6.4, y el bug de festivos (7.6) con su test | bajo |
| **2** | `load.js` con la escala de carga y su test unitario. Celdas con capacidad, %, barra e icono. Fila de equipo. Cabecera de semana con rango de fechas y «Hoy» | bajo |
| **3** | Eje de semanas continuo (API 7.1) y filtros por proyecto, departamento y competencia (7.2, 7.3), con estado en la URL | medio |
| **4** | Pantalla de Capacidad unificada con panel lateral y modos; eliminar `PlannerView`, `PlannerMatrix` y el modal manual. Arrastre con previsualización y teclado | medio |
| **5** | Menú agrupado, entrada por rol, rutas unificadas con filtro `?project=` y redirecciones, simplificar `navigation.js` | **alto** |
| **6** | *Mi trabajo*, *Panel* y *Proyecto* según 5.2 a 5.4; Configuración con calendario laboral integrado (5.5); responsive y cajón de menú | medio |

Orden recomendado: 1 → 2 → 3 → 4 → 6 → 5. La fase 5 toca todas las rutas y los tests de navegación, así que conviene hacerla cuando el resto está estable.

---

## 10. Criterios de aceptación

- [ ] Una sola pantalla de capacidad; `PlannerView.vue` y `PlannerMatrix.vue` eliminados.
- [ ] Toda celda muestra horas y capacidad, porcentaje, y señal no cromática de sobrecarga.
- [ ] El eje incluye semanas sin actividad, con «Hoy» y festivos marcados.
- [ ] Capacidad `null` no se pinta como sobrecarga ni como libre (con test).
- [ ] Una tarea cubierta por completo por festivos no provoca un error 500 en la matriz (con test).
- [ ] Un error 500 no cierra la sesión; un 401 sí (con test).
- [ ] Al arrastrar, los destinos no permitidos se marcan antes de soltar y la carga resultante se previsualiza.
- [ ] Todo se puede hacer con teclado, incluida la reasignación.
- [ ] Recargar la página conserva filtros, modo, rango, celda abierta y mes del calendario.
- [ ] El técnico aterriza en *Mi trabajo* y el gerente en *Panel*.
- [ ] No quedan «Cargando...» de texto plano ni bloques de error copiados en las vistas.
- [ ] Los tests existentes siguen pasando, y los que dependían de rutas antiguas se actualizan o se sustituyen.
- [ ] `npm run verify:css` pasa (las clases dinámicas deben declararse en ramas `v-if` o estar en la *safelist* de Tailwind, como ya indica el README).

---

## 11. Prototipos

La carpeta `prototipos/` contiene un fichero por pantalla:

| Fichero | Contenido |
| --- | --- |
| `Main.dc.html` | Capacidad (modos, filtros, panel lateral, simulación de arrastre) |
| `MiTrabajo.dc.html` | Mi trabajo (técnico) |
| `Panel.dc.html` | Panel (gerente) |
| `Proyecto.dc.html` | Resumen de proyecto |
| `Configuracion.dc.html` | Configuración › Calendario laboral |
| `Estados.dc.html` | Componentes comunes y estado en la URL |
| `Movil.dc.html` | Mi trabajo en 390 px |
| `canvas.json` | Posición de cada pantalla en el lienzo y notas |

**Cómo leerlos.** Son HTML autocontenido: la maqueta está en el bloque `<x-dc>` y los datos y la lógica de ejemplo en el `<script type="text/x-dc">` del final. Los estilos están en línea para facilitar la lectura; **no son el estilo final**, que debe usar los tokens de la sección 3 mediante Tailwind. Los datos son inventados.

**Importante.** Los ficheros dependen de un runtime (`support.js`) que **no está incluido**, por lo que no se abren de forma útil en un navegador sin él. Para el agente el valor está en leer su estructura, textos, `aria-label`, estados y lógica de ejemplo. Si se necesita verlos renderizados, abre el lienzo original en la herramienta donde se creó.

Los datos de ejemplo (personas, proyectos, horas) sirven solo para ilustrar las reglas y **no deben copiarse** a `seed.py`.

---

## 12. Reglas para el agente

1. Una fase por vez. Confirma que los tests pasan antes de empezar la siguiente.
2. No cambies el motor de capacidad salvo lo indicado en 7.6. No recalcules horas en el frontend.
3. Si el prototipo y el código real discrepan en un detalle (nombre de campo, forma de la respuesta), **manda el código real** y deja constancia del cambio en el mensaje del *commit*.
4. Si una decisión no está en este documento, elige la opción más simple que cumpla los criterios de la sección 10 y anótala aquí, en una sección «Decisiones tomadas».
5. No añadas dependencias nuevas sin necesidad. Todo lo descrito se resuelve con Vue, Pinia, Vue Router y Tailwind.
6. Mantén el idioma de la interfaz en español, con tildes.

---

## Decisiones tomadas
_(el agente las va añadiendo aquí)_
