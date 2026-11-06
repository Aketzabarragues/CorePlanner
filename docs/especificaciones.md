# CorePlanner - Especificaciones (v1)

Documento de alcance. Define que tiene que tener la aplicacion para
considerarla util, y sobre todo que NO tiene que tener. Es la referencia para
decidir si una funcionalidad entra o se queda fuera.

## 1. Que es

CorePlanner sirve para planning de la carga de trabajo de un equipo de ingenieria:
cuantas horas tiene cada persona en cada semana, repartidas entre los proyectos
en los que trabaja, y si esa carga supera su disponibilidad.

Sustituye las hojas de Excel de reparto de horas. No es un gestor de tareas
general ni un ERP: no lleva costes, ni compras, ni contabilidad.

## 2. Quien la usa

| Rol | Quien es | Que necesita |
| --- | --- | --- |
| **Gerente** | Responsable de area o de empresa | Ver toda la organizacion y detectar donde falta gente |
| **Jefe de departamento** | Responsable de un area tecnica | Ver la carga de su equipo y de los proyectos de su area |
| **Tecnico** | Persona que ejecuta trabajo | Ver cuanto tiene asignado y en que proyectos esta |

Los tres roles son de **empresa**, no de proyecto. Cada persona tiene uno.

## 3. Ambito de cada rol

| | Gerente | Jefe de departamento | Tecnico |
| --- | --- | --- | --- |
| Departamentos | todos | el suyo | el suyo |
| Personas | todas | las de su departamento | las de su departamento, sin su carga |
| Proyectos | todos | los que gestiona su departamento + los que es miembro | los que es miembro + los que tiene tareas |
| Tareas | todas | las de los proyectos visibles + las propias | las de los proyectos visibles + las propias |
| Matriz de capacidad | toda la empresa | los proyectos visibles (los de su area) | los proyectos visibles |
| Edicion | en todos los proyectos | en los proyectos de su departamento | en los proyectos donde es miembro |

Dentro de un proyecto visible, la matriz muestra la ocupacion de **todos** sus
miembros, no solo la de quien mira. Sin eso la matriz no sirve para detectar
solapes.

## 4. Reglas de visibilidad

1. **El gerente ve todo**, sin necesidad de ser miembro de nada.
2. **El jefe ve su departamento**: las personas que lo forman y los proyectos que
   lo gestionan. Tambien ve los proyectos de los que es miembro aunque no los
   gestione su departamento.
3. **El tecnico ve sus proyectos**: los de los que es miembro y los que tiene
   tareas asignadas. Una tarea asignada le da visibilidad del proyecto entero,
   aunque su departamento no lo gestione.
4. **La pertenencia al proyecto da permisos, el rol de empresa da ambito.**
   Ser miembro de un proyecto da acceso a el; el rol dentro del proyecto (ver,
   editar, gestionar miembros) dice que se puede hacer ahi dentro.
5. **El acceso se resuelve una vez**, al entrar, y no cambia durante la sesion.

## 5. Configuracion de la empresa

Lo que un administrador puede dar de alta y mantener:

| Elemento | Que se configura |
| --- | --- |
| Departamentos | nombre y responsable |
| Personas | nombre, correo, rol de empresa, departamento, puesto, nivel, tipo de contrato y horas base semanales |
| Horarios de persona | dias laborables por semana, factor de disponibilidad y fecha de entrada en vigor |
| Dias no laborables | fecha, nombre y alcance (global o de departamento) |
| Competencias | catalogo de habilidades y nivel de cada persona en cada una |
| Proyectos | nombre, departamento que lo gestiona, responsable y estado |
| Miembros de proyecto | que personas entran en cada proyecto y con que rol |
| Periodo de planificacion | cuantas semanas se muestran por defecto en la matriz |

Esta parte es configurable porque la empresa cambia. El conjunto de roles, en
cambio, es cerrado: gerente, jefe de departamento y tecnico. Crear roles nuevos
es material de una version posterior.

