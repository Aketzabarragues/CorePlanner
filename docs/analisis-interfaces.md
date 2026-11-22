# La aplicacion y su ciclo de vida

Analisis hecho sobre la aplicacion en marcha (API y SPA levantadas, semilla de
demostracion) recorriendo **todas** las ventanas con un navegador real, con
capturas de cada una. Las capturas estan en `_capturas/` (fuera del repo, para
no ensuciarlo).

Este documento es la foto del producto: que hay, como se recorre el ciclo de
una tarea desde que se planifica hasta que se cierra, y que se ha
encontrado por el camino.


## 1. Que es y para quien

CorePlanner sustituye las hojas de Excel de reparto de horas. La pregunta que
responde es una: **cuantas horas tiene esta persona esta semana, y le caben**.

Tres roles de empresa, con distinto alcance:

| Rol | Que ve | Que puede hacer |
| --- | --- | --- |
| **Gerente** | Toda la organizacion | Configura personas, horarios, departamentos, proyectos, roles, competencias y la politica de capacidad |
| **Jefe de departamento** | Su departamento y los proyectos que gestiona | Edita tareas, asigna, resuelve aprobaciones de su gente |
| **Tecnico** | Sus proyectos y su carga | Imputa horas, mueve sus tareas, informa de las incidencias de su carga |

Dos espacios, con menus distintos:

- **Global** (`/panel`, `/my-work`, `/capacity`, `/gantt`, `/calendar`,
  `/projects`, `/people`, `/departments`, `/activity`, `/configuration`): el
 |area de la empresa.
- **Proyecto** (`/projects/:id` con las pestanas Resumen, Tablero, Lista,
  Miembros y Ajustes, mas sus vistas de capacidad, Gantt, calendario y
  actividad): el area de un proyecto.

## 2. El ciclo de vida de una tarea

**1. Se planifica.** El gerente crea el proyecto (nombre, color, departamento
que lo gestiona, responsable) y da de alta a su gente con su rol dentro del
proyecto. Cada persona tiene un horario versionado (dias laborables, factor de
disponibilidad y fecha de entrada en vigor) y un calendario de dias no
laborables. Las tareas se crean con horas estimadas, fechas y responsable.

**2. Se reparte.** El motor de capacidad reparte las horas de cada tarea entre
los dias laborables de su rango, las imputa a la semana ISO de cada dia y las
suma por persona. La capacidad de esa semana sale del horario vigente (el
ultimo con `valid_from <= lunes`) por el factor de disponibilidad, menos los
dias no laborables que apliquen a esa persona. Todo en centimas de hora
enteras: el total de la matriz coincide exactamente con la suma de las tareas.

**3. Se controla.** La matriz de capacidad cruza al equipo contra las semanas y
enseña, celda a celda, la carga, la capacidad, las horas libres, el veredicto
de la politica y las horas realmente registradas. El Gantt enseña lo mismo en
el tiempo, y el calendario, dia a dia.

**4. Se ejecuta.** La tarea recorre sus estados (Backlog, En Desarrollo,
Pruebas FAT/SAT, Completado) en el tablero, cambiando de columna al arrastrarla.
Sus fechas se mueven en el Gantt, y con ellas su reparto de horas. El calendario
es la lectura diaria: arrastrar una barra a otro dia la desplaza conservando
la duracion.

**5. Se imputa.** Cada persona registra las horas que ha dedicado a cada tarea,
desde el detalle de la tarea. La comparacion plan/real aparece en el desglose
de celda; cuando nadie ha imputado, la celda dice "sin imputar" en vez de un
cero, porque un cero afirmaria algo que el dato no sostiene.

**6. Se gobierna.** Si la carga de alguien cruza el umbral que exige
aprobacion, se abre un incidente **en la misma transaccion** que el cambio de
tarea que lo provoco. Quien puede resolverlo (el jefe de su departamento o el
gerente) lo aprueba o lo rechaza desde el panel global. Un incidente
resuelto no se reabre: fue un hecho que hubo que aprobar.

**7. Se cierra.** La exportacion `.ics` baja el proyecto a un calendario
externo (RFC 5545: `DTEND` exclusivo, `UID` estable, plegado a 75 octetos). La
bitacora de actividad deja constancia de cada cambio, con su actor y su
momento.

## 3. Que se ha encontrado por el camino

El recorrido con navegador ha encontrado **cuatro fallos que ninguna suite de
tests puede ver**, porque son de la capa visual:

1. **El Gantt no dibujaba ni una barra.** El atributo `transform` de un
   elemento SVG no admite unidades CSS: con `translate(98px, 42px)` el
   navegador descarta el atributo entero. El diagrama se veia con el eje, el
   sombreado y la columna de nombres, y sin barras. Corregido (y con un test
   de regresion que fija el formato del `transform`).
2. **El alta inline del Kanban estaba en las cuatro columnas a la vez**, cada
   una con su formulario: el tablero parecia un formulario de cadastro. Ahora
   cada columna muestra un boton discreto "+ Anadir tarea" y el formulario
   aparece solo en la columna que se pide, y se cierra al crear, al pulsar
   `Escape` o al abrir otra.
