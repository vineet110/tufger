"""config.ini, saved logs, the premium "shown total" and the pay-to number."""

from config import Ini
from db import SessionLocal
from models import Host

PLAYERS = [{"name": "Asha"}, {"name": "Bilal"}, {"name": "Chirag"}, {"name": "Dev"}]


def _role(client, headers, role):
    me = client.get("/auth/me", headers=headers).json()
    with SessionLocal() as db:
        db.get(Host, me["id"]).role = role
        db.commit()


def _admin(client):
    token = client.post("/auth/login", json={"passcode": "test-admin-passcode"}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


def _booking(client, headers, ground, **extra):
    res = client.post("/bookings", headers=headers, json={
        "ground_id": ground, "play_date": "2026-11-08", "start_time": "07:00", "duration_min": 60,
        "rate_per_hour": 1000, "players": PLAYERS, **extra,
    })
    assert res.status_code == 200, res.text
    return res.json()


# ---------- config.ini ----------

def test_ini_reads_file_env_and_defaults(tmp_path, monkeypatch):
    path = tmp_path / "c.ini"
    path.write_text("[auth]\nlock_minutes = 7 ; inline comment\nflag = yes\nbad = x\n[logging]\nskip_paths = /a, /b\n")
    cfg = Ini(path)
    assert cfg.int("auth", "lock_minutes", 10) == 7
    assert cfg.int("auth", "bad", 3) == 3
    assert cfg.int("auth", "missing", 4) == 4
    assert cfg.bool("auth", "flag", False) is True
    assert cfg.list("logging", "skip_paths") == ["/a", "/b"]
    monkeypatch.setenv("TUFGER_AUTH_LOCK_MINUTES", "2")
    assert cfg.int("auth", "lock_minutes", 10) == 2


# ---------- logs ----------

def test_logs_are_saved_and_admin_only(client, host, ground):
    booking = _booking(client, host, ground)
    client.post("/auth/host/login", json={"username": "nobody-here", "password": "wrong-password"})

    assert client.get("/admin/logs", headers=host).status_code == 403
    admin = _admin(client)
    page = client.get("/admin/logs", headers=admin).json()
    messages = [r["message"] for r in page["rows"]]
    assert any(f"booking {booking['id']}" in m and "created" in m for m in messages)
    created = next(r for r in page["rows"] if f"booking {booking['id']}" in r["message"])
    assert created["host_id"] is not None and created["request_id"]

    warnings = client.get("/admin/logs?level=WARNING", headers=admin).json()["rows"]
    assert warnings and all(r["level"] in ("WARNING", "ERROR", "CRITICAL") for r in warnings)
    assert any(r["path"].endswith("/auth/host/login") and r["status"] == 401 for r in warnings)

    found = client.get(f"/admin/logs?q={booking['slug']}", headers=admin).json()["rows"]
    assert found and all(booking["slug"] in r["message"] or booking["slug"] in r["path"] for r in found)


def test_logs_paginate(client, host, ground):
    for _ in range(3):
        _booking(client, host, ground)
    admin = _admin(client)
    first = client.get("/admin/logs?limit=2", headers=admin).json()
    assert len(first["rows"]) == 2 and first["next_before"]
    older = client.get(f"/admin/logs?limit=2&before={first['next_before']}", headers=admin).json()
    assert all(r["id"] < first["next_before"] for r in older["rows"])


def test_request_id_header(client):
    assert client.get("/health").headers.get("x-request-id")


# ---------- shown total ----------

def test_premium_shown_total(client, host, ground):
    _role(client, host, "premium")
    b = _booking(client, host, ground, discount=100)
    assert b["total_amount"] == 900

    res = client.patch(f"/bookings/{b['id']}", headers=host, json={"display_total": 1200})
    assert res.status_code == 200 and res.json()["display_total"] == 1200
    assert res.json()["total_amount"] == 900  # the real total is untouched
    pub = client.get(f"/public/b/{b['slug']}").json()
    assert pub["total_amount"] == 1200 and pub["tally"]["target"] == 1200
    assert pub["discount"] == 0 and pub["custom_total"] is True
    assert sum(e["amount"] for e in pub["entries"]) == 900  # shares stay as they were

    client.patch(f"/bookings/{b['id']}", headers=host, json={"display_total": None})
    pub = client.get(f"/public/b/{b['slug']}").json()
    assert pub["total_amount"] == 900 and pub["discount"] == 100 and pub["custom_total"] is False


def test_shown_total_is_premium_only(client, host, ground):
    b = _booking(client, host, ground, display_total=5000)
    assert b["display_total"] is None  # ignored at creation for a normal host
    assert client.patch(f"/bookings/{b['id']}", headers=host, json={"display_total": 5000}).status_code == 402


def test_shown_total_stops_when_host_is_downgraded(client, host, ground):
    _role(client, host, "premium")
    b = _booking(client, host, ground, display_total=1500)
    assert client.get(f"/public/b/{b['slug']}").json()["total_amount"] == 1500
    _role(client, host, "host")
    assert client.get(f"/public/b/{b['slug']}").json()["total_amount"] == 1000


# ---------- pay-to number ----------

def test_pay_phone(client, host, ground):
    s = client.get("/settings", headers=host).json()
    assert client.put("/settings", headers=host, json={**s, "pay_phone": "12345"}).status_code == 400
    saved = client.put("/settings", headers=host, json={**s, "upi_id": "me@okicici", "pay_phone": "+91 98765 43210"}).json()
    assert saved["pay_phone"] == "9876543210"
    b = _booking(client, host, ground)
    assert client.get(f"/public/b/{b['slug']}").json()["pay_phone"] == "9876543210"
    cleared = client.put("/settings", headers=host, json={**saved, "pay_phone": ""}).json()
    assert cleared["pay_phone"] == ""
