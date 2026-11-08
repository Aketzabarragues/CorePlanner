"""Pruebas de la lectura de capacidad desde la base de datos.

Comprueban que el motor puro recibe los mismos datos que devolveria la
base de datos y que el informe refleja el estado real del proyecto.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.database import create_engine
from backend.models import (
    Base,
    Department,
    NonWorkingDay,
    NonWorkingDayScope,
    PersonSkill,
    Project,
    ProjectMember,
    Role,
    Skill,
    Task,
    TaskStatus,
    User,
)
from backend.services.capacity_repository import load_project_capacity, load_task_week_hours


@pytest.fixture
async def session():
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as db:
        yield db
    await engine.dispose()


async def _seed(session):
    ana = User(name="Ana", email="ana@example.com", hashed_password="x")
    luis = User(name="Luis", email="luis@example.com", hashed_password="x")
    project = Project(name="Linea 1")
    role = Role(name="Ingeniero", permissions_json=["task.read"])
    session.add_all([ana, luis, project, role])
    await session.flush()

    session.add(ProjectMember(user_id=ana.id, project_id=project.id, role_id=role.id))
    session.add(ProjectMember(user_id=luis.id, project_id=project.id, role_id=role.id))
    session.add(
        Task(
            project_id=project.id,
            assigned_to=ana.id,
            title="Montaje",
            status=TaskStatus.BACKLOG.value,
            start_date=date(2026, 3, 5),
            end_date=date(2026, 3, 11),
            estimated_hours=40,
        )
    )
    session.add(
        Task(
            project_id=project.id,
            assigned_to=ana.id,
            title="Revision",
            status=TaskStatus.BACKLOG.value,
            start_date=date(2026, 3, 2),
            end_date=date(2026, 3, 6),
            estimated_hours=50,
        )
    )
    await session.commit()
    return ana, luis, project


async def test_el_informe_desde_la_base_de_datos_reparte_igual_que_el_motor(session):
    from backend.services.capacity import compute_task_week_load

    ana, _luis, project = await _seed(session)

    report = await load_project_capacity(session, project.id)

    row = next(r for r in report.rows if r.user_id == ana.id)
    assert row.name == "Ana"
    # Revision (50 h en W10) + Montaje (40 h: 16 en W10, 24 en W11).
    cells = {cell.week: cell for cell in row.cells}
    assert cells["2026-W10"].hours == Decimal("50.00") + Decimal("16.00")
    assert cells["2026-W11"].hours == Decimal("24.00")
    assert cells["2026-W10"].is_overloaded is True
    assert cells["2026-W11"].is_overloaded is False

    directo = compute_task_week_load(date(2026, 3, 5), date(2026, 3, 11), 40)
    assert directo == {"2026-W10": 16.0, "2026-W11": 24.0}


async def test_los_miembros_sin_tareas_aparecen_con_filas_a_cero(session):
    _ana, luis, project = await _seed(session)

    report = await load_project_capacity(session, project.id)

    row = next(r for r in report.rows if r.user_id == luis.id)
    assert row.total_hours == 0.0
    assert row.has_overload is False


async def test_el_informe_no_incluye_tareas_de_otros_proyectos(session):
    _ana, _luis, project = await _seed(session)
    otro = Project(name="Linea 2")
    session.add(otro)
    await session.flush()
    session.add(
        Task(
            project_id=otro.id,
            assigned_to=None,
            title="De otro proyecto",
            status=TaskStatus.BACKLOG.value,
            start_date=date(2026, 3, 2),
            end_date=date(2026, 3, 6),
            estimated_hours=100,
        )
    )
    await session.commit()

    report = await load_project_capacity(session, project.id)

    assert report.unassigned_task_ids == ()
    assert report.rows[0].total_hours < 100.0


async def test_cada_fila_trae_el_perfil_de_la_persona(session):
    """La fila lleva departamento, puesto y proyectos: el frontend no los pide aparte."""
    department = Department(name="Automatizacion")
    session.add(department)
    await session.flush()

    ana, _luis, project = await _seed(session)
    ana.department_id = department.id
    ana.job_title = "Ingeniero PLC"
    otro = Project(name="Linea 2")
    session.add(otro)
    await session.flush()
    role_id = await session.scalar(select(Role.id).where(Role.name == "Ingeniero"))
    session.add(ProjectMember(user_id=ana.id, project_id=otro.id, role_id=role_id))
    await session.commit()

    report = await load_project_capacity(session, project.id)

    row = next(r for r in report.rows if r.user_id == ana.id)
    assert row.department_id == department.id
    assert row.job_title == "Ingeniero PLC"
    # Solo los proyectos del informe: los demas no se cuelan.
    assert row.project_ids == (project.id,)


async def test_el_perfil_va_tambien_en_el_diccionario_del_informe(session):
    ana, _luis, project = await _seed(session)

    report = await load_project_capacity(session, project.id)

    fila = next(f for f in report.to_dict()["rows"] if f["user_id"] == ana.id)
    assert fila["job_title"] is None
    assert fila["department_id"] is None
    assert fila["project_ids"] == [project.id]


async def test_el_informe_serializa_a_diccionario_desde_la_base_de_datos(session):
    ana, _luis, project = await _seed(session)

    data = (await load_project_capacity(session, project.id)).to_dict()

    assert [week["week"] for week in data["weeks"]] == ["2026-W10", "2026-W11"]
    assert any(row["user_id"] == ana.id for row in data["rows"])
    assert "is_overloaded" in data["rows"][0]["cells"][0]
    assert data["holiday_task_ids"] == []


async def test_una_tarea_enteramente_festiva_no_rompe_el_informe(session):
    """Una tarea que cae entera en un dia no laborable vale cero horas.

    Antes el motor lanzaba la excepcion y el informe entero devolvia un error
    500 por culpa de una sola tarea.
    """
    from backend.models import NonWorkingDay, NonWorkingDayScope

    ana, _luis, project = await _seed(session)
    session.add_all(
        [
            NonWorkingDay(
                date=date(2026, 3, 16),
                name="Permiso individual",
                scope=NonWorkingDayScope.PERSON.value,
                user_id=ana.id,
            ),
            NonWorkingDay(
                date=date(2026, 3, 17),
                name="Permiso individual",
                scope=NonWorkingDayScope.PERSON.value,
                user_id=ana.id,
            ),
        ]
    )
    tarea = Task(
        project_id=project.id,
        assigned_to=ana.id,
        title="Tarea en dia festivo",
        status=TaskStatus.BACKLOG.value,
        start_date=date(2026, 3, 16),
        end_date=date(2026, 3, 17),
        estimated_hours=8,
    )
    session.add(tarea)
    await session.commit()

    report = await load_project_capacity(session, project.id)

    assert report.holiday_task_ids == (tarea.id,)
    row = next(r for r in report.rows if r.user_id == ana.id)
    cells = {cell.week: cell for cell in row.cells}
    # El resto de la planificacion de Ana sigue igual.
    assert cells["2026-W10"].hours == Decimal("66.00")
    assert cells["2026-W11"].hours == Decimal("24.00")


async def test_el_filtro_por_competencia_solo_deja_a_quien_la_tiene(session):
    """El filtro por competencia saca del informe a quien no la tiene."""
    ana, luis, project = await _seed(session)
    skill = Skill(name="PLC")
    session.add(skill)
    await session.flush()
    session.add(PersonSkill(user_id=ana.id, skill_id=skill.id, level=2))
    await session.flush()

    report = await load_project_capacity(session, project.id, skill_id=skill.id, min_level=2)

    assert [row.user_id for row in report.rows] == [ana.id]
    assert luis.id not in [row.user_id for row in report.rows]


async def test_el_filtro_por_competencia_respeta_el_nivel_minimo(session):
    ana, _luis, project = await _seed(session)
    skill = Skill(name="PLC")
    session.add(skill)
    await session.flush()
    session.add(PersonSkill(user_id=ana.id, skill_id=skill.id, level=1))
    await session.flush()

    report = await load_project_capacity(session, project.id, skill_id=skill.id, min_level=2)

    assert report.rows == ()


async def test_el_informe_lleva_los_festivos_globales_de_cada_semana(session):
    """La cabecera de la semana necesita el nombre del festivo."""
    _ana, _luis, project = await _seed(session)
    session.add(
        NonWorkingDay(
            date=date(2026, 3, 6),
            name="Fiesta local",
            scope=NonWorkingDayScope.GLOBAL.value,
        )
    )
    await session.flush()

    data = (await load_project_capacity(session, project.id)).to_dict()

    semana = next(w for w in data["weeks"] if w["week"] == "2026-W10")
    assert semana["holidays"] == [
        {
            "date": "2026-03-06",
            "name": "Fiesta local",
            "scope": "global",
            "half_day": False,
        }
    ]


async def test_un_festivo_de_persona_no_aparece_en_la_cabecera(session):
    """La cabecera es de la matriz: un festivo de una persona no va en ella."""
    ana, _luis, project = await _seed(session)
    session.add(
        NonWorkingDay(
            date=date(2026, 3, 6),
            name="Permiso individual",
            scope=NonWorkingDayScope.PERSON.value,
            user_id=ana.id,
        )
    )
    await session.flush()

    data = (await load_project_capacity(session, project.id)).to_dict()

    semana = next(w for w in data["weeks"] if w["week"] == "2026-W10")
    assert semana["holidays"] == []


async def test_el_rango_llega_al_informe_desde_la_base_de_datos(session):
    _ana, _luis, project = await _seed(session)

    data = (
        await load_project_capacity(
            session, project.id, weeks=("2026-W10", "2026-W11", "2026-W12")
        )
    ).to_dict()

    assert [week["week"] for week in data["weeks"]] == [
        "2026-W10",
        "2026-W11",
        "2026-W12",
    ]


async def test_la_celda_desglosa_las_horas_por_proyecto(session):
    ana, _luis, project = await _seed(session)

    report = await load_project_capacity(session, project.id)

    row = next(r for r in report.rows if r.user_id == ana.id)
    celda = next(c for c in row.cells if c.week == "2026-W10")
    # Las dos tareas son del mismo proyecto: 50 h + 16 h.
    assert [(p.project_id, p.hours) for p in celda.projects] == [
        (project.id, Decimal("66.00"))
    ]


async def test_las_horas_de_una_tarea_son_las_de_su_semana(session):
    """Una tarea que cruza semanas aporta horas distintas en cada una."""
    _ana, _luis, project = await _seed(session)
    tareas = (
        (await session.execute(select(Task).where(Task.project_id == project.id)))
        .scalars()
        .all()
    )
    montaje = next(t for t in tareas if t.title == "Montaje")

    horas = await load_task_week_hours(session, tareas, "2026-W10")

    # 40 h repartidas en cinco dias laborables: 16 h en W10 y 24 h en W11.
    assert horas[montaje.id] == Decimal("16.00")
