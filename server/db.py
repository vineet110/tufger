from collections.abc import Iterator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config import get_settings

settings = get_settings()
_url = settings.sqlalchemy_url
_is_sqlite = _url.startswith("sqlite")

engine = create_engine(
    _url,
    # Neon suspends idle computes; pre-ping drops dead connections instead of erroring.
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# Columns added after the first release. create_all() only creates missing tables,
# so add new columns to existing tables here.
_ADDED_COLUMNS = {
    "grounds": {"weekend_price_per_hour": "INTEGER"},
    "bookings": {
        "rate_per_hour": "INTEGER NOT NULL DEFAULT 0",
        "is_weekend": "BOOLEAN NOT NULL DEFAULT {false}",
        "base_amount": "INTEGER NOT NULL DEFAULT 0",
        "discount": "INTEGER NOT NULL DEFAULT 0",
        "discount_note": "VARCHAR(120) NOT NULL DEFAULT ''",
    },
    "players": {
        "archived": "BOOLEAN NOT NULL DEFAULT {false}",
        "pay_slug": "VARCHAR(16)",
    },
}
_ADDED_INDEXES = ["CREATE UNIQUE INDEX IF NOT EXISTS ix_players_pay_slug ON players (pay_slug)"]


def migrate() -> None:
    existing = {t: {c["name"] for c in inspect(engine).get_columns(t)} for t in _ADDED_COLUMNS}
    false = "0" if _is_sqlite else "false"
    if_not_exists = "" if _is_sqlite else "IF NOT EXISTS "
    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            for name, ddl in columns.items():
                if name not in existing[table]:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {if_not_exists}{name} {ddl.format(false=false)}"))
        for ddl in _ADDED_INDEXES:
            conn.execute(text(ddl))


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
