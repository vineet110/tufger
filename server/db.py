from collections.abc import Iterator

from sqlalchemy import Connection, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from config import get_settings
from roster import name_key

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
        "name_key": "VARCHAR(400)",
    },
    "hosts": {
        "passcode_hash": "VARCHAR(200)",
        "passcode_lookup": "VARCHAR(64)",
        "vault_hash": "VARCHAR(200)",
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
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_players_host_name ON players (host_id, name_key)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_hosts_passcode_lookup ON hosts (passcode_lookup)",
]


def _unique_player_names(conn: Connection) -> None:
    """Fill in name_key for older players. Names became unique per host, so a later twin becomes "Rahul 2".

    Twins are never merged: they may be two people, and each has their own money history.
    """
    if not conn.scalar(text("SELECT COUNT(*) FROM players WHERE name_key IS NULL")):
        return
    admin_id = conn.scalar(text("SELECT MIN(id) FROM hosts WHERE role = 'admin'"))  # owns the host-less rows, see adopt_orphans
    rows = conn.execute(text("SELECT id, host_id, name, name_key FROM players ORDER BY id")).all()
    owner = lambda row: row.host_id if row.host_id is not None else admin_id  # noqa: E731
    settled = {(owner(row), row.name_key) for row in rows if row.name_key is not None}
    # every name in use is off limits, so a new "Rahul 2" never pushes out a real Rahul 2
    in_use = settled | {(owner(row), name_key(row.name)) for row in rows}
    for row in rows:
        if row.name_key is not None:
            continue
        name, suffix = row.name, 1
        if (owner(row), name_key(name)) in settled:
            while (owner(row), name_key(name)) in in_use:
                suffix += 1
                name = f"{' '.join(row.name.split())[:112]} {suffix}"
        settled.add((owner(row), name_key(name)))
        in_use.add((owner(row), name_key(name)))
        conn.execute(
            text("UPDATE players SET name = :name, name_key = :key WHERE id = :id"),
            {"name": name, "key": name_key(name), "id": row.id},
        )


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
        _unique_player_names(conn)
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