3. **El calendario abria en un sitio vacio.** La semilla ancla el trabajo
   dos y tres semanas por delante, asi que la semana en curso no tiene tareas
   y el mes se abria por su primera semana, tambien vacia. Ahora el mes se
   desplaza a la primera semana con trabajo, y la vista de semana avisa
   ("No hay tareas en esta semana") con un boton que salta a la semana con
   trabajo.
4. **Los plurales perezosos** ("1 tareas", "N persona(s)") en el tablero, el
   panel, el calendario, los miembros y el resumen de proyecto. Corregidos con
   un helper (`utils/plural.js`).

Ademas, la prueba del servidor MCP en marcha encontro que **la salida de las
tools no era parseable**: una lista se repartia en varios bloques de texto y
una lista vacia no daba ninguno. Ahora cada tool devuelve un objeto, con lo
que hay un unico documento JSON por llamada.

**La consola del navegador queda limpia**: los unicos errores eran 404 del
favicon, que no son de la aplicacion.

## 4. Lo que se ve bien

- La **matriz de capacidad** es la pantalla mejor resuelta: la carga, la
  capacidad, el porcentaje, las horas libres (con su signo cuando hay
  sobrecarga), el festivo, el dia de hoy y el total por persona. La celda
  sobrecargada se ve en rojo con un aviso, y el desglose lateral explica el
  por que.
- El **Gantt** (ya con motor propio) enseña la barra con su color de persona,
  su avance por estado, el eje ISO con las semanas, el sombreado de los fines
  de semana y la linea de hoy.
- El **tablero** lee como un tablero: cuatro columnas con su contador de
  tareas y horas, la tarjeta con su responsable, sus horas y sus fechas.
- El **detalle de tarea** tiene la forma de una ficha completa, con las horas
  imputadas y las dependencias en su propia seccion.
- El **panel global** responde de un vistazo: uso del equipo, quien esta
  sobrecargado, proyectos activos, planificacion incompleta y el bloque de
  aprobaciones pendientes.

## 5. Lo que queda flojo

- **La semana en curso vacia** en la demostracion: la semilla pone todo el
  trabajo dos y tres semanas por delante para que los escenarios de sobrecarga
  se vean. Es util para probar la sobrecarga y deja la primera pantalla del
  calendario y de "Mi trabajo" vacia. La aplicacion ya responde (desplazandose
  al trabajo y avisando), pero el scenario de arranque begs a revision.
- **Las fechas de los formularios** usan el formato del navegador, no el de la
  aplicacion: en un navegador en ingles salen como `11/30/2026`. No es un
  error (el `input type="date"` es del navegador), pero conviene saberlo.
- **La paleta de personas cicla cada seis**: con mas de seis personas, la
  septima repite el color de la primera. El color de proyecto si escala (la
  paleta cerrada de dieciocho).
- **Sin notifications**: una sobrecarga no avisa a nadie, hay que mirar la
  matriz. Es una decision, no un descuido, pero es el siguiente hueco.

## 6. Indice de capturas

| Captura | Ventana |
| --- | --- |
| 01-login | Acceso |
| 02-panel-global | Panel global |
| 03-mi-trabajo | Mi trabajo |
| 04-capacidad-global | Matriz de capacidad |
| 05-capacidad-detalle-celda | Desglose de una celda |
| 06-gantt-global | Diagrama de Gantt (global) |
| 07-gantt-detalle-tarea | Detalle de tarea |
| 08-calendario-mes | Calendario, vista de mes |
| 09-calendario-semana | Calendario, vista de semana |
| 10-calendario-dia | Calendario, vista de dia |
| 11-proyectos-listado | Proyectos |
| 12-personas-competencias | Personas y competencias |
| 13-departamentos | Departamentos |
| 14-actividad | Actividad |
| 15-configuracion-politica | Configuracion: politica de capacidad |
| 16-configuracion-personas | Configuracion: personas |
| 17-configuracion-calendario-laboral | Configuracion: calendario laboral |
| 18-configuracion-proyectos | Configuracion: proyectos |
| 19-configuracion-competencias | Configuracion: competencias |
| 20-configuracion-roles | Configuracion: roles |
| 21-proyecto-resumen | Proyecto: resumen |
| 22-proyecto-tablero | Proyecto: tablero Kanban |
| 23-proyecto-tablero-alta | Proyecto: alta inline bajo demanda |
| 24-proyecto-lista-tareas | Proyecto: lista de tareas |
| 25-proyecto-miembros | Proyecto: miembros |
| 26-proyecto-ajustes | Proyecto: ajustes |
| 27-proyecto-gantt | Proyecto: Gantt |
| 28-proyecto-capacidad | Proyecto: capacidad |
| 29-proyecto-calendario | Proyecto: calendario |
| 30-proyecto-actividad | Proyecto: actividad |
| 44-capacidad-detalle-celda | Desglose de celda (interaccion) |
| 45-gantt-detalle-tarea | Detalle de tarea (interaccion) |
| 46-calendario-dia | Vista de dia (interaccion) |
| 47/48-proyecto-tablero-alta | Alta inline del tablero (interaccion) |
