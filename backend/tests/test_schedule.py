"""Pruebas del horario versionado y del calendario laboral.

Las fechas de los casos se han medido con isocalendar(): el 9 de noviembre de
2026 es lunes de la semana ISO 2026-W46 y el 16 de noviembre es lunes de la
2026-W47.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from backend.services.capacity import (
    PersonCapacity,
    build_capacity_report,
    compute_task_week_units,
    split_weighted_units,
    working_days,
)
from backend.services.schedule import (
    FULL_DAY,
    HALF_DAY,
    ScheduleVersion,
    capacity_units_for_week,
    schedule_in_force,
    week_start,
    week_start_from_key,
)

JORNADA_COMPLETA = (800, 800, 800, 800, 800, 0, 0)
"""Lunes a viernes de 8 h, en centimas de hora."""


def horario(
    valid_from: date = date(2026, 1, 5),
    days: tuple[int, ...] = JORNADA_COMPLETA,
    factor: int = 100,
) -> ScheduleVersion:
    return ScheduleVersion(
        valid_from=valid_from,
        days=days,
        availability_factor=factor,
    )


def persona(
    schedules: tuple[ScheduleVersion, ...] = (),
    base_hours: str | None = "40.00",
    holidays: dict[date, int] | None = None,
) -> PersonCapacity:
    return PersonCapacity(
        user_id=1,
        name="Ana",
        weekly_base_hours=Decimal(base_hours) if base_hours else None,
        schedules=schedules,
        holidays=holidays or {},
    )


@dataclass
class FakeTask:
    id: int
    assigned_to: int | None
    start_date: date | None
    end_date: date | None
    estimated_hours: Decimal


def test_el_lunes_de_la_semana_iso_es_el_inicio():
    assert week_start(date(2026, 11, 11)) == date(2026, 11, 9)
    assert week_start(date(2026, 11, 9)) == date(2026, 11, 9)


def test_la_clave_de_semana_se_convierte_en_su_lunes():
    assert week_start_from_key("2026-W46") == date(2026, 11, 9)
    assert week_start_from_key("2027-W01") == date(2027, 1, 4)
    assert week_start_from_key("2026-W53") == date(2026, 12, 28)


def test_el_horario_vigente_es_el_ultimo_que_ya_entro_en_vigor():
    versiones = (
        horario(valid_from=date(2025, 9, 1), factor=80),
        horario(valid_from=date(2026, 1, 5), factor=100),
    )

    vigente = schedule_in_force(versiones, date(2026, 11, 9))

    assert vigente is not None
    assert vigente.availability_factor == 100


def test_un_horario_que_aun_no_entra_en_vigor_no_se_aplica():
    versiones = (horario(valid_from=date(2026, 12, 1)),)

    assert schedule_in_force(versiones, date(2026, 11, 9)) is None


def test_la_capacidad_de_la_semana_sale_del_horario_vigente():
    personas = persona(schedules=(horario(),))

    capacidad = capacity_units_for_week(
        personas.schedules, personas.weekly_base_hours, "2026-W46", {}
    )

    assert capacidad == 4000


def test_el_factor_de_disponibilidad_reduce_la_capacidad():
    personas = persona(schedules=(horario(factor=80),))

    capacidad = capacity_units_for_week(
        personas.schedules, personas.weekly_base_hours, "2026-W46", {}
    )

    assert capacidad == 3200


def test_sin_horario_se_usa_las_horas_base():
    personas = persona()

    capacidad = capacity_units_for_week(
        personas.schedules, personas.weekly_base_hours, "2026-W46", {}
    )

    assert capacidad == 4000


def test_una_capacidad_de_cero_horas_es_capacidad_desconocida():
    # El motor no inventa un limite que nadie ha definido.
    personas = persona(schedules=(horario(days=(0,) * 7),))

    capacidad = capacity_units_for_week(
        personas.schedules, personas.weekly_base_hours, "2026-W46", {}
    )

    assert capacidad is None


def test_un_festivo_de_jornada_entera_resta_la_capacidad_del_dia():
    personas = persona(
        schedules=(horario(),),
        holidays={date(2026, 11, 9): 0},
    )

    capacidad = capacity_units_for_week(
        personas.schedules, personas.weekly_base_hours, "2026-W46", personas.holidays
    )

    assert capacidad == 3200


def test_un_festivo_de_medio_dia_resta_la_mitad():
    personas = persona(
        schedules=(horario(),),
        holidays={date(2026, 11, 10): HALF_DAY},
    )

    capacidad = capacity_units_for_week(
        personas.schedules, personas.weekly_base_hours, "2026-W46", personas.holidays
    )

    assert capacidad == 3600


def test_un_festivo_no_afecta_a_las_semanas_siguientes():
    personas = persona(
        schedules=(horario(),),
        holidays={date(2026, 11, 9): 0},
    )

    capacidad = capacity_units_for_week(
        personas.schedules, personas.weekly_base_hours, "2026-W47", personas.holidays
    )

    assert capacidad == 4000


def test_el_reparto_salta_los_dias_no_laborables():
    dias = working_days(
        date(2026, 11, 9),
        date(2026, 11, 13),
        {date(2026, 11, 9): 0},
    )

    assert [day for day, _ in dias] == [
        date(2026, 11, 10),
        date(2026, 11, 11),
        date(2026, 11, 12),
        date(2026, 11, 13),
    ]


def test_un_festivo_de_medio_dia_pesa_la_mitad():
    dias = working_days(
        date(2026, 11, 9),
        date(2026, 11, 13),
        {date(2026, 11, 11): HALF_DAY},
    )

    pesos = {day: weight for day, weight in dias}

    assert pesos[date(2026, 11, 9)] == FULL_DAY
    assert pesos[date(2026, 11, 11)] == HALF_DAY


def test_el_reparto_pondera_el_medio_dia():
    # 40 h entre cuatro dias completos y uno a medio dia: el medio dia recibe
    # aproximadamente la mitad que un dia normal.
    partes = split_weighted_units(4000, [FULL_DAY, FULL_DAY, HALF_DAY, FULL_DAY, FULL_DAY])

    assert abs(partes[2] * 2 - partes[0]) <= 1
    assert sum(partes) == 4000


def test_el_reparto_suma_exactamente_las_horas_estimadas():
    # Con un festivo de medio dia el reparto no cae en horas redondas, pero la
    # suma en centimas coincide con el total.
    detalle = compute_task_week_units(
        date(2026, 11, 9),
        date(2026, 11, 13),
        40,
        {date(2026, 11, 11): HALF_DAY},
    )

    assert sum(detalle.values()) == 4000


def test_una_semana_con_festivo_marca_sobrecarga_antes_de_la_base():
    # La persona declara 40 h base, pero su horario le da 32 h en esa semana.
    task = FakeTask(
        id=1,
        assigned_to=1,
        start_date=date(2026, 11, 9),
        end_date=date(2026, 11, 13),
        estimated_hours=Decimal("36.00"),
    )
    personas = persona(
        schedules=(horario(),),
        holidays={date(2026, 11, 9): 0},
    )

    report = build_capacity_report([personas], [task])

    celda = report.rows[0].cells[0]
    assert celda.capacity == Decimal("32.00")
    assert celda.is_overloaded is True


def test_una_persona_sin_capacidad_no_se_marca_sobrecargada():
    task = FakeTask(
        id=1,
        assigned_to=1,
        start_date=date(2026, 11, 9),
        end_date=date(2026, 11, 13),
        estimated_hours=Decimal("36.00"),
    )
    personas = persona(schedules=(horario(days=(0,) * 7),))

    report = build_capacity_report([personas], [task])

    celda = report.rows[0].cells[0]
    assert celda.capacity is None
    assert celda.is_overloaded is False


def test_el_informe_serializa_la_capacidad_de_cada_celda():
    task = FakeTask(
        id=1,
        assigned_to=1,
        start_date=date(2026, 11, 9),
        end_date=date(2026, 11, 13),
        estimated_hours=Decimal("36.00"),
    )
    personas = persona(schedules=(horario(),))

    data = build_capacity_report([personas], [task]).to_dict()

    assert data["rows"][0]["cells"][0]["capacity"] == 40.0
    assert data["rows"][0]["weekly_base_hours"] == 40.0
