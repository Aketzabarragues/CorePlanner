"""Pruebas del motor de capacidad.

Las fechas de los casos se han medido con isocalendar(): el 5 de marzo de
2026 es jueves de la semana ISO 2026-W10 y el 11 de marzo es miercoles de
2026-W11.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

import pytest

from backend.services.capacity import (
    InvalidEstimatedHoursError,
    InvalidTaskRangeError,
    NoBusinessDaysError,
    build_capacity_report,
    business_days,
    compute_task_week_load,
    from_units,
    iso_week_key,
    split_units,
    to_units,
)


@dataclass
class FakeUser:
    id: int
    name: str
    weekly_base_hours: Decimal = Decimal("40.00")


@dataclass
class FakeTask:
    id: int
    assigned_to: int | None
    start_date: date | None
    end_date: date | None
    estimated_hours: Decimal = Decimal("0.00")


def H(value: str) -> Decimal:
    """Horas como Decimal, para comparar sin coercion implicita."""
    return Decimal(value)


def test_jueves_a_miercoles_reparte_en_dos_semanas_saltando_el_fin_de_semana():
    # 40 h, jueves 2026-03-05 -> miercoles 2026-03-11.
    # Laborables: 5 (jue, vie, lun, mar, mier) -> 8 h por dia.
    result = compute_task_week_load(date(2026, 3, 5), date(2026, 3, 11), 40)

    assert result == {"2026-W10": H("16.00"), "2026-W11": H("24.00")}
    assert sum(result.values()) == H("40.00")


def test_los_fines_de_semana_no_cuentan_como_dias_laborables():
    # Sabado 2026-03-07 -> domingo 2026-03-08: ningun dia laborable.
    with pytest.raises(NoBusinessDaysError):
        compute_task_week_load(date(2026, 3, 7), date(2026, 3, 8), 40)


def test_rango_invertido_es_error():
    with pytest.raises(InvalidTaskRangeError):
        compute_task_week_load(date(2026, 3, 11), date(2026, 3, 5), 40)


def test_horas_negativas_son_error():
    with pytest.raises(InvalidEstimatedHoursError):
        compute_task_week_load(date(2026, 3, 5), date(2026, 3, 6), -1)


def test_tarea_de_un_solo_dia_laborable():
    result = compute_task_week_load(date(2026, 3, 9), date(2026, 3, 9), 8)
    assert result == {"2026-W11": H("8.00")}


def test_tarea_que_empieza_en_sabado_empieza_a_contar_el_lunes():
    # Sabado 2026-03-07 -> lunes 2026-03-09: un solo dia laborable.
    result = compute_task_week_load(date(2026, 3, 7), date(2026, 3, 9), 10)
    assert result == {"2026-W11": H("10.00")}


def test_una_tarea_que_cruza_varias_semanas_se_divide():
    # 2026-03-05 (jue, W10) -> 2026-03-13 (vie, W11): 7 laborables, 5 h/dia.
    # W10 recoge jueves y viernes (2 dias), W11 los 5 laborables restantes.
    result = compute_task_week_load(date(2026, 3, 5), date(2026, 3, 13), 35)
    assert result == {"2026-W10": H("10.00"), "2026-W11": H("25.00")}
    assert sum(result.values()) == H("35.00")


def test_el_ano_de_la_semana_es_el_iso_no_el_de_calendario():
    # 2026-12-31 es jueves de 2026-W53 y 2027-01-01 sigue en 2026-W53.
    assert iso_week_key(date(2026, 12, 31)) == "2026-W53"
    assert iso_week_key(date(2027, 1, 1)) == "2026-W53"
    assert iso_week_key(date(2027, 1, 4)) == "2027-W01"

    result = compute_task_week_load(date(2026, 12, 31), date(2027, 1, 1), 10)
    assert result == {"2026-W53": H("10.00")}


def test_business_days_excluye_sabado_y_domingo():
    days = business_days(date(2026, 3, 5), date(2026, 3, 11))
    assert days == [
        date(2026, 3, 5),
        date(2026, 3, 6),
        date(2026, 3, 9),
        date(2026, 3, 10),
        date(2026, 3, 11),
    ]
    assert len(days) == 5


def test_business_days_de_un_rango_invertido_es_error():
    with pytest.raises(InvalidTaskRangeError):
        business_days(date(2026, 3, 11), date(2026, 3, 5))


def test_reparto_de_horas_es_exacto_en_centimas():
    # 10 h entre 3 dias: 3,34 + 3,33 + 3,33.
    units = split_units(10, 3)
    assert units == [334, 333, 333]
    assert sum(units) == 1000
    assert from_units(sum(units)) == 10.0


def test_el_desvio_por_tarea_no_supera_medio_centesimo():
    # La cuantizacion a centimas puede apartar cada tarea hasta 0,005 h
    # respecto al valor de entrada.
    valores = (
        Decimal("2.675"),
        Decimal(1) / 3,
        Decimal("0.07"),
        Decimal("13.33"),
        Decimal("99.99"),
    )
    for horas in valores:
        detalle = compute_task_week_load(date(2026, 3, 2), date(2026, 3, 6), horas)
        desvio = abs(sum(detalle.values()) - horas)
        assert desvio <= Decimal("0.005") + Decimal("1e-9"), f"{horas} se desvio {desvio}"


def test_el_motor_no_devuelve_floats():
    # Las horas del motor son Decimal en todo momento. El float solo
    # aparece en el borde JSON, donde el valor tiene dos decimales.
    user = FakeUser(id=1, name="Ana", weekly_base_hours=H("40.00"))
    task = FakeTask(
        id=1,
        assigned_to=1,
        start_date=date(2026, 3, 5),
        end_date=date(2026, 3, 11),
        estimated_hours=H("40.00"),
    )

    report = build_capacity_report([user], [task])

    assert isinstance(report.rows[0].total_hours, Decimal)
    assert isinstance(report.rows[0].weekly_base_hours, Decimal)
    for cell in report.rows[0].cells:
        assert isinstance(cell.hours, Decimal)
        assert not isinstance(cell.hours, float)


def test_el_informe_cuadra_exacto_con_las_horas_estimadas():
    # El reparto se hace en centimas enteras, de modo que el total del
    # informe coincide con la suma de las tareas sin deriva acumulativa.
    horas = [10, 7, 35, 0.01, 13.33, 100, 1 / 3]
    tasks = [
        FakeTask(i + 1, 1, date(2026, 3, 2), date(2026, 3, 2 + i), h)
        for i, h in enumerate(horas)
    ]

    report = build_capacity_report([FakeUser(1, "Ana")], tasks)

    esperado = sum(to_units(h) for h in horas)
    obtenido = sum(to_units(cell.hours) for cell in report.rows[0].cells)
    assert obtenido == esperado
    assert report.rows[0].total_hours == from_units(esperado)


def test_el_reparto_no_depende_del_orden_de_las_sumas():
    # 7 h entre 7 dias es exacto; 10 h entre 7 dias no lo es en coma flotante.
    assert sum(split_units(7, 7)) == 700
    assert sum(split_units(10, 7)) == 1000
    assert sum(split_units(0.01, 7)) == 1


def test_conversion_a_centimas_usa_redondeo_a_la_mitad():
    assert to_units(40) == 4000
    assert to_units(0.1) == 10
    assert to_units(2.675) == 268
    assert from_units(4000) == 40.0


def test_split_units_sin_dias_es_error():
    with pytest.raises(NoBusinessDaysError):
        split_units(10, 0)


def test_informe_detecta_sobrecarga():
    user = FakeUser(id=1, name="Ana", weekly_base_hours=H("40.00"))
    # 60 h en una sola semana.
    task = FakeTask(
        id=1,
        assigned_to=1,
        start_date=date(2026, 3, 2),
        end_date=date(2026, 3, 6),
        estimated_hours=60,
    )

    report = build_capacity_report([user], [task])

    assert report.weeks == ("2026-W10",)
    row = report.rows[0]
    assert row.cells[0].hours == H("60.00")
    assert row.cells[0].is_overloaded is True
    assert row.has_overload is True


def test_informe_no_marca_sobrecarga_en_el_limite_exacto():
    user = FakeUser(id=1, name="Ana", weekly_base_hours=H("40.00"))
    task = FakeTask(
        id=1,
        assigned_to=1,
        start_date=date(2026, 3, 2),
        end_date=date(2026, 3, 6),
        estimated_hours=40,
    )

    report = build_capacity_report([user], [task])

    assert report.rows[0].cells[0].hours == H("40.00")
    assert report.rows[0].cells[0].is_overloaded is False


def test_informe_suma_varias_tareas_de_la_misma_persona():
    user = FakeUser(id=1, name="Ana", weekly_base_hours=H("40.00"))
    tasks = [
        FakeTask(1, 1, date(2026, 3, 2), date(2026, 3, 3), 10),
        FakeTask(2, 1, date(2026, 3, 4), date(2026, 3, 6), 20),
    ]

    report = build_capacity_report([user], tasks)

    assert report.rows[0].cells[0].hours == H("30.00")
    assert report.rows[0].total_hours == H("30.00")


def test_informe_incluye_todas_las_semanas_con_actividad():
    user = FakeUser(id=1, name="Ana")
    tasks = [
        FakeTask(1, 1, date(2026, 3, 5), date(2026, 3, 6), 10),
        FakeTask(2, 1, date(2026, 3, 9), date(2026, 3, 10), 10),
    ]

    report = build_capacity_report([user], tasks)

    assert report.weeks == ("2026-W10", "2026-W11")
    row = report.rows[0]
    assert [cell.hours for cell in row.cells] == [H("10.00"), H("10.00")]


def test_informe_marca_solo_la_semana_sobrecargada():
    user = FakeUser(id=1, name="Ana", weekly_base_hours=H("40.00"))
    tasks = [
        FakeTask(1, 1, date(2026, 3, 2), date(2026, 3, 6), 50),
        FakeTask(2, 1, date(2026, 3, 9), date(2026, 3, 10), 10),
    ]

    report = build_capacity_report([user], tasks)

    cells = {cell.week: cell for cell in report.rows[0].cells}
    assert cells["2026-W10"].is_overloaded is True
    assert cells["2026-W11"].is_overloaded is False


def test_informe_separa_a_cada_persona():
    users = [FakeUser(1, "Ana", 40.0), FakeUser(2, "Luis", 40.0)]
    tasks = [
        FakeTask(1, 1, date(2026, 3, 2), date(2026, 3, 6), 50),
        FakeTask(2, 2, date(2026, 3, 2), date(2026, 3, 6), 10),
    ]

    report = build_capacity_report(users, tasks)

    by_id = {row.user_id: row for row in report.rows}
    assert by_id[1].cells[0].is_overloaded is True
    assert by_id[2].cells[0].is_overloaded is False


def test_informe_registra_tareas_sin_asignar_y_sin_fechas():
    user = FakeUser(1, "Ana")
    tasks = [
        FakeTask(1, None, date(2026, 3, 2), date(2026, 3, 6), 10),
        FakeTask(2, 1, None, None, 10),
        FakeTask(3, 1, date(2026, 3, 2), date(2026, 3, 6), 10),
    ]

    report = build_capacity_report([user], tasks)

    assert report.unassigned_task_ids == (1,)
    assert report.undated_task_ids == (2,)
    assert report.rows[0].total_hours == H("10.00")


def test_informe_sin_tareas_devuelve_columnas_vacias():
    report = build_capacity_report([FakeUser(1, "Ana")], [])

    assert report.weeks == ()
    assert report.rows[0].cells == ()
    assert report.rows[0].total_hours == H("0.00")


def test_informe_serializa_a_diccionario():
    user = FakeUser(1, "Ana", 40.0)
    task = FakeTask(1, 1, date(2026, 3, 2), date(2026, 3, 6), 50)

    data = build_capacity_report([user], [task]).to_dict()

    assert data["weeks"] == ["2026-W10"]
    assert data["rows"][0]["user_id"] == 1
    assert data["rows"][0]["cells"][0]["is_overloaded"] is True
    assert data["rows"][0]["cells"][0]["hours"] == 50.0
