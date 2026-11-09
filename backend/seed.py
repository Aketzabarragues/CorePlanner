"""Script de datos semilla para una demostracion local.

Uso:
    python backend/seed.py

Borra la base de datos de desarrollo si existe y la vuelve a crear con la
organizacion de la demo: un gerente, tres departamentos (Alimentacion, Energia
y Medio Ambiente), las personas de cada uno, sus proyectos y las tareas que
reparten la carga entre las semanas de noviembre de 2026.

Los horarios van versionados, las competencias se catalogan y los dias no
laborables tienen su alcance: global, de departamento o de persona.
"""

from __future__ import annotations

import asyncio
import sys
from datetime import date
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.auth import hash_password  # noqa: E402
from backend.database import (  # noqa: E402
    SessionLocal,
    create_all,
    create_engine,
    dispose_engine,
)
from backend.models import (  # noqa: E402
    CompanyRole,
    Department,
    EmploymentType,
    NonWorkingDay,
    NonWorkingDayScope,
    PersonSkill,
    Project,
    ProjectMember,
    Role,
    Seniority,
    Skill,
    Task,
    TaskStatus,
    User,
    WorkingSchedule,
)

DEFAULT_PASSWORD = "coreplanner"

ROLES = {
    "Project Manager": [
        "capacity.read",
        "gantt.read",
        "task.write",
        "member.manage",
    ],
    "Ingeniero": ["capacity.read", "gantt.read", "task.write"],
    "Lector": ["capacity.read", "gantt.read"],
}

JORNADA_COMPLETA = (800, 800, 800, 800, 800, 0, 0)
"""Lunes a viernes de 8 h, en centimas de hora."""

JORNADA_REDUCIDA = (750, 750, 750, 750, 750, 0, 0)
"""Lunes a viernes de 7,5 h."""

SIN_HORARIO = ()

DEPARTAMENTOS = (
    {"name": "Alimentación", "manager": "ana@example.com"},
    {"name": "Energía", "manager": "jorge@example.com"},
    {"name": "Medio Ambiente", "manager": "sebastian@example.com"},
)

