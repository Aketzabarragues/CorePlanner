"""Script de datos semilla para una demostracion local.

Uso:
    python backend/seed.py

Borra la base de datos de desarrollo si existe y la vuelve a crear con un
proyecto de automatizacion industrial y las tareas que fuerzan los casos
limite del motor de capacidad.
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
    Department,
    Project,
    ProjectMember,
    Role,
    Task,
    TaskStatus,
    User,
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

DEPARTMENT_AUTOMATION = "Automatización & SCADA"
DEPARTMENT_OFFICE = "Oficina Técnica / EPLAN"

# Jueves 2026-11-05 a miercoles 2026-11-11: cruza el fin de semana y reparte
# las horas entre 2026-W45 y 2026-W46.
JUEVES = date(2026, 11, 5)
MIERCOLES = date(2026, 11, 11)


async def populate(session) -> int:
    """Inserta el conjunto de datos de demostracion. Devuelve el id del proyecto."""
    roles: dict[str, Role] = {}
    for name, permissions in ROLES.items():
        role = Role(name=name, permissions_json=permissions)
        session.add(role)
        roles[name] = role

    ana = User(
        name="Ana",
        email="ana@example.com",
        hashed_password=hash_password(DEFAULT_PASSWORD),
        weekly_base_hours=40,
    )
    sebastian = User(
        name="Sebastián",
        email="sebastian@example.com",
        hashed_password=hash_password(DEFAULT_PASSWORD),
        weekly_base_hours=40,
    )
    jorge = User(
        name="Jorge",
        email="jorge@example.com",
        hashed_password=hash_password(DEFAULT_PASSWORD),
        weekly_base_hours=40,
    )
    admin = User(
        name="Admin",
        email="admin@example.com",
        hashed_password=hash_password(DEFAULT_PASSWORD),
        weekly_base_hours=40,
        is_global_admin=True,
    )
    session.add_all([ana, sebastian, jorge, admin])
    await session.flush()

    automatizacion = Department(name=DEPARTMENT_AUTOMATION, manager_id=ana.id)
    oficina = Department(name=DEPARTMENT_OFFICE, manager_id=jorge.id)
    session.add_all([automatizacion, oficina])
    await session.flush()

    ana.department_id = automatizacion.id
    sebastian.department_id = automatizacion.id
    jorge.department_id = oficina.id

    project = Project(
        name=PROJECT_NAME, status="active", department_id=automatizacion.id
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
    print("  Departamentos:")
    print(f"    {DEPARTMENT_AUTOMATION} (responsable: Ana)")
    print(f"    {DEPARTMENT_OFFICE} (responsable: Jorge)")
    print("  Usuarios:")
    print("    admin@example.com      (administrador global)")
    print("    ana@example.com        (Project Manager)")
    print("    sebastian@example.com  (Ingeniero)")
    print("    jorge@example.com      (Lector)")
    print(f"  Contrasena para todos: {DEFAULT_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main())
