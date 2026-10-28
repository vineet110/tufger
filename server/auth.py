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
from models import Host, SiteConfig

settings = get_settings()

PBKDF2_ROUNDS = 200_000
MAX_FAILED_LOGINS = 5
LOCK_MINUTES = 10
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


def check_login(db: Session, host: Host | None, password: str) -> Host:
    """Verify a password with a lockout after repeated failures. Same message either way."""
    wrong = HTTPException(401, "Wrong username or password")
    if host is None:
        verify_password(password, hash_password("timing-equaliser"))  # don't reveal which usernames exist
        raise wrong
    locked = _aware(host.locked_until)
    if locked and locked > _now():
        minutes = max(1, int((locked - _now()).total_seconds() // 60) + 1)
        raise HTTPException(429, f"Too many wrong tries. Try again in {minutes} min")
    if not verify_password(password, host.password_hash):
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


# ---------- Tufger key (second lock for Dugout and Scorebook) ----------

def _key_ok(db: Session, key: str) -> bool:
    config = db.get(SiteConfig, 1)
    if config and config.vault_key_hash:
        return verify_password(key, config.vault_key_hash)
    env_key = settings.tufger_key
    return bool(env_key) and hmac.compare_digest(key.encode(), env_key.encode())


def require_key(
    x_tufger_key: str = Header(default=""),
    host: Host = Depends(require_premium),
    db: Session = Depends(get_db),
) -> Host:
    config = db.get(SiteConfig, 1)
    if not (config and config.vault_key_hash) and not settings.tufger_key:
        raise HTTPException(503, "Dugout and Scorebook are switched off: the admin needs to set a Tufger key")
    if not x_tufger_key or not _key_ok(db, x_tufger_key):
        raise HTTPException(403, "Wrong Tufger key")
    return host