EQUIPO = (
    {
        "name": "Iván",
        "email": "ivan@example.com",
        "company_role": CompanyRole.GERENTE.value,
        "department": None,
        "job_title": "Gerente",
        "seniority": None,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "global_admin": True,
        "schedules": ((date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"Gestión de proyectos": 3},
    },
    {
        "name": "Ana",
        "email": "ana@example.com",
        "company_role": CompanyRole.JEFE_DEPARTAMENTO.value,
        "department": "Alimentación",
        "job_title": "Responsable de Proyectos",
        "seniority": Seniority.SENIOR.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": ((date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"Gestión de proyectos": 3, "TIA Portal": 2, "SCADA": 2},
    },
    {
        "name": "Aketza",
        "email": "aketza@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": "Alimentación",
        "job_title": "Ingeniero de Automatización",
        "seniority": Seniority.SENIOR.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": (
            (date(2025, 9, 1), JORNADA_REDUCIDA, 100, "Jornada reducida"),
            (date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),
        ),
        "skills": {"TIA Portal": 3, "PLC": 3, "SCADA": 3},
    },
    {
        "name": "Héctor",
        "email": "hector@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": "Alimentación",
        "job_title": "Ingeniero PLC",
        "seniority": Seniority.JUNIOR.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": ((date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"PLC": 2, "Redes industriales": 1},
    },
    {
        "name": "Carlos",
        "email": "carlos@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": "Alimentación",
        "job_title": "Ingeniero de Procesos",
        "seniority": Seniority.MEDIO.value,
        "employment_type": EmploymentType.TECHO.value,
        "weekly_base_hours": 40,
        # Jornada al 80 %: su capacidad son 32 h semanales.
        "schedules": (
            (date(2026, 1, 5), JORNADA_COMPLETA, 80, "Jornada parcial al 80 %"),
        ),
        "skills": {"PLC": 2, "Instrumentación": 3},
    },
    {
        "name": "Jorge",
        "email": "jorge@example.com",
        "company_role": CompanyRole.JEFE_DEPARTAMENTO.value,
        "department": "Energía",
        "job_title": "Ingeniero Eléctrico",
        "seniority": Seniority.SENIOR.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": ((date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"EPLAN": 3, "Cableado": 2, "Normativa": 2},
    },
    {
        "name": "Juan",
        "email": "juan@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": "Energía",
        "job_title": "Ingeniero Eléctrico",
        "seniority": Seniority.MEDIO.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": ((date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"EPLAN": 3, "Cableado": 3},
    },
    {
        "name": "Nerea",
        "email": "nerea@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": "Energía",
        "job_title": "Ingeniero de Instrumentación",
        "seniority": Seniority.MEDIO.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        # Sin horario y sin horas base: su capacidad se desconoce, de modo que
        # no se le marca como sobrecargado. El motor no inventa un limite que
        # nadie ha definido.
        "weekly_base_hours": 0,
        "schedules": SIN_HORARIO,
        "skills": {"Instrumentación": 3, "Medición": 2},
    },
    {
        "name": "Natalia",
        "email": "natalia@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": "Energía",
        "job_title": "Ingeniero de Control",
        "seniority": Seniority.MEDIO.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": ((date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"PLC": 3, "SCADA": 3},
    },
    {
        "name": "Sebastián",
        "email": "sebastian@example.com",
        "company_role": CompanyRole.JEFE_DEPARTAMENTO.value,
        "department": "Medio Ambiente",
        "job_title": "Ingeniero de Automatización",
        "seniority": Seniority.SENIOR.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": ((date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"TIA Portal": 3, "PLC": 3, "SCADA": 2},
    },
    {
        "name": "Emilio",
        "email": "emilio@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": "Medio Ambiente",
        "job_title": "Ingeniero de Automatización",
        "seniority": Seniority.MEDIO.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": ((date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"TIA Portal": 3, "PLC": 2},
    },
    {
        "name": "Alejandro",
        "email": "alejandro@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": "Medio Ambiente",
        "job_title": "Ingeniero PLC",
        "seniority": Seniority.MEDIO.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": ((date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"PLC": 3, "Redes industriales": 2},
    },
)

