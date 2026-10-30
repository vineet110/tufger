"""Tests run on a throwaway SQLite file. These lines must stay above every server import: the real
.env points at the live database, and importing main creates tables and migrates whatever it's given."""

import os
import sys
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="tufger-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TMP) / 'test.db'}"
os.environ["ADMIN_PASSCODE"] = "test-admin-passcode"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["TUFGER_KEY"] = "test-key"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from db import engine  # noqa: E402
from main import app  # noqa: E402

assert engine.dialect.name == "sqlite", "refusing to run tests against a real database"

_count = 0


@pytest.fixture
def client():
    return TestClient(app, base_url="http://test/api/py")


@pytest.fixture
def signup(client):
    def make() -> dict:
        global _count
        _count += 1
        res = client.post("/auth/host/signup", json={"username": f"host{_count}", "display_name": f"Host {_count}", "password": "password123"})
        assert res.status_code == 200, res.text
        return {"Authorization": f"Bearer {res.json()['token']}"}

    return make


@pytest.fixture
def host(signup):
    return signup()


@pytest.fixture
def ground(client, host):
    res = client.post("/grounds", headers=host, json={"name": "Ramp", "price_per_hour": 1000})
    return res.json()["id"]
