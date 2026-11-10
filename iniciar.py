"""Arranque de CorePlanner.

Levanta la API y la interfaz en un solo comando y abre el navegador:

    python iniciar.py

Los dos procesos se lanzan como hijos y se cierran juntos con Ctrl+C. Si un
puerto ya esta ocupado, se da por arrancado y no se relanza: la aplicacion
puede estar en pie desde otra terminal.

No siembra la base de datos ni instala dependencias: para eso estan
backend\\seed.py y el apartado de puesta en marcha del README.
"""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
FRONTEND = RAIZ / "frontend"

API_HOST = "127.0.0.1"
API_PORT = 8000
WEB_HOST = "localhost"
WEB_PORT = 5173
WEB_URL = f"http://{WEB_HOST}:{WEB_PORT}"

# Segundos que se espera a que cada puerto acepte conexiones.
ESPERA_PUERTO = 30.0


def puerto_ocupado(host: str, port: int) -> bool:
    """True si algo escucha ya en ese puerto.

    La conexion se hace con create_connection, que prueba todas las direcciones
    que resuelva el nombre. En Windows "localhost" resuelve a ::1 y Vite escucha
    solo en IPv6, asi que un socket AF_INET se queda con 127.0.0.1, donde no
    hay nadie, y la comprobacion da un falso negativo.
    """
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False


def esperar_puerto(host: str, port: int, timeout: float) -> bool:
    """Espera a que el puerto acepte conexiones. True si abrio a tiempo."""
    limite = time.monotonic() + timeout
    while time.monotonic() < limite:
        if puerto_ocupado(host, port):
            return True
        time.sleep(0.3)
    return False


def interprete() -> Path | None:
    """Python del entorno virtual del repositorio."""
    if os.name == "nt":
        candidatos = [RAIZ / ".venv" / "Scripts" / "python.exe"]
    else:
        candidatos = [RAIZ / ".venv" / "bin" / "python"]
    for candidato in candidatos:
        if candidato.exists():
            return candidato
    return None


def ejecutable_npm() -> str:
    """Ruta a npm. En Windows se llama a npm.cmd: la version .ps1 esta bloqueada
    por la politica de ejecucion de scripts del sistema."""
    if os.name == "nt":
        return "npm.cmd"
    return "npm"


def entorno() -> dict[str, str]:
    """Entorno con la codificacion forzada a UTF-8."""
    variables = dict(os.environ)
    variables["PYTHONIOENCODING"] = "utf-8"
    variables["PYTHONUNBUFFERED"] = "1"
    return variables


def lanzar(comando: list[str], cwd: Path) -> subprocess.Popen:
    """Arranca un proceso hijo que se cierra con el script."""
    if os.name == "nt":
        proceso = subprocess.Popen(comando, cwd=str(cwd), env=entorno())
    else:
        proceso = subprocess.Popen(
            comando, cwd=str(cwd), env=entorno(), start_new_session=True
        )
    return proceso


def terminar(proceso: subprocess.Popen) -> None:
    """Cierra el proceso y a sus hijos."""
    if proceso.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(proceso.pid), "/T", "/F"],
            capture_output=True,
            check=False,
        )
        return
    try:
        os.killpg(os.getpgid(proceso.pid), signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        proceso.terminate()


def main() -> int:
    python = interprete()
    if python is None:
        print("No se encuentra el entorno virtual .venv.")
        print("Créalo con:  python -m venv .venv")
        print("Y luego:     .\\.venv\\Scripts\\pip install -e \".[dev]\"")
        return 1

    if not (FRONTEND / "node_modules").exists():
        print("Faltan las dependencias del frontend.")
        print("Instálalas con:  cd frontend && npm install")
        return 1

    procesos: list[subprocess.Popen] = []

    if puerto_ocupado(API_HOST, API_PORT):
        print(f"API: ya escucha en {API_HOST}:{API_PORT}, no se relanza.")
    else:
        print(f"API: arrancando en {API_HOST}:{API_PORT} ...")
        procesos.append(
            lanzar(
                [
                    str(python),
                    "-m",
                    "uvicorn",
                    "backend.main:app",
                    "--reload",
                    "--reload-dir",
                    "backend",
                    "--host",
                    API_HOST,
                    "--port",
                    str(API_PORT),
                ],
                RAIZ,
            )
        )

    if puerto_ocupado(WEB_HOST, WEB_PORT):
        print(f"Interfaz: ya escucha en {WEB_HOST}:{WEB_PORT}, no se relanza.")
    else:
        print(f"Interfaz: arrancando en {WEB_HOST}:{WEB_PORT} ...")
        procesos.append(
            lanzar(
                [ejecutable_npm(), "--prefix", str(FRONTEND), "run", "dev"],
                RAIZ,
            )
        )

    if not esperar_puerto(API_HOST, API_PORT, ESPERA_PUERTO):
        print(f"La API no responde en {API_HOST}:{API_PORT}. Revisa el log de arriba.")
    if not esperar_puerto(WEB_HOST, WEB_PORT, ESPERA_PUERTO):
        print(f"La interfaz no responde en {WEB_HOST}:{WEB_PORT}. Revisa el log de arriba.")

    print()
    print(f"CorePlanner en {WEB_URL}")
    print(f"  API:      http://{API_HOST}:{API_PORT}/docs")
    print("  Acceso:   ivan@example.com / coreplanner")
    if not (RAIZ / "coreplanner.db").exists():
        print("  La base de datos esta vacia: ejecuta backend\\seed.py para sembrarla.")
    print()

    if not webbrowser.open(WEB_URL):
        print(f"No se ha podido abrir el navegador: entra en {WEB_URL} a mano.")
    print("Ctrl+C para cerrar los dos procesos.")

    try:
        while True:
            time.sleep(1)
            for proceso in procesos:
                if proceso.poll() is not None:
                    print("Uno de los procesos ha terminado. Cerrando.")
                    return 1
    except KeyboardInterrupt:
        print()
        print("Cerrando ...")
        for proceso in procesos:
            terminar(proceso)
        return 0


if __name__ == "__main__":
    sys.exit(main())
