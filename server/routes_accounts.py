"""Logins, sign-ups, passwords, admin tools for managing hosts, and each host's public house rules."""

import re

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import schemas
from auth import (
    check_login,
    check_throttle,
    confirm_identity,
    client_ip,
    current_host,
    hash_password,
    issue_token,
    new_passcode,
    note_login,
    passcode_lookup,
    require_key,
    require_site_admin,
    verify_password,
)
from config import get_settings
from db import SessionLocal, adopt_orphans, get_db
from models import AppSettings, Booking, Host, Player, SiteConfig
from services import get_app_settings

router = APIRouter(prefix="/auth", tags=["accounts"])
admin_router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_site_admin)])
public_router = APIRouter(prefix="/public", tags=["public"])

RESERVED = {"admin", "root", "tufger", "support", "help", "api", "host", "hosts", "login", "signup"}


def _me(h: Host) -> schemas.Me:
    return schemas.Me(
        id=h.id,
        username=h.username,
        display_name=h.display_name,
        role=h.role,
        has_passcode=bool(h.passcode_lookup),
        has_vault_password=bool(h.vault_hash),
    )


def _set_passcode(db: Session, h: Host, passcode: str | None) -> str:
    """Give an account a Pavilion passcode (generated when None). Each passcode opens exactly one account."""
    for _ in range(5):
        code = passcode or new_passcode()
        lookup = passcode_lookup(code)
        other = db.scalar(select(Host).where(Host.passcode_lookup == lookup))
        if other is None or other.id == h.id:
            h.passcode_hash = hash_password(code)
            h.passcode_lookup = lookup
            return code
        if passcode:  # only the admin chooses passcodes, so saying it's taken is safe
            raise HTTPException(409, "That passcode is already used by another account. Pick a different one")
    raise HTTPException(500, "Couldn't create a unique passcode, try again")


def _clear_passcode(h: Host) -> None:
    h.passcode_hash = None
    h.passcode_lookup = None


def _ip(request: Request, forwarded: str | None) -> str:
    return client_ip(forwarded, request.client.host if request.client else None)


def _token(h: Host) -> schemas.TokenOut:
    return schemas.TokenOut(token=issue_token(h), me=_me(h))


def _new_host(db: Session, body: schemas.HostSignupIn, role: str, passcode: str | None = None) -> tuple[Host, str | None]:
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
    code = _set_passcode(db, host, passcode) if role == "premium" else None
    db.add(host)
    try:
        db.commit()
    except IntegrityError:  # two sign-ups racing for one name
        db.rollback()
        raise HTTPException(409, "That username is taken")
    get_app_settings(db, host.id)  # their own settings row, named after them
    return host, code


# ---------- login & sign-up ----------

@router.post("/login", response_model=schemas.TokenOut)
def pavilion_login(
    body: schemas.LoginIn, request: Request, x_forwarded_for: str | None = Header(default=None), db: Session = Depends(get_db)
):
    """The Pavilion passcode: signs in the admin or a premium host. The passcode alone picks the account."""
    ip = _ip(request, x_forwarded_for)
    check_throttle(db, ip)
    host = db.scalar(select(Host).where(Host.passcode_lookup == passcode_lookup(body.passcode)))
    if host is None:
        # admin from before passcodes had their own field: their password was the passcode
        admin = db.scalar(select(Host).where(Host.role == "admin", Host.passcode_lookup.is_(None)).order_by(Host.id))
        if admin and verify_password(body.passcode, admin.password_hash):
            _set_passcode(db, admin, body.passcode)
            db.commit()
            host = admin
    try:
        if host is not None and host.role not in ("admin", "premium"):
            host = None  # a downgraded account's old passcode no longer opens the Pavilion
        signed_in = check_login(db, host, body.passcode, field="passcode_hash", wrong_msg="Wrong passcode")
    except HTTPException:
        note_login(db, ip, success=False)
        raise
    note_login(db, ip, success=True)
    return _token(signed_in)


@router.post("/host/login", response_model=schemas.TokenOut)
def host_login(
    body: schemas.HostLoginIn, request: Request, x_forwarded_for: str | None = Header(default=None), db: Session = Depends(get_db)
):
    ip = _ip(request, x_forwarded_for)
    check_throttle(db, ip)
    host = db.scalar(select(Host).where(Host.username == body.username.strip().lower()))
    try:
        signed_in = check_login(db, host, body.password)
    except HTTPException:
        note_login(db, ip, success=False)
        raise
    note_login(db, ip, success=True)
    return _token(signed_in)


