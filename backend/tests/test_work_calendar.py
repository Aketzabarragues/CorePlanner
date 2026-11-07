"""Pruebas del alcance por persona de los dias no laborables.

Un dia no laborable puede aplicar a todo el mundo, a un departamento o a una
sola persona. El motor tiene que aplicar cada alcance a quien corresponde y
solo a ese, y las bases ya creadas tienen que admitir el alcance nuevo.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.database import create_engine
from backend.migrations import apply_migrations
from backend.models import Base, NonWorkingDay, NonWorkingDayScope, User
from backend.services.capacity_repository import load_person_capacities

DDL_ANTERIOR = """
CREATE TABLE non_working_days (
    id INTEGER NOT NULL PRIMARY KEY,
    date DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    scope VARCHAR(32) NOT NULL DEFAULT 'global',
    department_id INTEGER,
    half_day BOOLEAN NOT NULL DEFAULT 0,
    CONSTRAINT scope CHECK (scope IN ('global', 'department')),
    CONSTRAINT scope_department CHECK (
        (scope = 'global' AND department_id IS NULL) OR
        (scope = 'department' AND department_id IS NOT NULL)
    )
)
"""


@pytest.fixture
async def session():
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        yield db
    await engine.dispose()


async def test_el_festivo_de_persona_solo_le_quita_capacidad_a_esa_persona(session):
    ana = User(name="Ana", email="ana@example.com", hashed_password="x")
    luis = User(name="Luis", email="luis@example.com", hashed_password="x")
    session.add_all([ana, luis])
    await session.flush()
    session.add(
        NonWorkingDay(
            date=date(2026, 11, 2),
            name="Permiso individual",
            scope=NonWorkingDayScope.PERSON.value,
            user_id=ana.id,
        )
    )
    await session.commit()

    people = await load_person_capacities(session, [ana, luis])

    por_id = {person.user_id: person for person in people}
    assert date(2026, 11, 2) in por_id[ana.id].holidays
    assert date(2026, 11, 2) not in por_id[luis.id].holidays


async def test_un_festivo_global_y_otro_de_persona_se_quedan_con_el_mas_restrictivo(
    session,
):
    ana = User(name="Ana", email="ana@example.com", hashed_password="x")
    session.add(ana)
    await session.flush()
    session.add(
        NonWorkingDay(
            date=date(2026, 11, 2),
            name="Todos los Santos",
            scope=NonWorkingDayScope.GLOBAL.value,
        )
    )
    session.add(
        NonWorkingDay(
            date=date(2026, 11, 2),
            name="Permiso de media jornada",
            scope=NonWorkingDayScope.PERSON.value,
            user_id=ana.id,
            half_day=True,
        )
    )
    await session.commit()

    people = await load_person_capacities(session, [ana])

    # El festivo de jornada entera sigue pesando más que el permiso.
    assert people[0].holidays[date(2026, 11, 2)] == 0


async def test_la_migracion_amplia_la_tabla_al_alcance_por_persona():
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        ana = User(name="Ana", email="ana@example.com", hashed_password="x")
        db.add(ana)
        await db.commit()
        ana_id = ana.id

    def _dejar_la_tabla_anterior(sync_conn):
        sync_conn.execute(text("DROP TABLE non_working_days"))
        sync_conn.execute(text(DDL_ANTERIOR))
        sync_conn.execute(
            text(
                "INSERT INTO non_working_days "
                "(id, date, name, scope, department_id, half_day) "
                "VALUES (1, '2026-11-02', 'Todos los Santos', 'global', NULL, 0)"
            )
        )

    async with engine.begin() as conn:
        await conn.run_sync(_dejar_la_tabla_anterior)

    await apply_migrations(engine)

    def _leer(sync_conn):
        estado["columnas"] = {
            row[1]
            for row in sync_conn.execute(text("PRAGMA table_info(non_working_days)"))
        }
        estado["filas"] = sync_conn.execute(
            text("SELECT id, name, scope, user_id FROM non_working_days")
        ).all()
        estado["ddl"] = sync_conn.execute(
            text("SELECT sql FROM sqlite_master WHERE name = 'non_working_days'")
        ).scalar_one()
        sync_conn.execute(
            text(
                "INSERT INTO non_working_days "
                "(id, date, name, scope, user_id, half_day) "
                "VALUES (2, '2026-11-23', 'Permiso individual', 'person', :user_id, 0)"
            ),
            {"user_id": ana_id},
        )
        estado["insertados"] = sync_conn.execute(
            text("SELECT COUNT(*) FROM non_working_days")
        ).scalar_one()

    estado: dict = {}
    async with engine.begin() as conn:
        await conn.run_sync(_leer)

    assert "user_id" in estado["columnas"]
    # Los dias que ya estaban siguen intactos.
    assert estado["filas"] == [(1, "Todos los Santos", "global", None)]
    assert "'person'" in estado["ddl"]
    # Y el alcance nuevo ya se puede guardar.
    assert estado["insertados"] == 2
    await engine.dispose()
