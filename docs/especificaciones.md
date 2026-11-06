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
| Personas | todas | las de su departamento | las de su departamento |
| Proyectos | todos | los que gestiona su departamento + los que es miembro | los que es miembro + los que tiene tareas |
| Tareas | todas | las de los proyectos visibles + las propias | las de los proyectos visibles + las propias |
| Matriz de capacidad | toda la empresa | su departamento y los proyectos visibles | los proyectos visibles |
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
| Personas | nombre, correo, rol de empresa, departamento y horas base semanales |
| Proyectos | nombre, departamento que lo gestiona, responsable y estado |
| Miembros de proyecto | que personas entran en cada proyecto y con que rol |
| Periodo de planificacion | cuantas semanas se muestran por defecto en la matriz |

Esta parte es configurable porque la empresa cambia. El conjunto de roles, en
cambio, es cerrado: gerente, jefe de departamento y tecnico. Crear roles nuevos
es material de una version posterior.

## 6. Que tiene que tener la aplicacion

| Pantalla | Para que sirve |
| --- | --- |
| Acceso | entrar con correo y contrasena |
| Mi trabajo | las tareas propias en el periodo de planificacion |
| Proyectos | listado filtrado por el ambito de quien entra |
| Detalle de proyecto | tareas, miembros y estado |
| Tareas | alta, edicion, borrado, fechas, horas, responsable y estado |
| Matriz de capacidad | personas por semanas, con la sobrecarga marcada |
| Cronograma | barras de las tareas de un proyecto |
| Tablero | columnas por estado de las tareas de un proyecto |
| Departamentos | quien hay en cada area, con su carga |
| Configuracion | personas, roles, departamentos y proyectos (solo gerente) |

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

## 8. Datos minimos

| Entidad | Campos |
| --- | --- |
| Persona | nombre, correo, rol de empresa, departamento, horas base semanales |
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
| Ambito global (todo lo que puede ver quien entra) | Hecho, pero solo por pertenencia al proyecto |
| Rol de empresa (gerente / jefe / tecnico) | **No existe** |
| Responsable de proyecto | **No existe** |
| Mi trabajo | **No existe** |
| Pantalla de configuracion | **No existe** |

El administrador global que existe hoy es, de hecho, el gerente: el cambio que
falta es que deje de ser un interruptor y pase a ser un rol de empresa con su
departamento y sus reglas de ambito.

## 10. Decisiones pendientes

1. **Alcance del tecnico.** Un tecnico ve la carga de sus compañeros de
   departamento aunque no comparta proyecto con ellos? Propuesta: no, solo ve la
   de los proyectos en los que participa.
2. **Editable por el jefe.** El jefe de departamento puede crear y editar
   tareas de los proyectos de su area, o solo consultar? Propuesta: editarlas.
3. **Responsable de proyecto.** Se anade una persona responsable por proyecto,
   distinta del departamento que lo gestiona? Propuesta: si, es una columna y
   sirve para el caso del tecnico que dirige un proyecto sin ser su jefe.
4. **Horizonte de la matriz.** Cuantas semanas se muestran por defecto? El
   prototipo usa 4.
