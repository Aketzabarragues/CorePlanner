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

### Fase 1 — Componentes comunes y textos

1. **El detalle se abre en un panel lateral, no en un modal centrado.** El
   desglose de una celda tapaba la matriz justo cuando el operario la está
   leyendo. El panel entra desde la derecha y es un diálogo (`role="dialog"`,
   `aria-modal`, cierre con `Esc`, foco atrapado).
2. **`PageHeader` no lleva migas.** El shell ya las pinta encima de la vista;
   meterlas también en el componente era verlas dos veces.
3. **El comportamiento de los diálogos vive en `useDialog`.** Esc, bloqueo del
   desplazamiento, trampa de foco y devolución del foco. `ModalDialog` lo adopta
   y de paso gana la trampa de foco que le faltaba.
4. **Un solo patrón de aviso:** el banner en línea, con icono y acción
   opcional. El toast flotante desaparece. El azul de Siemens se mantiene; los
   avisos usan la paleta estándar de Tailwind.
5. **El esqueleto envuelve solo el contenido, por debajo de la cabecera.** La
   cabecera se ve mientras cargan los datos, y el esqueleto sale al cargar y al
   reintentar, no en cada refresco.
6. **Lo que ve el operario lleva tilde, lo que no se ve sigue en ASCII.**
   Incluidos los mensajes de error del backend y los datos de demostración (un
   nombre de proyecto sale en pantalla). Los mensajes de validación de Pydantic
   siguen en inglés: es un problema de idioma, no de tildes, y queda pendiente
   de decidir aparte.
7. **El login automático de demostración queda detrás de una variable de
   entorno** y desactivado por defecto en producción.

### Fase 2 — Escala de carga e informes que no se piden dos veces

8. **La escala vive en `utils/load.js`, no en las plantillas.** Los umbrales
   (50 %, 85 %, 100 %, 110 %) son constantes del módulo. Las vistas pintan; no
   calculan. Así la escala es la misma en la matriz, en el panel y en el
   planificador, y se puede probar sola.
9. **La capacidad desconocida (`capacity` a null) no se inventa.** La celda
   enseña las horas sin barra, sin estado y sin color de fondo. Pinta "libre"
   cuando no se sabe si está libre sería mentir.
10. **El perfil de la persona viaja en el informe** (`department_id`,
    `job_title`, `project_ids`): es el cambio 7.3 de la propuesta, adelantado
    aquí porque sin él la pantalla global hace una petición por proyecto solo
    para pintar el detalle. Con el perfil en la fila, se sabe además a quién se
    puede reasignar una tarea sin mirar otra pantalla.
11. **El filtro por persona va en SQL** (`assigned_to` y `week`), no en el
    cliente. El backend ya filtraba por semana; faltaba el filtro por persona.
12. **La sobrecarga la sigue diciendo el backend.** La celda usa el mismo
    `capacity` que el motor usa para marcarla, de modo que el icono y el color
    no pueden contradecirlo. El triángulo acompaña siempre al color.
13. **A quién se puede reasignar: los miembros del proyecto de la tarea.** Las
    filas del informe son el universo de personas; los no-miembros llegan con
    `project_ids` vacío y no se ofrecen como destino.
14. **La fila de equipo suma lo que el backend ya devuelve.** Si alguien no
    tiene capacidad, la fila se marca como desconocida, no como cero.
15. **La insignia de "Hoy" y el rango de fechas sí entran en la fase 2.** La
    insignia de festivo espera a la fase 3, que necesita el cambio 7.4 de la
    API.

### Fase 3 — Eje de semanas continuo, filtros y estado en la URL

16. **Cada semana del informe es un objeto** `{week, holidays}`. Es la forma que
    ya usa el informe de "Mi trabajo" y deja sitio a lo que crece en la fase 4.
    El motor sigue trabajando con las claves de semana: el cambio de forma es
    de la capa que habla con el frontend.
