"""Script de datos semilla para una demostracion local.

Uso:
    python backend/seed.py

Borra la base de datos de desarrollo si existe y la vuelve a crear con un
proyecto de automatizacion industrial y las tareas que fuerzan los casos
limite del motor de capacidad.

El equipo, sus horarios versionados, sus competencias y los dias no laborables
son los de la demo visual, para que las dos sirvan de contraste.
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

PROJECT_NAME = "Linea Pasteurizadora SIVE"
PROJECT_NAME_OFFICE = "Red de tuberias linea 2"

DEPARTMENT_AUTOMATION = "Automatización & SCADA"
DEPARTMENT_OFFICE = "Oficina Técnica / EPLAN"
DEPARTMENT_MAINTENANCE = "Mantenimiento"
DEPARTMENT_QUALITY = "Control de Calidad"

JORNADA_COMPLETA = (800, 800, 800, 800, 800, 0, 0)
"""Lunes a viernes de 8 h, en centimas de hora."""

JORNADA_REDUCIDA = (750, 750, 750, 750, 750, 0, 0)
"""Lunes a viernes de 7,5 h."""

JORNADA_CORTA = (600, 600, 600, 0, 0, 0, 0)
"""Lunes a miercoles de 6 h."""

SIN_HORARIO = ()

EQUIPO = (
    {
        "name": "Admin",
        "email": "admin@example.com",
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
        "department": DEPARTMENT_AUTOMATION,
        "job_title": "Project Manager",
        "seniority": Seniority.SENIOR.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": ((date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"TIA Portal": 3, "SCADA": 3, "Gestión de proyectos": 3, "PLC": 2},
    },
    {
        "name": "Sebastián",
        "email": "sebastian@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": DEPARTMENT_AUTOMATION,
        "job_title": "Ingeniero PLC",
        "seniority": Seniority.SENIOR.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": (
            (date(2025, 9, 1), JORNADA_REDUCIDA, 100, "Jornada reducida"),
            (date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),
        ),
        "skills": {"TIA Portal": 3, "PLC": 3, "Redes industriales": 2, "SCADA": 2},
    },
    {
        "name": "Marta",
        "email": "marta@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": DEPARTMENT_AUTOMATION,
        "job_title": "Ingeniero SCADA",
        "seniority": Seniority.MEDIO.value,
        "employment_type": EmploymentType.TECHO.value,
        "weekly_base_hours": 40,
        "schedules": (
            (date(2025, 1, 6), JORNADA_COMPLETA, 100, "Tiempo completo"),
            (date(2026, 1, 5), JORNADA_COMPLETA, 80, "Jornada parcial al 80 %"),
        ),
        "skills": {"SCADA": 3, "HMI": 3, "TIA Portal": 2},
    },
    {
        "name": "Diego",
        "email": "diego@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": DEPARTMENT_AUTOMATION,
        "job_title": "Ingeniero PLC",
        "seniority": Seniority.MEDIO.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": ((date(2026, 3, 2), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"PLC": 3, "SCADA": 2, "TIA Portal": 2},
    },
    {
        "name": "Héctor",
        "email": "hector@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": DEPARTMENT_AUTOMATION,
        "job_title": "Ingeniero PLC",
        "seniority": Seniority.JUNIOR.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        # Sin horario y sin horas base: su capacidad se desconoce, de modo que
        # no se le marca como sobrecargado. El motor no inventa un limite que
        # nadie ha definido.
        "weekly_base_hours": 0,
        "schedules": (),
        "skills": {"PLC": 2, "Redes industriales": 1},
    },
    {
        "name": "Jorge",
        "email": "jorge@example.com",
        "company_role": CompanyRole.JEFE_DEPARTAMENTO.value,
        "department": DEPARTMENT_OFFICE,
        "job_title": "Diseñador Eléctrico",
        "seniority": Seniority.SENIOR.value,
        "employment_type": EmploymentType.OBJETIVO.value,
        "weekly_base_hours": 40,
        "schedules": ((date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"EPLAN": 3, "Mecánica": 2, "Cableado": 2},
    },
    {
        "name": "Lucía",
        "email": "lucia@example.com",
        "company_role": CompanyRole.TECNICO.value,
        "department": DEPARTMENT_OFFICE,
        "job_title": "Ingeniero Eléctrico",
        "seniority": Seniority.JUNIOR.value,
        "employment_type": EmploymentType.TECHO.value,
        "weekly_base_hours": 18,
        "schedules": (
            (date(2025, 1, 6), JORNADA_COMPLETA, 100, "Tiempo completo"),
            (date(2026, 4, 1), JORNADA_CORTA, 100, "Reducción de jornada a 3 días"),
        ),
        "skills": {"EPLAN": 2, "Cableado": 3},
    },
    {
        "name": "Iván",
        "email": "ivan@example.com",
        "company_role": CompanyRole.JEFE_DEPARTAMENTO.value,
        "department": DEPARTMENT_MAINTENANCE,
        "job_title": "Técnico Mecánico",
        "seniority": Seniority.MEDIO.value,
        "employment_type": EmploymentType.TECHO.value,
        "weekly_base_hours": 40,
        "schedules": (
            (date(2024, 1, 8), JORNADA_COMPLETA, 80, "Jornada parcial al 80 %"),
            (
                date(2026, 7, 1),
                JORNADA_COMPLETA,
                100,
                "Jornada completa tras reincorporación",
            ),
        ),
        "skills": {"Mecánica": 3, "Soldadura": 3, "Mantenimiento": 2},
    },
    {
        "name": "Nuria",
        "email": "nuria@example.com",
        "company_role": CompanyRole.JEFE_DEPARTAMENTO.value,
        "department": DEPARTMENT_QUALITY,
        "job_title": "Técnico QC",
        "seniority": Seniority.MEDIO.value,
        "employment_type": EmploymentType.MEJOR_ESFUERZO.value,
        "weekly_base_hours": 40,
        "schedules": ((date(2026, 1, 5), JORNADA_COMPLETA, 100, "Jornada completa"),),
        "skills": {"Análisis": 3, "Metrología": 2, "Soldadura": 1},
    },
)

DIAS_NO_LABORABLES = (
    (date(2026, 10, 12), "Fiesta Nacional", None, None, False),
    (date(2026, 11, 2), "Todos los Santos", None, None, False),
    (date(2026, 11, 9), "Día de la Comunidad", DEPARTMENT_OFFICE, None, False),
    (date(2026, 11, 16), "Formación interna", DEPARTMENT_AUTOMATION, None, True),
    (date(2026, 11, 23), "Permiso individual", None, "marta@example.com", False),
    (date(2026, 12, 7), "Día de la Constitución", None, None, False),
    (date(2026, 12, 24), "Nochebuena", None, None, True),
    (date(2026, 12, 31), "Nochevieja", None, None, True),
)
"""Fecha, motivo, departamento, persona (correo) y medio dia.