PROYECTOS = (
    {
        "name": "26009 - FLUID SYSTEM - Pasteurizador",
        "department": "Alimentación",
        "tasks": (
            {
                "title": "Programación PLC del pasteurizador",
                "assignee": "aketza@example.com",
                "status": TaskStatus.IN_PROGRESS.value,
                "start": date(2026, 11, 2),
                "end": date(2026, 11, 13),
                "hours": 40,
            },
            {
                "title": "Pruebas FAT de la línea",
                "assignee": "hector@example.com",
                "status": TaskStatus.BACKLOG.value,
                "start": date(2026, 11, 16),
                "end": date(2026, 11, 20),
                "hours": 24,
            },
        ),
    },
    {
        "name": "26010 - FLUID SYSTEM - Planta quesos",
        "department": "Alimentación",
        "tasks": (
            {
                "title": "Diseño SCADA planta de quesos",
                "assignee": "carlos@example.com",
                "status": TaskStatus.DONE.value,
                "start": date(2026, 11, 2),
                "end": date(2026, 11, 6),
                "hours": 32,
            },
            {
                "title": "Puesta en marcha planta de quesos",
                "assignee": "ana@example.com",
                "status": TaskStatus.BACKLOG.value,
                "start": date(2026, 11, 23),
                "end": date(2026, 11, 27),
                "hours": 16,
            },
        ),
    },
    {
        "name": "26025 - HORGAS - Levaduras",
        "department": "Alimentación",
        "tasks": (
            {
                "title": "Automatización de fermentadores",
                "assignee": "aketza@example.com",
                "status": TaskStatus.IN_PROGRESS.value,
                "start": date(2026, 11, 9),
                "end": date(2026, 11, 20),
                "hours": 48,
            },
            {
                "title": "Documentación técnica de levaduras",
                "assignee": "carlos@example.com",
                "status": TaskStatus.BACKLOG.value,
                "start": date(2026, 11, 23),
                "end": date(2026, 11, 25),
                "hours": 12,
            },
        ),
    },
    {
        "name": "26035 - FLUID SYSTEM - Ultrafiltración",
        "department": "Alimentación",
        "tasks": (
            {
                "title": "Ingeniería básica de ultrafiltración",
                "assignee": "hector@example.com",
                "status": TaskStatus.IN_PROGRESS.value,
                "start": date(2026, 11, 2),
                "end": date(2026, 11, 11),
                "hours": 32,
            },
            {
                "title": "Pruebas SAT de ultrafiltración",
                "assignee": "aketza@example.com",
                "status": TaskStatus.BACKLOG.value,
                "start": date(2026, 11, 30),
                "end": date(2026, 12, 4),
                "hours": 20,
            },
        ),
    },
    {
        "name": "26037 - FLUID SYSTEM - Planta leche",
        "department": "Alimentación",
        "tasks": (
            {
                "title": "Revisión de instrumentación",
                "assignee": "ana@example.com",
                "status": TaskStatus.DONE.value,
                "start": date(2026, 11, 4),
                "end": date(2026, 11, 6),
                "hours": 12,
            },
            {
                "title": "Programación HMI planta leche",
                "assignee": "hector@example.com",
                "status": TaskStatus.BACKLOG.value,
                "start": date(2026, 11, 23),
                "end": date(2026, 12, 4),
                "hours": 40,
            },
        ),
    },
    {
        "name": "26012 - CMEX - Planta noruega",
        "department": "Energía",
        "tasks": (
            {
                "title": "Esquemas eléctricos planta Noruega",
                "assignee": "juan@example.com",
                "status": TaskStatus.IN_PROGRESS.value,
                "start": date(2026, 11, 2),
                "end": date(2026, 11, 13),
                "hours": 40,
            },
            {
                "title": "Revisión normativa IEC",
                "assignee": "jorge@example.com",
                "status": TaskStatus.BACKLOG.value,
                "start": date(2026, 11, 9),
                "end": date(2026, 11, 11),
                "hours": 12,
            },
        ),
    },
    {
        "name": "26014 - CMEX - Planta México",
        "department": "Energía",
        "tasks": (
            {
                "title": "Cableado de cuadros eléctricos",
                "assignee": "nerea@example.com",
                "status": TaskStatus.DONE.value,
                "start": date(2026, 11, 2),
                "end": date(2026, 11, 6),
                "hours": 32,
            },
            {
                "title": "Puesta en marcha planta México",
                "assignee": "natalia@example.com",
                "status": TaskStatus.BACKLOG.value,
                "start": date(2026, 11, 23),
                "end": date(2026, 11, 27),
                "hours": 24,
            },
        ),
    },
    {
        "name": "26075 - TOTT - RTO",
        "department": "Energía",
        "tasks": (
            {
                "title": "Programación de control del RTO",
                "assignee": "natalia@example.com",
                "status": TaskStatus.IN_PROGRESS.value,
                "start": date(2026, 11, 9),
                "end": date(2026, 11, 20),
                "hours": 44,
            },
            {
                "title": "Pruebas FAT del RTO",
                "assignee": "juan@example.com",
                "status": TaskStatus.BACKLOG.value,
                "start": date(2026, 11, 23),
                "end": date(2026, 11, 25),
                "hours": 16,
            },
            {
                "title": "Documentación as-built",
                "assignee": "nerea@example.com",
                "status": TaskStatus.BACKLOG.value,
                "start": date(2026, 11, 30),
                "end": date(2026, 12, 2),
                "hours": 8,
            },
        ),
    },
    {
        "name": "26012 - TEC - Parking automático",
        "department": "Medio Ambiente",
        "tasks": (
            {
                "title": "Programación PLC parking automático",
                "assignee": "emilio@example.com",
                "status": TaskStatus.IN_PROGRESS.value,
                "start": date(2026, 11, 2),
                "end": date(2026, 11, 13),
                "hours": 40,
            },
            {
                "title": "Pruebas de maniobras",
                "assignee": "alejandro@example.com",
                "status": TaskStatus.BACKLOG.value,
                "start": date(2026, 11, 16),
                "end": date(2026, 11, 20),
                "hours": 20,
            },
        ),
    },
    {
        "name": "26014 - TEC - Disoluciones",
        "department": "Medio Ambiente",
        "tasks": (
            {
                "title": "Automatización de dosificación",
                "assignee": "alejandro@example.com",
                "status": TaskStatus.IN_PROGRESS.value,
                "start": date(2026, 11, 2),
                "end": date(2026, 11, 11),
                "hours": 32,
            },
            {
                "title": "Revisión de seguridad",
                "assignee": "sebastian@example.com",
                "status": TaskStatus.BACKLOG.value,
                "start": date(2026, 11, 13),
                "end": date(2026, 11, 13),
                "hours": 8,
            },
        ),
    },
    {
        "name": "26075 - LICON - Almacén automatizado",
        "department": "Medio Ambiente",
        "tasks": (
            {
                "title": "Programación del transelevador",
                "assignee": "emilio@example.com",
                "status": TaskStatus.IN_PROGRESS.value,
                "start": date(2026, 11, 9),
                "end": date(2026, 11, 20),
                "hours": 48,
            },
            {
                "title": "Puesta en marcha",
                "assignee": "alejandro@example.com",
                "status": TaskStatus.BACKLOG.value,
                "start": date(2026, 11, 23),
                "end": date(2026, 12, 4),
                "hours": 40,
            },
        ),
    },
)

