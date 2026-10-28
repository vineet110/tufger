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
    "grounds": {"weekend_price_per_hour": "INTEGER", "host_id": "INTEGER"},
    "bookings": {
        "rate_per_hour": "INTEGER NOT NULL DEFAULT 0",
        "is_weekend": "BOOLEAN NOT NULL DEFAULT {false}",
        "base_amount": "INTEGER NOT NULL DEFAULT 0",
        "discount": "INTEGER NOT NULL DEFAULT 0",
        "discount_note": "VARCHAR(120) NOT NULL DEFAULT ''",
        "host_id": "INTEGER",
    },
    "players": {
        "archived": "BOOLEAN NOT NULL DEFAULT {false}",
        "pay_slug": "VARCHAR(16)",
        "host_id": "INTEGER",
    },
    "app_settings": {
        "host_id": "INTEGER",
        "house_refunds": "TEXT NOT NULL DEFAULT ''",
        "house_last_minute": "TEXT NOT NULL DEFAULT ''",
    },
}
_ADDED_INDEXES = [
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_players_pay_slug ON players (pay_slug)",
    "CREATE INDEX IF NOT EXISTS ix_grounds_host_id ON grounds (host_id)",
    "CREATE INDEX IF NOT EXISTS ix_bookings_host_id ON bookings (host_id)",
    "CREATE INDEX IF NOT EXISTS ix_players_host_id ON players (host_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_app_settings_host ON app_settings (host_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_players_host_phone ON players (host_id, phone)",
]


def migrate() -> None:
    existing = {t: {c["name"] for c in inspect(engine).get_columns(t)} for t in _ADDED_COLUMNS}
    false = "0" if _is_sqlite else "false"
    if_not_exists = "" if _is_sqlite else "IF NOT EXISTS "
    with engine.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            for name, ddl in columns.items():
                if name not in existing[table]:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {if_not_exists}{name} {ddl.format(false=false)}"))
        if not _is_sqlite:
            # phone numbers used to be unique site-wide; now they're unique per host
            conn.execute(text("ALTER TABLE players DROP CONSTRAINT IF EXISTS players_phone_key"))
            # app_settings.id used to be a fixed 1 with no auto-numbering; give it a sequence past existing rows
            conn.execute(text("CREATE SEQUENCE IF NOT EXISTS app_settings_id_seq OWNED BY app_settings.id"))
            conn.execute(text("ALTER TABLE app_settings ALTER COLUMN id SET DEFAULT nextval('app_settings_id_seq')"))
            conn.execute(text(
                "SELECT setval('app_settings_id_seq', GREATEST((SELECT COALESCE(MAX(id), 0) FROM app_settings), 1))"
            ))
        for ddl in _ADDED_INDEXES:
            conn.execute(text(ddl))


def adopt_orphans(host_id: int) -> None:
    """Data from before accounts existed belongs to the site admin."""
    with engine.begin() as conn:
        for table in ("grounds", "bookings", "players", "app_settings"):
            conn.execute(text(f"UPDATE {table} SET host_id = :h WHERE host_id IS NULL"), {"h": host_id})


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