@router.post("/host/signup", response_model=schemas.TokenOut)
def host_signup(body: schemas.HostSignupIn, db: Session = Depends(get_db)):
    host, _ = _new_host(db, body, "host")
    return _token(host)


@router.get("/me", response_model=schemas.Me)
def me(host: Host = Depends(current_host)):
    return _me(host)


@router.put("/password", response_model=schemas.TokenOut)
def change_password(body: schemas.PasswordChangeIn, host: Host = Depends(current_host), db: Session = Depends(get_db)):
    confirm_identity(db, host, body.current)
    if host.role == "admin":
        _set_passcode(db, host, body.new)  # for the admin, password and Pavilion passcode are one
    host.password_hash = hash_password(body.new)
    host.token_version += 1  # signs out every other device
    db.commit()
    return _token(host)


@router.post("/passcode/new")
def regenerate_passcode(body: schemas.PasscodeRegenIn, host: Host = Depends(current_host), db: Session = Depends(get_db)):
    """Premium hosts get a fresh random Pavilion passcode (they can't pick one: that could reveal someone else's)."""
    if host.role != "premium":
        raise HTTPException(400, "Only premium hosts have a Pavilion passcode")
    confirm_identity(db, host, body.password)
    code = _set_passcode(db, host, None)
    host.token_version += 1
    db.commit()
    return {"passcode": code, **_token(host).model_dump()}


@router.put("/vault-password", response_model=schemas.Me)
def set_vault_password(body: schemas.VaultPasswordIn, host: Host = Depends(current_host), db: Session = Depends(get_db)):
    """A premium host's own password for Dugout and Scorebook."""
    if host.role not in ("admin", "premium"):
        raise HTTPException(402, "Dugout and Scorebook are premium features")
    confirm_identity(db, host, body.confirm)
    host.vault_hash = hash_password(body.new)
    db.commit()
    return _me(host)


@router.post("/unlock")
def unlock(host: Host = Depends(require_key)):
    """Checks the Tufger key that opens Dugout and Scorebook (premium hosts only)."""
    return {"ok": True}


# ---------- admin: hosts & Tufger key ----------

def _admin_confirm(db: Session, secret: str | None) -> None:
    admin = db.scalar(select(Host).where(Host.role == "admin").order_by(Host.id))
    confirm_identity(db, admin, secret)

def _admin_row(db: Session, h: Host, passcode: str | None = None) -> schemas.HostAdminResult:
    return schemas.HostAdminResult(
        passcode=passcode,
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


@admin_router.post("/hosts", response_model=schemas.HostAdminResult)
def create_host(body: schemas.HostCreateIn, db: Session = Depends(get_db)):
    _admin_confirm(db, body.confirm)
    host, code = _new_host(db, body, body.role, body.passcode)
    return _admin_row(db, host, code)


@admin_router.patch("/hosts/{host_id}", response_model=schemas.HostAdminResult)
def update_host(host_id: int, body: schemas.HostPatch, db: Session = Depends(get_db)):
    h = db.get(Host, host_id)
    if h is None:
        raise HTTPException(404, "Host not found")
    if h.role == "admin":
        raise HTTPException(400, "Change your own account from the Account section")
    if body.password or body.passcode or body.new_passcode or body.role == "premium":
        _admin_confirm(db, body.confirm)  # anything that hands out a credential
    code = None
    if body.role is not None and body.role != h.role:
        h.role = body.role  # checked on every request, so open sessions follow straight away
        if body.role == "premium":
            code = _set_passcode(db, h, body.passcode)
        else:
            _clear_passcode(h)  # a normal host can't use the Pavilion
    elif body.passcode or body.new_passcode:
        if h.role != "premium":
            raise HTTPException(400, "Only premium hosts have a Pavilion passcode")
        code = _set_passcode(db, h, body.passcode)
        h.token_version += 1
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
    return _admin_row(db, h, code)


@admin_router.put("/tufger-key")
def set_tufger_key(body: schemas.VaultKeyIn, db: Session = Depends(get_db)):
    _admin_confirm(db, body.confirm)
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
            first = get_settings().admin_passcode
            db.add(Host(
                username="admin",
                display_name=re.sub(r"\s+", " ", name).strip()[:80],
                password_hash=hash_password(first),
                passcode_hash=hash_password(first),
                passcode_lookup=passcode_lookup(first),
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
