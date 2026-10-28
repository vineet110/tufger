"""Logins, sign-ups, passwords, admin tools for managing hosts, and each host's public house rules."""

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import schemas
from auth import check_login, current_host, hash_password, issue_token, require_key, require_site_admin, verify_password
from config import get_settings
from db import SessionLocal, adopt_orphans, get_db
from models import AppSettings, Booking, Host, Player, SiteConfig
from services import get_app_settings

router = APIRouter(prefix="/auth", tags=["accounts"])
admin_router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_site_admin)])
public_router = APIRouter(prefix="/public", tags=["public"])

RESERVED = {"admin", "root", "tufger", "support", "help", "api", "host", "hosts", "login", "signup"}


def _me(h: Host) -> schemas.Me:
    return schemas.Me(id=h.id, username=h.username, display_name=h.display_name, role=h.role)


def _token(h: Host) -> schemas.TokenOut:
    return schemas.TokenOut(token=issue_token(h), me=_me(h))


def _new_host(db: Session, body: schemas.HostSignupIn, role: str) -> Host:
    username = body.username.strip().lower()
    if username in RESERVED:
        raise HTTPException(400, "That username is reserved. Pick another one")
    if db.scalar(select(Host).where(Host.username == username)):
        raise HTTPException(409, "That username is taken")
    host = Host(
        username=username,
        display_name=" ".join(body.display_name.split()),
        password_hash=hash_password(body.password),
        role=role,
    )
    db.add(host)
    try:
        db.commit()
    except IntegrityError:  # two sign-ups racing for one name
        db.rollback()
        raise HTTPException(409, "That username is taken")
    get_app_settings(db, host.id)  # their own settings row, named after them
    return host


# ---------- login & sign-up ----------

@router.post("/login", response_model=schemas.TokenOut)
def admin_login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    """The Pavilion passcode: signs in the site admin."""
    admin = db.scalar(select(Host).where(Host.role == "admin").order_by(Host.id))
    return _token(check_login(db, admin, body.passcode))


@router.post("/host/login", response_model=schemas.TokenOut)
def host_login(body: schemas.HostLoginIn, db: Session = Depends(get_db)):
    host = db.scalar(select(Host).where(Host.username == body.username.strip().lower()))
    return _token(check_login(db, host, body.password))


@router.post("/host/signup", response_model=schemas.TokenOut)
def host_signup(body: schemas.HostSignupIn, db: Session = Depends(get_db)):
    return _token(_new_host(db, body, "host"))


@router.get("/me", response_model=schemas.Me)
def me(host: Host = Depends(current_host)):
    return _me(host)


@router.put("/password", response_model=schemas.TokenOut)
def change_password(body: schemas.PasswordChangeIn, host: Host = Depends(current_host), db: Session = Depends(get_db)):
    if not verify_password(body.current, host.password_hash):
        raise HTTPException(400, "Your current password is wrong")
    host.password_hash = hash_password(body.new)
    host.token_version += 1  # signs out every other device
    db.commit()
    return _token(host)


@router.post("/unlock")
def unlock(host: Host = Depends(require_key)):
    """Checks the Tufger key that opens Dugout and Scorebook (premium hosts only)."""
    return {"ok": True}


# ---------- admin: hosts & Tufger key ----------

def _admin_row(db: Session, h: Host) -> schemas.HostAdminRow:
    return schemas.HostAdminRow(
        **_me(h).model_dump(),
        active=h.active,
        created_at=h.created_at,
        bookings=db.scalar(select(func.count()).select_from(Booking).where(Booking.host_id == h.id)) or 0,
        players=db.scalar(select(func.count()).select_from(Player).where(Player.host_id == h.id)) or 0,
    )


@admin_router.get("/hosts", response_model=list[schemas.HostAdminRow])
def list_hosts(db: Session = Depends(get_db)):
    hosts = db.scalars(select(Host).order_by(Host.created_at)).all()
    return [_admin_row(db, h) for h in hosts]


@admin_router.post("/hosts", response_model=schemas.HostAdminRow)
def create_host(body: schemas.HostCreateIn, db: Session = Depends(get_db)):
    return _admin_row(db, _new_host(db, body, body.role))


@admin_router.patch("/hosts/{host_id}", response_model=schemas.HostAdminRow)
def update_host(host_id: int, body: schemas.HostPatch, db: Session = Depends(get_db)):
    h = db.get(Host, host_id)
    if h is None:
        raise HTTPException(404, "Host not found")
    if h.role == "admin":
        raise HTTPException(400, "Change your own account from the Account section")
    if body.role is not None:
        h.role = body.role
    if body.active is not None:
        h.active = body.active
        if not body.active:
            h.token_version += 1  # kick them out right away
    if body.password:
        h.password_hash = hash_password(body.password)
        h.token_version += 1
        h.failed_logins = 0
        h.locked_until = None
    db.commit()
    return _admin_row(db, h)


@admin_router.put("/tufger-key")
def set_tufger_key(body: schemas.VaultKeyIn, db: Session = Depends(get_db)):
    config = db.get(SiteConfig, 1) or SiteConfig(id=1)
    config.vault_key_hash = hash_password(body.key)
    db.add(config)
    db.commit()
    return {"ok": True}


# ---------- public house rules ----------

@public_router.get("/rules", response_model=schemas.PublicRules)
def house_rules(host: str = "", db: Session = Depends(get_db)):
    """A host's refund and last-minute rules for the /policies page ("" = the site admin)."""
    query = select(Host).where(Host.username == host.lower()) if host else select(Host).where(Host.role == "admin").order_by(Host.id)
    h = db.scalar(query)
    if h is None:
        raise HTTPException(404, "Host not found")
    s = get_app_settings(db, h.id)
    return schemas.PublicRules(host_name=s.organizer_name or h.display_name, refunds=s.house_refunds, last_minute=s.house_last_minute)


# ---------- first start ----------

def bootstrap() -> None:
    """Make sure the admin account and site config exist, and hand pre-account data to the admin."""
    with SessionLocal() as db:
        admin = db.scalar(select(Host).where(Host.role == "admin").order_by(Host.id))
        if admin is None:
            old = db.scalar(select(AppSettings).where(AppSettings.host_id.is_(None)))
            name = (old.organizer_name if old else "") or "Admin"
            db.add(Host(
                username="admin",
                display_name=re.sub(r"\s+", " ", name).strip()[:80],
                password_hash=hash_password(get_settings().admin_passcode),
                role="admin",
            ))
            try:
                db.commit()
            except IntegrityError:  # another instance created it at the same moment
                db.rollback()
            admin = db.scalar(select(Host).where(Host.role == "admin").order_by(Host.id))
        if db.get(SiteConfig, 1) is None:
            db.add(SiteConfig(id=1))
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
        admin_id = admin.id
    adopt_orphans(admin_id)
