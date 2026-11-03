"""Site admin only: browse the saved app logs (see logger.py)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

import schemas
from auth import require_site_admin
from db import get_db
from logger import get_logger
from models import AppLog, Host

router = APIRouter(prefix="/admin/logs", tags=["admin"], dependencies=[Depends(require_site_admin)])

LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


@router.get("", response_model=schemas.LogPage)
def list_logs(
    level: str = "DEBUG",  # this level and above
    q: str = Query(default="", max_length=100),  # text in the message or path
    host: str = Query(default="", max_length=40),  # username
    before: int | None = None,  # id cursor for older rows
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = select(AppLog).order_by(AppLog.id.desc()).limit(limit)
    level = level.upper()
    if level in LEVELS and level != "DEBUG":
        query = query.where(AppLog.level.in_(LEVELS[LEVELS.index(level):]))
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(AppLog.message.ilike(like), AppLog.path.ilike(like), AppLog.request_id == q.strip()))
    if host.strip():
        h = db.scalar(select(Host).where(Host.username == host.strip().lower().lstrip("@")))
        query = query.where(AppLog.host_id == (h.id if h else -1))
    if before is not None:
        query = query.where(AppLog.id < before)
    rows = db.scalars(query).all()
    return schemas.LogPage(
        rows=[schemas.LogRow.model_validate(r, from_attributes=True) for r in rows],
        next_before=rows[-1].id if len(rows) == limit else None,
    )


@router.delete("")
def clear_logs(db: Session = Depends(get_db)):
    gone = db.execute(delete(AppLog)).rowcount
    db.commit()
    get_logger("logs").warning("Admin cleared %s saved log rows", gone)
    return {"deleted": gone}