DIAS_NO_LABORABLES = (
    (date(2026, 10, 12), "Fiesta Nacional", None, None, False),
    (date(2026, 11, 1), "Todos los Santos", None, None, False),
    (date(2026, 11, 9), "Día de la Comunidad", "Energía", None, False),
    (date(2026, 11, 16), "Formación interna", "Alimentación", None, True),
    (date(2026, 11, 23), "Permiso individual", None, "carlos@example.com", False),
    (date(2026, 12, 7), "Día de la Constitución", None, None, False),
    (date(2026, 12, 24), "Nochebuena", None, None, True),
    (date(2026, 12, 31), "Nochevieja", None, None, True),
)
"""Fecha, motivo, departamento, persona (correo) y medio dia.

El alcance sale de los dos campos de destino: con los dos a None es un festivo
global, con departamento es de ese departamento y con persona es de esa persona.
"""


async def _create_team(session) -> dict[str, User]:
    """Crea el equipo con su departamento, su horario y sus competencias."""
    users: dict[str, User] = {}
    for entry in EQUIPO:
        user = User(
            name=entry["name"],
            email=entry["email"],
            hashed_password=hash_password(DEFAULT_PASSWORD),
            company_role=entry["company_role"],
            job_title=entry["job_title"],
            seniority=entry["seniority"],
            employment_type=entry["employment_type"],
            weekly_base_hours=entry["weekly_base_hours"],
            is_global_admin=entry.get("global_admin", False),
        )
        session.add(user)
        users[entry["email"]] = user
    await session.flush()
    return users


def _members_of(tasks: tuple[dict, ...], manager_email: str) -> dict[str, str]:
    """Rol de proyecto de cada persona: el que dirige y los que tienen trabajo.

    El responsable del departamento dirige el proyecto. Cada persona con tareas
    en el entra como Ingeniero, para no depender solo del permiso implicito que
    da tener una tarea suelta.
    """
    roles = {manager_email: "Project Manager"}
    for task in tasks:
        roles.setdefault(task["assignee"], "Ingeniero")
    return roles