Los formularios de alta y edicion se abren en un modal centrado desde el boton
de cada panel, no en una tarjeta siempre visible: la tabla manda y el formulario
aparece solo cuando hace falta.

La configuracion de cada proyecto tiene su propia pantalla, dentro del espacio
del proyecto: ahi se editan el nombre, el estado, el departamento que lo
gestiona y el responsable, y ahi se da de alta a la gente que entra, se le
cambia el rol y se la quita. Editar el equipo de un proyecto es del gerente,
igual que el resto de la configuracion; quien no lo es ve la lista y los datos
del proyecto, pero sin poder tocarlos.

## 6. Que tiene que tener la aplicacion

| Pantalla | Para que sirve |
| --- | --- |
| Acceso | entrar con correo y contrasena |
| Mi trabajo | las tareas propias en el periodo de planificacion |
| Panel global | el estado de la organizacion de un vistazo |
| Proyectos | listado filtrado por el ambito de quien entra |
| Detalle de proyecto | tareas, miembros y estado |
| Tareas | alta, edicion, borrado, fechas, horas, responsable y estado |
| Matriz de capacidad | personas por semanas, con la sobrecarga marcada |
| Cronograma | barras de las tareas de un proyecto |
| Tablero | columnas por estado de las tareas de un proyecto |
| Departamentos | quien hay en cada area, con su carga |
| Personas y competencias | directorio con el horario vigente de cada persona, historial de horarios y matriz de competencias |
| Configuracion | personas, roles, departamentos, proyectos y catalogo de competencias (solo gerente) |
| Miembros del proyecto | quien entra en el proyecto, con que rol y que horas base (el gerente lo edita) |
| Configuracion del proyecto | nombre, estado, departamento que lo gestiona y responsable (el gerente lo edita) |

## 7. Que NO tiene que tener la aplicacion (v1)

Esta lista es la que evita que la aplicacion crezca otra vez.

- Wiki, foros, reuniones, noticias, documentos.
- Control de costes, presupuestos y facturacion.
- Campos personalizados y tipos de tarea a medida.
- Sprints, versiones e iteraciones: el periodo es por semanas.
- Informes y exportacion a Excel.
- Integraciones con Jira, GitHub, LDAP, SAML u OIDC.
- Planificador de recursos con arrastres y tarjetas por persona.
- Aplicacion movil.
- Permisos por tarea concreta (compartir una tarea suelta).
- Veredictos discretos de capacidad (critical, tight, balanced, buffer): son la
  politica de capacidad y van aparte, con sus umbrales y sus aprobaciones.
- Semantica del tipo de contrato en el calculo: por ahora es un dato.
- Asignacion automatica de tareas por competencia.
- Horarios por proyecto: el horario es de la persona, no del proyecto.

## 8. Datos minimos

| Entidad | Campos |
| --- | --- |
| Persona | nombre, correo, rol de empresa, departamento, puesto, nivel, tipo de contrato y horas base semanales |
| Horario de persona | persona, fecha de entrada en vigor, horas laborables de cada dia y factor de disponibilidad |
| Dia no laborable | fecha, nombre y alcance (global o de departamento) |
| Competencia | nombre del catalogo |
| Nivel de competencia | persona, competencia y nivel |
| Departamento | nombre, responsable |
| Proyecto | nombre, departamento que lo gestiona, responsable, estado |
| Miembro de proyecto | persona, proyecto, rol en el proyecto |
| Tarea | proyecto, titulo, responsable, estado, fechas, horas estimadas |

## 9. Que ya esta construido

