import os
import tempfile

from fastapi.testclient import TestClient

from backend.main import app


def test_health_endpoint() -> None:
    with TestClient(app) as client:
        response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_exposes_schema() -> None:
    with TestClient(app) as client:
        response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "paths" in response.json()


def test_app_creates_schema_in_file_db() -> None:
    import asyncio
    import importlib

    with tempfile.TemporaryDirectory() as tmp:
        os.environ["COREPLANNER_DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp}/test.db"

        from backend import config, database

        importlib.reload(config)
        importlib.reload(database)

        asyncio.run(database.create_all())
        assert os.path.exists(f"{tmp}/test.db")
        asyncio.run(database.dispose_engine())
