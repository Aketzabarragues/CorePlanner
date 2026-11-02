"""Guard del backend: las horas no pasan por coma flotante.

Las horas se manejan con Numeric(12, 2) en la base de datos y Decimal en el
motor. El unico float admisible es el que aparece en el borde JSON, donde el
valor tiene como maximo dos decimales.

Se vigilan tres cosas:

  - literales float dentro de aritmetica;
  - campos de horas anotados como float en el contrato (esquemas y modelos);
  - llamadas a float() fuera del unico punto de paso a JSON.
"""

from __future__ import annotations

import ast
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

ARITH_OPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow)

JSON_BOUNDARY = ("services/capacity.py", "hours_to_json")
"""Funcion autorizada a convertir horas en float para la respuesta JSON."""


def _float_literals_in_arithmetic(tree: ast.AST) -> list[tuple[int, str]]:
    findings = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.BinOp) or not isinstance(node.op, ARITH_OPS):
            continue
        for side in (node.left, node.right):
            if isinstance(side, ast.Constant) and isinstance(side.value, float):
                findings.append((side.lineno, f"literal float {side.value}"))
            elif isinstance(side, ast.UnaryOp):
                value = side.operand
                if isinstance(value, ast.Constant) and isinstance(value.value, float):
                    findings.append((side.lineno, f"literal float {value.value} con signo"))
    return findings


def _float_annotations_on_hours(tree: ast.AST) -> list[tuple[int, str]]:
    """Campos de horas anotados como float en el contrato."""
    findings = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.AnnAssign) or node.annotation is None:
            continue
        if not isinstance(node.target, ast.Name):
            continue
        if "hour" not in node.target.id.lower():
            continue
        text = ast.unparse(node.annotation)
        if "float" in text:
            findings.append((node.lineno, f"{node.target.id}: {text}"))
    return findings


def _float_calls_outside_boundary(
    path: Path, tree: ast.AST
) -> list[tuple[int, str]]:
    """Llamadas a float() que no estan en el punto de paso a JSON."""
    relative = path.relative_to(BACKEND_DIR).as_posix()

    calls = {
        node.lineno
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "float"
    }
    if not calls:
        return []

    allowed = set()
    if relative == JSON_BOUNDARY[0]:
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == JSON_BOUNDARY[1]:
                for inner in ast.walk(node):
                    lineno = getattr(inner, "lineno", None)
                    if lineno is not None:
                        allowed.add(lineno)

    return [
        (lineno, "conversion a float fuera del punto de paso a JSON")
        for lineno in sorted(calls - allowed)
    ]


def test_el_backend_no_usa_aritmetica_en_coma_flotante():
    archivos = sorted(BACKEND_DIR.rglob("*.py"))
    assert archivos, "no se han encontrado ficheros Python en backend/"

    hallazgos = []
    for path in archivos:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for lineno, detalle in _float_literals_in_arithmetic(tree):
            hallazgos.append(f"{path.relative_to(BACKEND_DIR)}:{lineno} {detalle}")
        for lineno, detalle in _float_annotations_on_hours(tree):
            hallazgos.append(f"{path.relative_to(BACKEND_DIR)}:{lineno} anotacion {detalle}")
        for lineno, detalle in _float_calls_outside_boundary(path, tree):
            hallazgos.append(f"{path.relative_to(BACKEND_DIR)}:{lineno} {detalle}")

    assert not hallazgos, "aritmetica en coma flotante:\n" + "\n".join(hallazgos)
