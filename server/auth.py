"""Accounts: password hashing, signed login tokens, role checks and the Tufger key."""

import base64
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from config import get_settings
from db import get_db
from models import Host, LoginThrottle, SiteConfig

settings = get_settings()

PBKDF2_ROUNDS = 200_000
MAX_FAILED_LOGINS = 5
LOCK_MINUTES = 10
NETWORK_MAX_FAILS = 10  # per network address
NETWORK_WINDOW_MINUTES = 15
PASSCODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I mix-ups
PREMIUM_ROLES = ("admin", "premium")


# ---------- passwords ----------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${PBKDF2_ROUNDS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    try:
        _, rounds, salt, digest = (stored or "").split("$")
        check = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds))
    except ValueError:
        return False
    return hmac.compare_digest(check.hex(), digest)


def passcode_lookup(passcode: str) -> str:
    """Keyed fingerprint of a passcode: finds its one account without storing the passcode itself."""
    return hmac.new(settings.secret_key.encode(), f"passcode:{passcode}".encode(), hashlib.sha256).hexdigest()


def new_passcode() -> str:
    return "".join(secrets.choice(PASSCODE_ALPHABET) for _ in range(8))


# ---------- tokens ----------

def _sign(payload: str) -> str:
    return hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()


def issue_token(host: Host) -> str:
    expires = int(time.time()) + settings.token_ttl_days * 86400
    payload = f"h:{host.id}:{host.token_version}:{expires}"
    return base64.urlsafe_b64encode(payload.encode()).decode() + "." + _sign(payload)


def current_host(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> Host:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Login required")
    if not authorization.startswith("Bearer "):
        raise unauthorized
    try:
        encoded, signature = authorization[7:].split(".", 1)
        payload = base64.urlsafe_b64decode(encoded.encode()).decode()
        kind, host_id, version, expires = payload.split(":")
    except ValueError:
        raise unauthorized
    if kind != "h" or not hmac.compare_digest(signature, _sign(payload)) or int(expires) < time.time():
        raise unauthorized
    host = db.get(Host, int(host_id))
    # a password change or deactivation bumps/blocks the account, which ends old sessions
    if host is None or not host.active or host.token_version != int(version):
        raise unauthorized
    return host


def require_site_admin(host: Host = Depends(current_host)) -> Host:
    if host.role != "admin":
        raise HTTPException(403, "Only the Tufger admin can do this")
    return host


def require_premium(host: Host = Depends(current_host)) -> Host:
    if host.role not in PREMIUM_ROLES:
        raise HTTPException(402, "Dugout and Scorebook are premium features. Ask the Tufger admin to upgrade you")
    return host


# ---------- login attempts ----------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


def check_login(db: Session, host: Host | None, password: str, field: str = "password_hash", wrong_msg: str = "Wrong username or password") -> Host:
    """Verify a password (or passcode) with a lockout after repeated failures. Same message either way."""
    wrong = HTTPException(401, wrong_msg)
    if host is None:
        verify_password(password, hash_password("timing-equaliser"))  # don't reveal which accounts exist
        raise wrong
    locked = _aware(host.locked_until)
    if locked and locked > _now():
        minutes = max(1, int((locked - _now()).total_seconds() // 60) + 1)
        raise HTTPException(429, f"Too many wrong tries. Try again in {minutes} min")
    if not verify_password(password, getattr(host, field)):
        host.failed_logins += 1
        if host.failed_logins >= MAX_FAILED_LOGINS:
            host.failed_logins = 0
            host.locked_until = _now() + timedelta(minutes=LOCK_MINUTES)
        db.commit()
        raise wrong
    if not host.active:
        raise HTTPException(403, "This account is switched off. Contact the Tufger admin")
    host.failed_logins = 0
    host.locked_until = None
    db.commit()
    return host


# ---------- network throttle ----------

def client_ip(forwarded_for: str | None, fallback: str | None) -> str:
    return ((forwarded_for or "").split(",")[0].strip() or fallback or "unknown")[:64]


def check_throttle(db: Session, ip: str) -> None:
    row = db.get(LoginThrottle, ip)
    if row and row.fails >= NETWORK_MAX_FAILS and _aware(row.window_start) > _now() - timedelta(minutes=NETWORK_WINDOW_MINUTES):
        raise HTTPException(429, f"Too many wrong tries from this network. Try again in {NETWORK_WINDOW_MINUTES} min")


def note_login(db: Session, ip: str, success: bool) -> None:
    row = db.get(LoginThrottle, ip)
    if success:
        if row:
            db.delete(row)
            db.commit()
        return
    if row is None or _aware(row.window_start) <= _now() - timedelta(minutes=NETWORK_WINDOW_MINUTES):
        row = row or LoginThrottle(ip=ip)
        row.fails, row.window_start = 0, _now()
        db.add(row)
    row.fails += 1
    db.commit()


# ---------- Tufger key (second lock for Dugout and Scorebook) ----------

def _key_ok(db: Session, key: str) -> bool:
    config = db.get(SiteConfig, 1)
    if config and config.vault_key_hash:
        return verify_password(key, config.vault_key_hash)
    env_key = settings.tufger_key
    return bool(env_key) and hmac.compare_digest(key.encode(), env_key.encode())


def confirm_identity(db: Session, host: Host, secret: str | None) -> None:
    """Sensitive steps need the account's own password/passcode, or the Tufger key as a backup."""
    if secret and (
        verify_password(secret, host.password_hash)
        or (host.passcode_hash and verify_password(secret, host.passcode_hash))
        or _key_ok(db, secret)
    ):
        return
    raise HTTPException(400, "Confirm with your password (or passcode), or the Tufger key")


def require_key(
    x_tufger_key: str = Header(default=""),
    host: Host = Depends(require_premium),
    db: Session = Depends(get_db),
) -> Host:
    """Opens Dugout and Scorebook: the host's own vault password, or the Tufger key as a backup."""
    if x_tufger_key and host.vault_hash and verify_password(x_tufger_key, host.vault_hash):
        return host
    if x_tufger_key and _key_ok(db, x_tufger_key):
        return host
    raise HTTPException(403, "Wrong password")
