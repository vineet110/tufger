"""App logging: stdout for Vercel's Logs tab, plus the app_logs table so history outlives Vercel's short retention.

Use it anywhere:  `from logger import get_logger; log = get_logger(__name__); log.info("...")`
Tunables live in config.ini → [logging].
"""

import logging
import secrets
import sys
import time
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Request
from sqlalchemy import delete, insert

from config import ini

ROOT = "tufger"

# One mutable dict per request: {"rid", "host", "rows"}. It's a shared object on purpose: sync routes run in a
# thread pool with a *copy* of the context, so a plain ContextVar.set() there would never reach the middleware.
# "rows" are log lines waiting to be saved, written in one insert before the response goes out.
_req: ContextVar[dict | None] = ContextVar("tufger_request", default=None)


def get_logger(name: str = "") -> logging.Logger:
    name = name.removeprefix(ROOT + ".")
    return logging.getLogger(f"{ROOT}.{name}" if name and name != ROOT else ROOT)


def set_host(host_id: int) -> None:
    """Called once a request's login checks out, so its log lines carry the host."""
    req = _req.get()
    if req is not None:
        req["host"] = host_id


def _level(name: str, default: int) -> int:
    value = logging.getLevelName(name.upper())
    return value if isinstance(value, int) else default


class _Context(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        req = _req.get() or {}
        record.request_id = req.get("rid") or "-"
        record.host = f"h{req['host']}" if req.get("host") is not None else "-"
        return True


class _DbHandler(logging.Handler):
    """Queues rows during a request (flushed by the middleware); writes straight away outside one."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            message = record.getMessage()
            if record.exc_info:
                message += "\n" + logging.Formatter().formatException(record.exc_info)
            row = {
                "created_at": datetime.fromtimestamp(record.created, timezone.utc),
                "level": record.levelname,
                "logger": record.name.removeprefix(ROOT + ".")[:60] or ROOT,
                "message": message[:8000],
                "method": getattr(record, "method", "")[:10],
                "path": getattr(record, "path", "")[:300],
                "status": getattr(record, "status", None),
                "duration_ms": getattr(record, "duration_ms", None),
                "ip": getattr(record, "ip", "")[:64],
                "request_id": (_req.get() or {}).get("rid", ""),
                "host_id": (_req.get() or {}).get("host"),
            }
            req = _req.get()
            if req is not None:
                req["rows"].append(row)
            else:
                _write([row])
        except Exception:  # logging must never break a request
            self.handleError(record)


def _write(rows: list[dict]) -> None:
    if not rows:
        return
    from db import engine  # late import: db imports config, keep this module importable first
    from models import AppLog

    try:
        with engine.begin() as conn:
            conn.execute(insert(AppLog), rows)
    except Exception as exc:  # DB down: stdout still has everything
        print(f"[logger] could not save {len(rows)} log rows: {exc}", file=sys.stderr)


def setup_logging() -> None:
    cfg = ini()
    root = logging.getLogger(ROOT)
    if root.handlers:  # already set up (uvicorn --reload re-imports)
        return
    root.setLevel(logging.DEBUG)
    root.propagate = False

    # Windows consoles default to cp1252, which can't print ₹; Vercel (Linux) is already UTF-8
    if (getattr(sys.stdout, "encoding", "") or "").lower().replace("-", "") != "utf8":
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    out = logging.StreamHandler(sys.stdout)
    out.setLevel(_level(cfg.get("logging", "level", "INFO"), logging.INFO))
    out.addFilter(_Context())
    out.setFormatter(logging.Formatter("%(levelname)s %(name)s [%(request_id)s %(host)s] %(message)s"))
    root.addHandler(out)

    if cfg.bool("logging", "db_enabled", True):
        db = _DbHandler()
        db.setLevel(_level(cfg.get("logging", "db_level", "INFO"), logging.INFO))
        root.addHandler(db)

    # nothing below DEBUG reaches a handler anyway, but skip the work when both handlers are higher
    root.setLevel(min(h.level for h in root.handlers))


def prune_old_logs() -> None:
    days = ini().int("logging", "retention_days", 30)
    if days <= 0:
        return
    from db import engine
    from models import AppLog

    try:
        with engine.begin() as conn:
            gone = conn.execute(delete(AppLog).where(AppLog.created_at < datetime.now(timezone.utc) - timedelta(days=days))).rowcount
        if gone:
            get_logger("logger").info("Deleted %s log rows older than %s days", gone, days)
    except Exception as exc:
        print(f"[logger] prune failed: {exc}", file=sys.stderr)


def install_request_logging(app: FastAPI, prefix: str = "") -> None:
    cfg = ini()
    enabled = cfg.bool("logging", "log_requests", True)
    quiet_gets = cfg.bool("logging", "quiet_gets", True)
    skip = {prefix + p for p in cfg.list("logging", "skip_paths")}
    log = get_logger("request")

    @app.middleware("http")
    async def _log_requests(request: Request, call_next):
        rid = request.headers.get("x-vercel-id", "").split("::")[-1][:32] or secrets.token_hex(6)
        req = {"rid": rid, "host": None, "rows": []}
        token = _req.set(req)
        start = time.perf_counter()
        path = request.url.path
        forwarded = request.headers.get("x-forwarded-for", "")
        ip = (forwarded.split(",")[0].strip() or (request.client.host if request.client else ""))[:64]
        extra = {"method": request.method, "path": path, "ip": ip}
        try:
            response = await call_next(request)
        except Exception:
            ms = int((time.perf_counter() - start) * 1000)
            log.exception("%s %s crashed after %sms", request.method, path, ms, extra={**extra, "status": 500, "duration_ms": ms})
            raise
        else:
            ms = int((time.perf_counter() - start) * 1000)
            if enabled and path not in skip:
                status = response.status_code
                level = (
                    logging.ERROR if status >= 500
                    else logging.WARNING if status >= 400
                    else logging.DEBUG if quiet_gets and request.method in ("GET", "HEAD", "OPTIONS")
                    else logging.INFO
                )
                log.log(level, "%s %s %s %sms", request.method, path, status, ms, extra={**extra, "status": status, "duration_ms": ms})
            response.headers["x-request-id"] = rid
            return response
        finally:
            _req.reset(token)
            _write(req["rows"])