El alcance sale de los dos campos de destino: con los dos a None es un festivo
global, con departamento es de ese departamento y con persona es de esa persona.
"""

# Jueves 2026-11-05 a miercoles 2026-11-11: cruza el fin de semana y reparte
# las horas entre 2026-W45 y 2026-W46.
JUEVES = date(2026, 11, 5)
MIERCOLES = date(2026, 11, 11)


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


async def populate(session) -> int:
    """Inserta el conjunto de datos de demostracion. Devuelve el id del proyecto."""
    roles: dict[str, Role] = {}
    for name, permissions in ROLES.items():
        role = Role(name=name, permissions_json=permissions)
        session.add(role)
        roles[name] = role

    users = await _create_team(session)

    departments: dict[str, Department] = {}
    for name, manager_email in (
        (DEPARTMENT_AUTOMATION, "ana@example.com"),
        (DEPARTMENT_OFFICE, "jorge@example.com"),
        (DEPARTMENT_MAINTENANCE, "ivan@example.com"),
        (DEPARTMENT_QUALITY, "nuria@example.com"),
    ):
        department = Department(name=name, manager_id=users[manager_email].id)
        session.add(department)
        departments[name] = department
    await session.flush()

    skills: dict[str, Skill] = {}
    for entry in EQUIPO:
        user = users[entry["email"]]
        user.department_id = departments[entry["department"]].id if entry["department"] else None
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

    ana = users["ana@example.com"]
    sebastian = users["sebastian@example.com"]
    jorge = users["jorge@example.com"]

    automatizacion = departments[DEPARTMENT_AUTOMATION]
    oficina = departments[DEPARTMENT_OFFICE]

    project = Project(
        name=PROJECT_NAME,
        status="active",
        department_id=automatizacion.id,
        owner_id=ana.id,
    )
    session.add(project)
    await session.flush()

    session.add_all(
        [
            ProjectMember(
                user_id=ana.id,
                project_id=project.id,
                role_id=roles["Project Manager"].id,
            ),
            ProjectMember(
                user_id=sebastian.id,
                project_id=project.id,
                role_id=roles["Ingeniero"].id,
            ),
            ProjectMember(
                user_id=jorge.id,
                project_id=project.id,
                role_id=roles["Lector"].id,
            ),
        ]
    )

    session.add_all(
        [
            Task(
                project_id=project.id,
                assigned_to=sebastian.id,
                title="Programacion SCADA WinCC",
                status=TaskStatus.IN_PROGRESS.value,
                start_date=JUEVES,
                end_date=MIERCOLES,
                estimated_hours=40,
            ),
            Task(
                project_id=project.id,
                assigned_to=sebastian.id,
                title="Desarrollo de Bloques SCL",
                status=TaskStatus.TESTING.value,
                start_date=JUEVES,
                end_date=MIERCOLES,
                estimated_hours=20,
            ),
            Task(
                project_id=project.id,
                assigned_to=ana.id,
                title="Esquemas EPLAN",
                status=TaskStatus.BACKLOG.value,
                start_date=date(2026, 11, 2),
                end_date=date(2026, 11, 4),
                estimated_hours=10,
            ),
            # Concentra 12 h mas en la segunda semana: 48 h frente a las 40 h
            # base de Sebastián, que es lo que activa la sobrecarga.
            Task(
                project_id=project.id,
                assigned_to=sebastian.id,
                title="Puesta en marcha de valvulas",
                status=TaskStatus.DONE.value,
                start_date=date(2026, 11, 9),
                end_date=date(2026, 11, 11),
                estimated_hours=12,
            ),
            Task(
                project_id=project.id,
                assigned_to=jorge.id,
                title="Revision de documentacion tecnica",
                status=TaskStatus.BACKLOG.value,
                start_date=date(2026, 11, 9),
                end_date=date(2026, 11, 12),
                estimated_hours=16,
            ),
        ]
    )

    # Segundo proyecto, para que el selector de la cabecera tenga entre donde
    # elegir. Lo gestiona la oficina tecnica y en el hay gente de
    # automatizacion, que es el reparto transversal entre departamentos.
    # Sebastián no es miembro de este proyecto, pero tiene una tarea en el.
    # Eso es el caso del tecnico que participa en un proyecto sin estar dado de
    # alta: lo ve, pero no lo puede editar.
    project_office = Project(
        name=PROJECT_NAME_OFFICE,
        status="active",
        department_id=oficina.id,
        owner_id=jorge.id,
    )
    session.add(project_office)
    await session.flush()

    session.add_all(
        [
            ProjectMember(
                user_id=jorge.id,
                project_id=project_office.id,
                role_id=roles["Project Manager"].id,
            ),
            ProjectMember(
                user_id=ana.id,
                project_id=project_office.id,
                role_id=roles["Ingeniero"].id,
            ),
        ]
    )

    session.add_all(
        [
            Task(
                project_id=project_office.id,
                assigned_to=jorge.id,
                title="Planos de tuberias",
                status=TaskStatus.BACKLOG.value,
                start_date=date(2026, 11, 2),
                end_date=date(2026, 11, 4),
                estimated_hours=12,
            ),
            Task(
                project_id=project_office.id,
                assigned_to=ana.id,
                title="Definicion de tags PLC",
                status=TaskStatus.IN_PROGRESS.value,
                start_date=JUEVES,
                end_date=MIERCOLES,
                estimated_hours=16,
            ),
            Task(
                project_id=project_office.id,
                assigned_to=sebastian.id,
                title="Cableado de campo",
                status=TaskStatus.TESTING.value,
                start_date=JUEVES,
                end_date=MIERCOLES,
                estimated_hours=24,
            ),
            Task(
                project_id=project_office.id,
                assigned_to=jorge.id,
                title="Revision de parcelario",
                status=TaskStatus.DONE.value,
                start_date=date(2026, 11, 9),
                end_date=date(2026, 11, 11),
                estimated_hours=8,
            ),
        ]
    )

    await session.commit()
    return project.id


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
    print(f"  Proyecto: {PROJECT_NAME} (id={project_id})")
    print(f"    departamento: {DEPARTMENT_AUTOMATION}")
    print(f"  Proyecto: {PROJECT_NAME_OFFICE}")
    print(f"    departamento: {DEPARTMENT_OFFICE}")
    print("  Departamentos:")
    print(f"    {DEPARTMENT_AUTOMATION} (responsable: Ana)")
    print(f"    {DEPARTMENT_OFFICE} (responsable: Jorge)")
    print(f"    {DEPARTMENT_MAINTENANCE} (responsable: Iván)")
    print(f"    {DEPARTMENT_QUALITY} (responsable: Nuria)")
    print("  Usuarios:")
    for entry in EQUIPO:
        print(f"    {entry['email']:<26} ({entry['company_role']})")
    print(f"  Contrasena para todos: {DEFAULT_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