| Parte de la especificacion | Estado |
| --- | --- |
| Departamentos y personas con departamento | Hecho |
| Proyectos con departamento que los gestiona | Hecho |
| Roles por proyecto con permisos | Hecho |
| Acceso con JWT y administrador global | Hecho |
| Matriz de capacidad por semanas con sobrecarga | Hecho |
| Cronograma y tablero | Hecho |
| Ambito global (todo lo que puede ver quien entra) | Hecho |
| Rol de empresa (gerente / jefe / tecnico) | Hecho |
| Responsable de proyecto | Hecho |
| Mi trabajo | Hecho |
| Panel global | Hecho |
| Pantalla de configuracion | Hecho |
| Horario versionado por persona | Hecho |
| Dias no laborables con alcance | Hecho |
| Competencias | Hecho |
| Pantalla de personas y competencias | Hecho |
| Miembros del proyecto (alta, cambio de rol y baja) | Hecho |
| Configuracion del proyecto | Hecho |

El administrador global que existe hoy es, de hecho, el gerente: el cambio que
ya esta hecho es que deje de ser un interruptor y pase a ser un rol de empresa
con su departamento y sus reglas de ambito.

## 10. Decisiones tomadas

1. **Alcance del tecnico.** No ve la carga de sus compañeros de departamento
   si no comparte proyecto con ellos. Solo ve la de los proyectos en los que
   participa.
2. **Editable por el jefe.** El jefe de departamento puede crear y editar
   tareas de los proyectos de su area.
3. **Responsable de proyecto.** Se anade una persona responsable por proyecto,
   distinta del departamento que lo gestiona.
4. **Horizonte de la matriz.** Cuatro semanas por defecto.

## 11. Bloque de personas: horario, competencias y calendario

La persona deja de ser un usuario con acceso y pasa a tener una identidad
profesional: puesto, nivel, tipo de contrato, horario vigente y competencias.

### Que entra

| Pieza | Que resuelve |
| --- | --- |
| Horario versionado por persona | La capacidad deja de ser un escalar y pasa a depender de la semana |
| Factor de disponibilidad | Permite «hasta marzo al 100 %, desde abril al 80 %» |
| Dias no laborables con alcance | Una tarea que cruza un puente se reparte en los dias que existen |
| Puesto, nivel y tipo de contrato | Identidad profesional de la persona |
| Competencias con nivel 1-3 | Catalogo de habilidades y matriz de la demo |
| Pantalla de personas y competencias | Directorio, historial de horarios y matriz |

### Como se calcula la capacidad de una semana

1. El horario vigente de una semana es el ultimo con fecha de entrada en vigor
   anterior o igual al lunes de esa semana.
2. La capacidad de la semana es la suma de las horas laborables de los siete
   dias multiplicada por el factor de disponibilidad.
3. Si la persona no tiene horario, se usa su horas base semanales.
4. Si la capacidad resuelta queda en cero horas, **su capacidad se desconoce**:
   no se marca como sobrecargada, porque el motor no inventa un limite que
   nadie ha definido.
5. Los dias no laborables de alcance global se quitan a todo el mundo; los de
   alcance de departamento, solo a quien pertenece a ese departamento.

### Reparto de las horas de una tarea

Las horas de una tarea se reparten entre los dias laborables de su rango: lunes
a viernes, menos los dias no laborables que apliquen a la persona asignada. Un
festivo de medio dia recibe la mitad de horas que un dia normal. El reparto es
proporcional al peso de cada dia y en centimas enteras, de modo que la suma de
las partes coincide exactamente con el total.

### Que no entra

- Veredictos discretos de capacidad y politica de umbrales (va aparte).
- Semantica del tipo de contrato en la matematica (por ahora es un dato).
- Asignacion automatica de tareas por competencia.
- Horarios por proyecto.

### Decisiones de este bloque

1. **El horario se guarda en centimas de hora enteras**, no en minutos: un
   minuto son 100/60 centimas y no siempre cabe en centimas enteras.
2. **El factor de disponibilidad es un porcentaje entero** entre 0 y 100.
3. **El nivel de competencia va de 1 a 3**, como en la demo.
4. **Las horas base semanales se mantienen obligatorias**, con 40 h por
   defecto. Una capacidad de cero horas se interpreta como capacidad no
   definida.
5. **El tipo de contrato tiene tres valores** (objetivo, techo, mejor
   esfuerzo) y no cambia todavia el calculo.
