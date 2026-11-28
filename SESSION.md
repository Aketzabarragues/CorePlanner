# Estado de la sesion

## 1) Objetivo actual

Rediseno del frontend hasta dejarlo igual que el boceto `docs/diseno_nuevo.html`,
vista por vista, con todo el color y la medida en `frontend/src/assets/tokens.css`.

## 2) Cambios realizados

Commits de la tanda (todos subidos a `origin/Main`):

- `dd34ecf` avatar unico `PersonAvatar` (dos iniciales, pastel del departamento,
  tamanos `xs`/`sm`/`md`/`lg`) en todas las vistas; lateral a 34 px de paso.
- `572a58b`, `4241d5b` Gantt: barras pastel con borde izquierdo, filas 40/36 px,
  linea de hoy continua, avatar y leyenda; barra de herramientas del boceto con las
  herramientas extra agrupadas a la derecha.
- `1690f06` Capacidad: celda vacia = punto, celdas de dos lineas, filas por contenido.
- `efb9219` Personas (pestanas en cabecera, sin columna Habilidades: vive en
  Competencias) y Actividad (centrada, dias en mayusculas, `estadoLegible`).
- `bfa22a8` Calendario; `c11ab40` Departamentos (rejilla de 3); `7a7d426` Proyectos
  (tabla por departamento); `cebbf0c` Mi trabajo (arregla `-8 h h` del festivo);
  `81ff403` Configuracion/Personas.
- Sin commit aun: las cinco pestanas restantes de Configuracion adoptan
  `useConfigAccion`; "Politica" gana su tilde en pestana, boton y dialogo.

## 3) Decisiones tecnicas

- Lateral a 34 px de paso, por debajo de los 44 px de zona tactil fijados antes:
  decision para igualar el boceto.
- El Panel conserva la tarjeta "Estado por departamento" aunque el boceto no la tiene
  (decision del usuario).
- Proyectos pasa de cards a tabla (decision del usuario).
- Un solo agente Qwen a la vez; los briefings dicen "no leas imagenes" y prohiben
  lanzar servidores en segundo plano (dejaban un `vite preview` que la interfaz
  mostraba como segundo agente).

## 4) Pendientes / siguiente paso inmediato

- Revision visual del usuario vista por vista; ajustes de detalle.
- Calendario laboral y Roles de Configuracion no tienen boton de alta propio:
  no se migraron.
- Opcionales sin pedir: tema oscuro (infra `[data-tema]` lista), `.ics` del Gantt.
