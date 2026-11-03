"""Settings. Secrets come from env vars (.env locally, Vercel env in production); tunables from config.ini."""

import configparser
import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
INI_PATH = Path(__file__).resolve().parent / "config.ini"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    database_url: str = ""
    admin_passcode: str = "tufger"
    secret_key: str = "dev-secret-change-me"
    # Second key that unlocks Team Sheet; empty = Team Sheet disabled
    tufger_key: str = ""

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url.strip()
        if not url:
            return f"sqlite:///{BASE_DIR / 'tufger.db'}"
        # Neon hands out postgres:// or postgresql:// — point SQLAlchemy at psycopg 3.
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()


class Ini:
    """Reads server/config.ini. TUFGER_<SECTION>_<KEY> env vars win over the file; missing keys use the default."""

    def __init__(self, path: Path = INI_PATH):
        self._parser = configparser.ConfigParser(inline_comment_prefixes=(";", "#"))
        self._parser.read(path, encoding="utf-8")

    def get(self, section: str, key: str, default: str = "") -> str:
        env = os.environ.get(f"TUFGER_{section}_{key}".upper())
        if env is not None:
            return env.strip()
        return self._parser.get(section, key, fallback=default).strip()

    def int(self, section: str, key: str, default: int) -> int:
        try:
            return int(self.get(section, key, str(default)))
        except ValueError:
            return default

    def bool(self, section: str, key: str, default: bool) -> bool:
        return self.get(section, key, str(default)).lower() in ("1", "true", "yes", "on")

    def list(self, section: str, key: str) -> list[str]:
        return [x.strip() for x in self.get(section, key).split(",") if x.strip()]


@lru_cache
def ini() -> Ini:
    return Ini()