6. **La pantalla de personas y competencias vive en el espacio global** y tiene
   tres pestanas: directorio, competencias y dias no laborables.

### Donde se configura cada cosa

| Que | Donde | Quien |
| --- | --- | --- |
| Competencias del catalogo | Configuracion, pestana de competencias | Gerente |
| Nivel de una persona en cada competencia | Ficha de la persona | Gerente |
| Horario de una persona | Ficha de la persona, historial de horarios | Gerente |
| Dias no laborables | Pestana de dias no laborables | Gerente |
| Puesto, nivel y tipo de contrato | Configuracion, personas | Gerente |
| Equipo de un proyecto | Vista de miembros del proyecto | Gerente |
| Nombre, estado, departamento gestor y responsable de un proyecto | Vista de configuracion del proyecto | Gerente |

El catalogo de competencias **no es una lista fija**: se anade, se renombra y
se quita. Una competencia que alguien tiene asignada no se puede quitar, para
no dejar a nadie con un nivel sin nombre. El catalogo dice cuantas personas
tienen cada competencia.

El catalogo vive en **Configuracion**, no en la pantalla de personas: alli se
define que habilidades existen. La pantalla de personas responde a otra
pregunta, quien tiene cual, y por eso muestra la matriz y no el catalogo.

Los horarios van por versiones: cada una tiene su fecha de entrada en vigor.
Se pueden corregir o quitar, y el historial conserva lo que habia antes.
Corregir una version no cambia su fecha de entrada en vigor: cambiarla seria
otra version, no una correccion.

## 12. Pantalla de Mi trabajo

Es la vista personal: lo que tengo que hacer yo en el periodo de planificacion.
Vive en el espacio global, en `/my-work`, y cualquiera puede abrirla: no depende
del rol, porque cada uno ve lo suyo.

### Que entra

- Las **tareas propias** de los proyectos visibles, con su proyecto, su estado,
  sus fechas y las horas que caen dentro del periodo.
- La **carga por semana**: las horas propias de cada semana del periodo, la
  capacidad de esa semana y la marca de sobrecarga.
- El **periodo es el mismo** que el de la matriz de capacidad global: las
  semanas en las que hay actividad en los proyectos visibles. Asi las dos
  vistas hablan del mismo periodo y no hay que elegir entre ellas.

### Que no entra

- El horizonte configurable: el periodo se deduce de la actividad.
- Navegar de una semana a otra, o filtros por proyecto, estado o persona.
- Editar tareas desde aqui: la vista es de lectura, se editan en el tablero o
  en el desglose de una celda de la matriz.
- Arrastrar y soltar, o la asignacion por competencia.
- Imputacion de horas, que es la pantalla de tiempo del proyecto.
- Las tareas de otras personas: esta pantalla es la de uno mismo.

## 13. Panel global

Es la pantalla de entrada: el estado de la organizacion de un vistazo. Vive en
el espacio global, en `/panel`, y cualquiera puede abrirla.

### Que entra

- **Utilizacion de la semana de referencia**: horas planificadas frente a
  capacidad, en porcentaje. La semana de referencia es la semana en curso si hay
  actividad en ella, y si no la primera del periodo, para que el panel siempre
  muestre una semana con datos.
- **Personas sobrecargadas**: quien supera su capacidad en alguna semana del
  periodo, con sus horas, su capacidad y el exceso.
- **Proyectos por estado** y **tareas por estado**: recuentos.
- **Proyectos con mas carga**: horas estimadas, numero de tareas y de personas
  de cada proyecto visible.
- **Personas con carga** y **tareas del periodo**: dos recuentos mas.

### Que no entra

- Veredictos discretos, aprobaciones e incidentes de politica: son la politica
  de capacidad (N1) y van aparte.
- La bitacora de actividad: es su propia pantalla.
- Filtros, rangos de fecha y comparativas entre periodos.
- Edicion: el panel es de lectura.
- Asignacion automatica de trabajo.
