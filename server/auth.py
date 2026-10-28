import base64
import hashlib
import hmac
import time

from fastapi import Header, HTTPException, status

from config import get_settings

settings = get_settings()


def _sign(payload: str) -> str:
    return hmac.new(settings.secret_key.encode(), payload.encode(), hashlib.sha256).hexdigest()


def issue_token() -> str:
    expires = int(time.time()) + settings.token_ttl_days * 86400
    payload = f"admin:{expires}"
    return base64.urlsafe_b64encode(payload.encode()).decode() + "." + _sign(payload)


def check_passcode(passcode: str) -> bool:
    return hmac.compare_digest(passcode.encode(), settings.admin_passcode.encode())


def require_admin(authorization: str = Header(default="")) -> None:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Login required")
    if not authorization.startswith("Bearer "):
        raise unauthorized
    try:
        encoded, signature = authorization[7:].split(".", 1)
        payload = base64.urlsafe_b64decode(encoded.encode()).decode()
        role, expires = payload.split(":")
    except ValueError:
        raise unauthorized
    if role != "admin" or not hmac.compare_digest(signature, _sign(payload)):
        raise unauthorized
    if int(expires) < time.time():
        raise unauthorized


def require_key(x_tufger_key: str = Header(default="")) -> None:
    """Second lock for Dugout and Scorebook: the TUFGER_KEY sent as X-Tufger-Key."""
    key = settings.tufger_key
    if not key:
        raise HTTPException(503, "Dugout and Scorebook are switched off: set TUFGER_KEY on the server")
    if not hmac.compare_digest(x_tufger_key.encode(), key.encode()):
        raise HTTPException(403, "Wrong Tufger key")
