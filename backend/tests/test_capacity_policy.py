"""Pruebas del motor puro de politicas de capacidad.

Las politicas son objetos de prueba con los mismos campos que el modelo; el
motor no debe mirar mas alla de lo que el protocolo le pide.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime

from backend.services.capacity_policy import PolicyCell, evaluate_policies


@dataclass(frozen=True)
class Politica:
    """Politica de prueba, en el mismo formato que el modelo."""

    scope_type: str
    scope_id: int
    id: int = 1
    warn_percent: int = 80
    requires_approval_percent: int = 100
    active: bool = True
    created_at: datetime = field(
        default_factory=lambda: datetime(2026, 1, 5, tzinfo=UTC)
    )


def celda(
    user_id: int = 1,
    department_id: int | None = 1,
    units: int = 0,
    capacity_units: int | None = 4000,
    week: str = "2026-W10",
) -> PolicyCell:
    return PolicyCell(
        user_id=user_id,
        department_id=department_id,
        week=week,
        units=units,
        capacity_units=capacity_units,
    )


def test_sin_politicas_no_hay_veredictos():
    resultado = evaluate_policies([], [celda(units=4000)])
    assert resultado.verdicts == {}
    assert resultado.applied == {(1, "2026-W10"): None}


def test_debajo_del_umbral_de_aviso_sale_ok():
    policy = Politica(scope_type="persona", scope_id=1)
    resultado = evaluate_policies([policy], [celda(units=3199)])
    assert resultado.verdicts == {(1, "2026-W10"): "ok"}
    assert resultado.applied[(1, "2026-W10")] is policy


def test_en_el_umbral_de_aviso_sale_aviso():
    policy = Politica(scope_type="persona", scope_id=1, warn_percent=80)
    # 3200 * 100 == 4000 * 80: el umbral se alcanza, no se supera.
    resultado = evaluate_policies([policy], [celda(units=3200)])
    assert resultado.verdicts == {(1, "2026-W10"): "aviso"}


def test_en_el_umbral_de_aprobacion_sale_aprobacion():
    policy = Politica(scope_type="persona", scope_id=1)
    # 40,00 h de carga frente a 40,00 h de capacidad al 100 %.
    resultado = evaluate_policies([policy], [celda(units=4000)])
    assert resultado.verdicts == {(1, "2026-W10"): "aprobacion"}


def test_una_centima_por_debajo_del_tope_no_aproba():
    policy = Politica(scope_type="persona", scope_id=1)
    # 39,99 h: no alcanza el 100 %; si alcanza el 80 %, sale en aviso.
    resultado = evaluate_policies([policy], [celda(units=3999)])
    assert resultado.verdicts == {(1, "2026-W10"): "aviso"}


def test_al_canar_los_dos_umbrales_sale_aprobacion():
    policy = Politica(scope_type="persona", scope_id=1, warn_percent=50)
    resultado = evaluate_policies([policy], [celda(units=4000, capacity_units=4000)])
    assert resultado.verdicts == {(1, "2026-W10"): "aprobacion"}


def test_sin_capacidad_definida_no_hay_veredicto():
    policy = Politica(scope_type="persona", scope_id=1)
    resultado = evaluate_policies([policy], [celda(units=4000, capacity_units=None)])
    assert resultado.verdicts == {}
    assert resultado.applied == {(1, "2026-W10"): None}


def test_con_capacidad_cero_no_hay_veredicto():
    policy = Politica(scope_type="persona", scope_id=1)
    resultado = evaluate_policies([policy], [celda(units=4000, capacity_units=0)])
    assert resultado.verdicts == {}
    assert resultado.applied == {(1, "2026-W10"): None}


def test_la_politica_de_la_persona_manda_sobre_la_del_departamento():
    persona = Politica(scope_type="persona", scope_id=1, id=1, warn_percent=100)
    departamento = Politica(
        scope_type="departamento", scope_id=1, id=2, warn_percent=80
    )
    resultado = evaluate_policies(
        [persona, departamento], [celda(units=3200)]
    )
    # 3200 * 100 >= 4000 * 100 es falso: manda la de la persona, no la del
    # departamento, que la pondria en aviso.
    assert resultado.verdicts == {(1, "2026-W10"): "ok"}
    assert resultado.applied[(1, "2026-W10")] is persona


def test_la_politica_del_departamento_llega_a_quien_no_tiene_propia():
    departamento = Politica(scope_type="departamento", scope_id=1, warn_percent=80)
    resultado = evaluate_policies([departamento], [celda(units=3200)])
    assert resultado.verdicts == {(1, "2026-W10"): "aviso"}
    assert resultado.applied[(1, "2026-W10")] is departamento


def test_sin_departamento_no_llega_la_politica_del_departamento():
    departamento = Politica(scope_type="departamento", scope_id=1, warn_percent=80)
    resultado = evaluate_policies([departamento], [celda(department_id=None)])
    assert resultado.verdicts == {}
    assert resultado.applied == {(1, "2026-W10"): None}


def test_entre_varias_del_mismo_ambito_gana_la_mas_reciente():
    vieja = Politica(
        scope_type="persona",
        scope_id=1,
        id=1,
        warn_percent=100,
        created_at=datetime(2026, 1, 5, tzinfo=UTC),
    )
    nueva = Politica(
        scope_type="persona",
        scope_id=1,
        id=2,
        warn_percent=80,
        created_at=datetime(2026, 2, 2, tzinfo=UTC),
    )
    resultado = evaluate_policies([vieja, nueva], [celda(units=3200)])
    # Con la vieja (100 %) seria ok; con la nueva (80 %) sale aviso.
    assert resultado.verdicts == {(1, "2026-W10"): "aviso"}
    assert resultado.applied[(1, "2026-W10")] is nueva


def test_con_el_mismo_cread_at_gana_la_de_menor_id():
    menor = Politica(
        scope_type="persona",
        scope_id=1,
        id=1,
        warn_percent=80,
        created_at=datetime(2026, 1, 5, tzinfo=UTC),
    )
    mayor = Politica(
        scope_type="persona",
        scope_id=1,
        id=7,
        warn_percent=100,
        created_at=datetime(2026, 1, 5, tzinfo=UTC),
    )
    resultado = evaluate_policies([mayor, menor], [celda(units=3200)])
    # Con la id=7 (100 %) seria ok; manda la id=1 (80 %), que da aviso.
    assert resultado.verdicts == {(1, "2026-W10"): "aviso"}
    assert resultado.applied[(1, "2026-W10")] is menor


def test_la_politica_inactiva_no_se_aplica():
    inactiva = Politica(scope_type="persona", scope_id=1, active=False)
    resultado = evaluate_policies([inactiva], [celda(units=4000)])
    assert resultado.verdicts == {}
    assert resultado.applied == {(1, "2026-W10"): None}


def test_el_veredicto_cubre_cada_celda_del_informe():
    policy = Politica(scope_type="persona", scope_id=1)
    cells = [
        celda(user_id=1, week="2026-W10", units=1000),
        celda(user_id=1, week="2026-W11", units=3200),
        celda(user_id=2, department_id=None, week="2026-W10", units=3200),
    ]
    resultado = evaluate_policies([policy], cells)
    assert resultado.verdicts == {
        (1, "2026-W10"): "ok",
        (1, "2026-W11"): "aviso",
    }
    assert resultado.applied[(1, "2026-W10")] is policy
    assert resultado.applied[(1, "2026-W11")] is policy
    assert resultado.applied[(2, "2026-W10")] is None
