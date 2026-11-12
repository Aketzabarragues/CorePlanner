"""Pruebas del color propio de departamentos y proyectos.

El color se elige al crear la fila y sale de una paleta cerrada: el backend
ofrece el color que menos se repite y la API no admite colores ajenos a la
paleta. Una vez guardado, el color es un dato mas de la fila.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from backend.database import create_engine
from backend.models import Base, Department, Project
from backend.palette import (
    PALETTE,
    PALETTE_COLORS,
    assign_missing_colors,
    least_used_color,
    suggest_color,
)
from backend.schemas import DepartmentCreate, ProjectCreate
from backend.services.configuration import create_department, create_project

GERENTE = "ivan@example.com"


@pytest.fixture
async def sesion():
    """Sesion contra una base vacia con el esquema ya creado."""
    engine = create_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


async def _departamentos(sesion) -> list[Department]:
    """Departamentos de la base, ordenados por id."""
    filas = (await sesion.execute(select(Department).order_by(Department.id))).scalars().all()
    return list(filas)


def test_la_paleta_no_tiene_colores_repetidos():
    """Cada color de la paleta es distinto: son valores, no familias."""
    colores = [color for color, _ in PALETTE]

    assert len(colores) == len(set(colores))
    assert set(colores) == PALETTE_COLORS


def test_el_color_menos_usado_esta_siempre_en_la_paleta():
    """El color que se propone nunca se sale de la paleta."""
    color = least_used_color({"#1f6feb": 3, "#0a3d91": 1})

    assert color in PALETTE_COLORS


def test_el_color_menos_usado_elige_el_que_menos_se_repite():
    """Un color sin usar pesa menos que uno que ya se repite."""
    assert least_used_color({"#1f6feb": 5, "#0a3d91": 2}) == "#1a7f37"
    assert least_used_color({"#1f6feb": 5, "#0a3d91": 2, "#1a7f37": 1}) == "#0b6e4f"


def test_los_empates_se_resuelven_con_el_orden_de_la_paleta():
    """Con el mismo numero de repeticiones, gana el primero de la paleta."""
    assert least_used_color({}) == PALETTE[0][0]
    assert least_used_color({PALETTE[0][0]: 1}) == PALETTE[1][0]


async def test_suggest_color_devuelve_un_color_de_la_paleta(sesion):
    """La propuesta sale de la paleta y no es uno de los mas usados."""
    sesion.add_all(
        [
            Department(name="Uno", color="#1f6feb"),
            Department(name="Dos", color="#1f6feb"),
            Department(name="Tres", color="#0a3d91"),
        ]
    )
    await sesion.commit()

    color = await suggest_color(sesion, Department)

    assert color in PALETTE_COLORS
    assert color not in {"#1f6feb", "#0a3d91"}


async def test_suggest_color_es_el_primer_color_si_no_hay_filas(sesion):
    """Sin nada que contar, la propuesta es el primer color de la paleta."""
    color = await suggest_color(sesion, Project)

    assert color == PALETTE[0][0]


async def test_assign_missing_colors_reparte_colores_distintos(sesion):
    """Mientras queden colores libres, las filas reciben colores distintos."""
    sesion.add_all(
        [
            Department(name="Uno"),
            Department(name="Dos"),
            Department(name="Tres"),
        ]
    )
    await sesion.commit()

    asignados = await assign_missing_colors(sesion, Department)
    await sesion.commit()

    assert asignados == 3
    colores = [fila.color for fila in await _departamentos(sesion)]
    assert all(color in PALETTE_COLORS for color in colores)
    assert len(set(colores)) == 3


async def test_assign_missing_colors_no_toca_las_filas_con_color(sesion):
    """Las filas que ya tienen color se quedan como estaban."""
    sesion.add_all(
        [
            Department(name="Con color", color="#1f6feb"),
            Department(name="Sin color"),
        ]
    )
    await sesion.commit()

    asignados = await assign_missing_colors(sesion, Department)
    await sesion.commit()

    assert asignados == 1
    por_nombre = {fila.name: fila.color for fila in await _departamentos(sesion)}
    assert por_nombre["Con color"] == "#1f6feb"
    assert por_nombre["Sin color"] in PALETTE_COLORS


async def test_create_department_sin_color_elige_un_color_de_la_paleta(sesion):
    """El alta sin color nunca deja la fila sin color."""
    department = await create_department(sesion, DepartmentCreate(name="Sin color"))

    assert department.color in PALETTE_COLORS


async def test_create_project_dos_veces_da_colores_distintos(sesion):
    """Dos proyectos seguidos reciben colores distintos si quedan libres."""
    primero = await create_project(sesion, ProjectCreate(name="Uno"))
    segundo = await create_project(sesion, ProjectCreate(name="Dos"))

    assert primero.color in PALETTE_COLORS
    assert segundo.color in PALETTE_COLORS
    assert primero.color != segundo.color


async def test_dos_proyectos_nuevos_reciben_colores_distintos(client_con_seed: AsyncClient, entrar):
    """Por la API, dos altas seguidas reciben colores distintos."""
    headers = await entrar(GERENTE)

    primero = await client_con_seed.post(
        "/api/projects", headers=headers, json={"name": "Proyecto A"}
    )
    segundo = await client_con_seed.post(
        "/api/projects", headers=headers, json={"name": "Proyecto B"}
    )

    assert primero.status_code == 201, primero.text
    assert segundo.status_code == 201, segundo.text
    color_primero = primero.json()["color"]
    color_segundo = segundo.json()["color"]
    assert color_primero in PALETTE_COLORS
    assert color_segundo in PALETTE_COLORS
    assert color_primero != color_segundo


async def test_un_proyecto_nuevo_sin_color_recibe_un_color_de_la_paleta(
    client_con_seed: AsyncClient, entrar
):
    """Un alta sin la clave color nunca devuelve color nulo."""
    headers = await entrar(GERENTE)

    response = await client_con_seed.post(
        "/api/projects", headers=headers, json={"name": "Proyecto sin color"}
    )

    assert response.status_code == 201, response.text
    color = response.json()["color"]
    assert color is not None
    assert color in PALETTE_COLORS


async def test_un_departamento_nuevo_sin_color_recibe_un_color_de_la_paleta(
    client_con_seed: AsyncClient, entrar
):
    """Un alta sin la clave color nunca devuelve color nulo."""
    headers = await entrar(GERENTE)

    response = await client_con_seed.post(
        "/api/departments", headers=headers, json={"name": "Departamento sin color"}
    )

    assert response.status_code == 201, response.text
    color = response.json()["color"]
    assert color is not None
    assert color in PALETTE_COLORS


@pytest.mark.parametrize("color", ["#000000", "rojo"])
async def test_un_color_fuera_de_la_paleta_se_rechaza_al_crear_un_proyecto(
    client_con_seed: AsyncClient, entrar, color: str
):
    """La paleta es cerrada: un color de mas se rechaza al crear."""
    headers = await entrar(GERENTE)

    response = await client_con_seed.post(
        "/api/projects", headers=headers, json={"name": "Proyecto invalido", "color": color}
    )

    assert response.status_code == 422, response.text


@pytest.mark.parametrize("color", ["#000000", "rojo"])
async def test_un_color_fuera_de_la_paleta_se_rechaza_al_crear_un_departamento(
    client_con_seed: AsyncClient, entrar, color: str
):
    """La paleta es cerrada: un color de mas se rechaza al crear."""
    headers = await entrar(GERENTE)

    response = await client_con_seed.post(
        "/api/departments",
        headers=headers,
        json={"name": "Departamento invalido", "color": color},
    )

    assert response.status_code == 422, response.text


@pytest.mark.parametrize("color", ["#000000", "rojo"])
async def test_un_color_fuera_de_la_paleta_se_rechaza_al_modificar_un_proyecto(
    client_con_seed: AsyncClient, entrar, color: str
):
    """La paleta es cerrada: un color de mas se rechaza al modificar."""
    headers = await entrar(GERENTE)
    proyectos = await client_con_seed.get("/api/projects", headers=headers)
    objetivo = proyectos.json()[0]

    response = await client_con_seed.patch(
        f"/api/projects/{objetivo['id']}", headers=headers, json={"color": color}
    )

    assert response.status_code == 422, response.text


@pytest.mark.parametrize("color", ["#000000", "rojo"])
async def test_un_color_fuera_de_la_paleta_se_rechaza_al_modificar_un_departamento(
    client_con_seed: AsyncClient, entrar, color: str
):
    """La paleta es cerrada: un color de mas se rechaza al modificar."""
    headers = await entrar(GERENTE)
    departamentos = await client_con_seed.get("/api/departments", headers=headers)
    objetivo = departamentos.json()[0]

    response = await client_con_seed.patch(
        f"/api/departments/{objetivo['id']}", headers=headers, json={"color": color}
    )

    assert response.status_code == 422, response.text


async def test_un_color_null_al_modificar_un_proyecto_se_rechaza(
    client_con_seed: AsyncClient, entrar
):
    """El color no puede quedar vacio: un null explicito es un error."""
    headers = await entrar(GERENTE)
    proyectos = await client_con_seed.get("/api/projects", headers=headers)
    objetivo = proyectos.json()[0]

    response = await client_con_seed.patch(
        f"/api/projects/{objetivo['id']}", headers=headers, json={"color": None}
    )

    assert response.status_code == 422, response.text


async def test_un_color_null_al_modificar_un_departamento_se_rechaza(
    client_con_seed: AsyncClient, entrar
):
    """El color no puede quedar vacio: un null explicito es un error."""
    headers = await entrar(GERENTE)
    departamentos = await client_con_seed.get("/api/departments", headers=headers)
    objetivo = departamentos.json()[0]

    response = await client_con_seed.patch(
        f"/api/departments/{objetivo['id']}", headers=headers, json={"color": None}
    )

    assert response.status_code == 422, response.text


async def test_modificar_el_color_de_un_departamento_lo_guarda(
    client_con_seed: AsyncClient, entrar
):
    """Un color valido de la paleta se guarda y se devuelve al leerlo."""
    headers = await entrar(GERENTE)
    departamentos = await client_con_seed.get("/api/departments", headers=headers)
    objetivo = departamentos.json()[0]

    response = await client_con_seed.patch(
        f"/api/departments/{objetivo['id']}", headers=headers, json={"color": "#1a7f37"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["color"] == "#1a7f37"

    listado = await client_con_seed.get("/api/departments", headers=headers)
    por_id = {item["id"]: item for item in listado.json()}
    assert por_id[objetivo["id"]]["color"] == "#1a7f37"


async def test_modificar_el_color_de_un_proyecto_lo_guarda(client_con_seed: AsyncClient, entrar):
    """Un color valido de la paleta se guarda y se devuelve al leerlo."""
    headers = await entrar(GERENTE)
    proyectos = await client_con_seed.get("/api/projects", headers=headers)
    objetivo = proyectos.json()[0]

    response = await client_con_seed.patch(
        f"/api/projects/{objetivo['id']}", headers=headers, json={"color": "#1a7f37"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["color"] == "#1a7f37"

    listado = await client_con_seed.get("/api/projects", headers=headers)
    por_id = {item["id"]: item for item in listado.json()}
    assert por_id[objetivo["id"]]["color"] == "#1a7f37"


async def test_los_colores_guardados_son_de_la_paleta(sesion):
    """Los colores que hay en la base son de la paleta: no hay colores sueltos."""
    sesion.add_all(
        [
            Department(name="Uno", color="#1f6feb"),
            Department(name="Dos", color="#0a3d91"),
        ]
    )
    await sesion.commit()

    await assign_missing_colors(sesion, Department)
    await sesion.commit()

    colores = [fila.color for fila in await _departamentos(sesion)]
    assert len(colores) == 2
    assert set(colores) <= PALETTE_COLORS
