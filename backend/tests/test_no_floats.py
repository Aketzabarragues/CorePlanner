"""Guard del backend: sin aritmetica en coma flotante.

Las horas se manejan con Numeric(12, 2) en la base de datos y Decimal en el
motor, de modo que el unico float admisible es el que aparece en el borde
JSON, donde el valor tiene como maximo dos decimales.
"""

from __future__ import annotations

import ast
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent

ARITH_OPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow)


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
    findings = []
    for node in ast.walk(tree):
        if isinstance(node, ast.AnnAssign) and node.annotation is not None:
            text = ast.unparse(node.annotation)
            if "float" in text and "hour" in text.lower():
                findings.append((node.lineno, text))
    return findings


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

    assert not hallazgos, "aritmetica en coma flotante:\n" + "\n".join(hallazgos)