17. **El backend obedece al rango.** Si no llegan `from` y `to`, el informe sale
    como hasta ahora: las semanas con actividad. Así el panel, el resumen de
    proyecto y el resto de consumidores no cambian de golpe.
18. **El rango por defecto lo decide el frontend**: la semana en curso y las
    ocho siguientes, nueve columnas. Las flechas mueven el rango una semana, no
    un periodo entero, y "Hoy" lo devuelve a la semana en curso.
19. **La insignia de festivo solo enseña los días globales.** La cabecera es de
    la matriz, no de una persona: un festivo de departamento o de persona no
    aplica a toda la columna.
20. **El filtro por competencia filtra personas**, no proyectos: solo salen las
    que tienen esa competencia con ese nivel o más.
21. **El filtro por departamento no cambia de significado**: sigue siendo "los
    proyectos que gestiona ese departamento".
22. **El estado en la URL usa los nombres de la propuesta** (`?from=`, `?to=`,
    `?project=`, `?department=`, `?skill=`, `?level=`), no los de la API
    (`project_id`, `skill_id`, `min_level`): el enlace se escribe a mano y se
    comparte.
23. **Con filtro de proyecto, el desglose es el de ese proyecto.** La celda
    cuenta las horas de una persona en un proyecto, así que el panel tiene que
    enseñar las tareas de ese mismo proyecto.
24. **Las dos semanas del rango van juntas**: si llega una sola, es un 422. Un
    rango a medias no significa nada.

### Fase 4 — Una sola pantalla de capacidad, con arrastre y previsualización

25. **El reparto por proyecto de cada celda lo trae el informe.** El motor
    acumula el reparto por proyecto de cada persona y semana con el mismo
    criterio con el que reparte las horas, así que los proyectos siempre suman
    las horas de la celda. El modo Proyectos no hace una petición por celda.
26. **La línea de tiempo por persona se va con el planificador.** El detalle de
    una celda (qué tareas componen esas horas) vive en el panel lateral, y el
    Gantt global ya cubre el reparto por proyecto.
27. **La previsualización usa las horas de la tarea en esa semana**
    (`week_hours`), no las estimadas enteras: es lo que cuenta la celda, así
    que lo que se previsualiza es exactamente lo que va a pasar.
28. **La previsualización solo afecta a la semana de la tarea.** El arrastre
    mueve el responsable, no las fechas: la tarea no cambia de columna.
29. **El destino que no es miembro del proyecto se marca antes de soltar**, con
    rayado y sin aceptar el destino. El backend ya lo rechazaba con un 422;
    ahora el operario lo ve antes de soltar.
30. **La actualización optimista mueve las horas de la semana abierta y vuelve
    atrás si la API falla.** El reparto por proyecto de la celda se ajusta con
    el mismo criterio que el backend; al recargar, el informe manda.
31. **Mayús + ↑/↓ hace lo mismo que arrastrar**: mueve la tarea a la persona de
    al lado, con la misma condición de miembro del proyecto.
32. **El alta de una tarea nueva solo aparece en la vista de proyecto.** En la
    global no hay un proyecto delante: el alta vive en el shell, con selector
    de proyecto.
33. **El modo y la celda abierta viven en la URL** (`?mode=`, `?cell=`), pero no
    recargan el informe: solo lo hacen los seis filtros.
34. **El panel de detalle de la capacidad no es modal.** Es una columna al
    lado, como en el prototipo: la matriz se sigue viendo y se puede seguir
    usando, porque las celdas tienen que recibir el arrastre de una tarea. En
    el resto de pantallas el panel sigue siendo modal.

**Lo que el código real hace distinto del prototipo.** El prototipo simula el
arrastre con un botón y un conjunto de datos de ejemplo; aquí el arrastre es
el nativo del navegador y sale de la lista de tareas del panel lateral. La
previsualización enseña las horas con el formato de la celda ("36 h", "48 h")
en vez de una simulación fija, y el destino bloqueado se marca con rayado
como en el prototipo, pero con el texto del proyecto real en vez de "RET".