async def populate(session) -> int:
    """Inserta el conjunto de datos de demostracion.

    Devuelve el id del primer proyecto.
    """
    roles: dict[str, Role] = {}
    for name, permissions in ROLES.items():
        role = Role(name=name, permissions_json=permissions)
        session.add(role)
        roles[name] = role

    users = await _create_team(session)

    departments: dict[str, Department] = {}
    for entry in DEPARTAMENTOS:
        department = Department(name=entry["name"], manager_id=users[entry["manager"]].id)
        session.add(department)
        departments[entry["name"]] = department
    await session.flush()

    skills: dict[str, Skill] = {}
    for entry in EQUIPO:
        user = users[entry["email"]]
        user.department_id = (
            departments[entry["department"]].id if entry["department"] else None
        )
        for name, level in entry["skills"].items():
            if name not in skills:
                skill = Skill(name=name)
                session.add(skill)
                await session.flush()
                skills[name] = skill
            session.add(PersonSkill(user_id=user.id, skill_id=skills[name].id, level=level))
        for valid_from, days, factor, note in entry["schedules"]:
            session.add(
                WorkingSchedule(
                    user_id=user.id,
                    valid_from=valid_from,
                    availability_factor=factor,
                    note=note,
                    **dict(
                        zip(
                            (
                                "monday",
                                "tuesday",
                                "wednesday",
                                "thursday",
                                "friday",
                                "saturday",
                                "sunday",
                            ),
                            days,
                            strict=True,
                        )
                    ),
                )
            )

    for day, name, department_name, person_email, half_day in DIAS_NO_LABORABLES:
        if department_name is not None:
            session.add(
                NonWorkingDay(
                    date=day,
                    name=name,
                    scope=NonWorkingDayScope.DEPARTMENT.value,
                    department_id=departments[department_name].id,
                    half_day=half_day,
                )
            )
        elif person_email is not None:
            session.add(
                NonWorkingDay(
                    date=day,
                    name=name,
                    scope=NonWorkingDayScope.PERSON.value,
                    user_id=users[person_email].id,
                    half_day=half_day,
                )
            )
        else:
            session.add(
                NonWorkingDay(
                    date=day,
                    name=name,
                    scope=NonWorkingDayScope.GLOBAL.value,
                    half_day=half_day,
                )
            )

    managers = {entry["name"]: entry["manager"] for entry in DEPARTAMENTOS}
    first_project_id = 0
    for entry in PROYECTOS:
        department = departments[entry["department"]]
        manager_email = managers[entry["department"]]
        project = Project(
            name=entry["name"],
            status="active",
            department_id=department.id,
            owner_id=users[manager_email].id,
        )
        session.add(project)
        await session.flush()

        if not first_project_id:
            first_project_id = project.id

        for email, role_name in _members_of(entry["tasks"], manager_email).items():
            session.add(
                ProjectMember(
                    user_id=users[email].id,
                    project_id=project.id,
                    role_id=roles[role_name].id,
                )
            )

        for task in entry["tasks"]:
            session.add(
                Task(
                    project_id=project.id,
                    assigned_to=users[task["assignee"]].id,
                    title=task["title"],
                    status=task["status"],
                    start_date=task["start"],
                    end_date=task["end"],
                    estimated_hours=task["hours"],
                )
            )

    await session.commit()
    return first_project_id


async def reset_database() -> None:
    """Borra las tablas existentes y vuelve a crear el esquema.

    Las claves foraneas entre departamentos y usuarios forman un ciclo que
    SQLite no sabe ordenar al borrar las tablas, de modo que el borrado se
    hace sin integridad referencial.
    """
    from backend.models import Base

    plain_engine = create_engine(foreign_keys=False)
    try:
        async with plain_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
    finally:
        await plain_engine.dispose()

    await create_all()


async def seed() -> int:
    """Recrea la base de datos de desarrollo con los datos de demostracion."""
    await reset_database()
    async with SessionLocal() as session:
        return await populate(session)


async def main() -> None:
    try:
        project_id = await seed()
    finally:
        await dispose_engine()

    print("Base de datos preparada.")
    print("  Departamentos:")
    for entry in DEPARTAMENTOS:
        proyectos = [p for p in PROYECTOS if p["department"] == entry["name"]]
        print(f"    {entry['name']} (responsable: {entry['manager']}) - {len(proyectos)} proyectos")
    print("  Proyectos:")
    for entry in PROYECTOS:
        print(f"    {entry['name']} ({entry['department']})")
    print(f"    primer proyecto: id={project_id}")
    print("  Usuarios:")
    for entry in EQUIPO:
        print(f"    {entry['email']:<26} ({entry['company_role']})")
    print(f"  Contrasena para todos: {DEFAULT_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
