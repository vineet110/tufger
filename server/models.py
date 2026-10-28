import secrets
from datetime import date, datetime, time, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_slug() -> str:
    return secrets.token_urlsafe(6).replace("-", "x").replace("_", "z")


DEFAULT_REMINDER = (
    "Hey {name} 👋\n"
    "Your share for {ground} on {date} is *₹{amount}*.\n"
    "Pay here in 10 seconds: {link}\n"
    "Thanks! 🏏"
)


class Host(Base):
    """Someone who runs games on Tufger. role: admin (site owner) | premium | host."""

    __tablename__ = "hosts"
    __table_args__ = (Index("ux_hosts_passcode_lookup", "passcode_lookup", unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(30), unique=True, index=True)  # stored lowercase
    display_name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(200))
    # Pavilion passcode (admin + premium only). lookup = keyed HMAC so a passcode maps to exactly one account.
    passcode_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    passcode_lookup: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vault_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)  # own Dugout & Scorebook password
    role: Mapped[str] = mapped_column(String(10), default="host")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)  # bump to sign out every session
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LoginThrottle(Base):
    """Failed logins per network address, so passcodes can't be guessed in bulk."""

    __tablename__ = "login_throttle"

    ip: Mapped[str] = mapped_column(String(64), primary_key=True)
    fails: Mapped[int] = mapped_column(Integer, default=0)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SiteConfig(Base):
    """Site-wide switches the admin edits from Settings (single row, id=1)."""

    __tablename__ = "site_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    vault_key_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)  # None = use TUFGER_KEY env


class AppSettings(Base):
    """One row per host: their name, UPI, message template and house rules."""

    __tablename__ = "app_settings"
    __table_args__ = (Index("ux_app_settings_host", "host_id", unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True)
    host_id: Mapped[int | None] = mapped_column(ForeignKey("hosts.id", ondelete="CASCADE"), nullable=True)
    organizer_name: Mapped[str] = mapped_column(String(80), default="Organiser")
    upi_id: Mapped[str] = mapped_column(String(120), default="")
    payee_name: Mapped[str] = mapped_column(String(80), default="")
    reminder_template: Mapped[str] = mapped_column(Text, default=DEFAULT_REMINDER)
    house_refunds: Mapped[str] = mapped_column(Text, default="")  # one rule per line; "" = Tufger defaults
    house_last_minute: Mapped[str] = mapped_column(Text, default="")


class Ground(Base):
    __tablename__ = "grounds"

    id: Mapped[int] = mapped_column(primary_key=True)
    host_id: Mapped[int | None] = mapped_column(ForeignKey("hosts.id", ondelete="CASCADE"), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    area: Mapped[str] = mapped_column(String(120), default="")
    sport: Mapped[str] = mapped_column(String(20), default="cricket")
    price_per_hour: Mapped[int] = mapped_column(Integer, default=0)  # weekday rate
    weekend_price_per_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)  # None = same as weekday
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Player(Base):
    __tablename__ = "players"
    # the same person can play for two hosts, so a number is unique per host only
    __table_args__ = (Index("ux_players_host_phone", "host_id", "phone", unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True)
    host_id: Mapped[int | None] = mapped_column(ForeignKey("hosts.id", ondelete="CASCADE"), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(15), nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)  # hidden from the khata list
    pay_slug: Mapped[str | None] = mapped_column(String(16), unique=True, nullable=True)  # personal bill link
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    entries: Mapped[list["Entry"]] = relationship(back_populates="player")
    host: Mapped[Host | None] = relationship()
    txns: Mapped[list["LedgerTxn"]] = relationship(
        back_populates="player", cascade="all, delete-orphan", order_by="LedgerTxn.created_at"
    )


class LedgerTxn(Base):
    """A khata entry not tied to a game: money received ("got") or an extra amount owed ("due")."""

    __tablename__ = "ledger_txns"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(8))  # got | due
    amount: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    player: Mapped[Player] = relationship(back_populates="txns")


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    host_id: Mapped[int | None] = mapped_column(ForeignKey("hosts.id", ondelete="CASCADE"), index=True, nullable=True)
    slug: Mapped[str] = mapped_column(String(16), unique=True, index=True, default=new_slug)
    ground_id: Mapped[int | None] = mapped_column(ForeignKey("grounds.id", ondelete="SET NULL"))
    ground_name: Mapped[str] = mapped_column(String(120))  # snapshot, survives ground edits
    sport: Mapped[str] = mapped_column(String(20), default="cricket")
    play_date: Mapped[date] = mapped_column(Date)
    start_time: Mapped[time] = mapped_column(Time)
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    # how the ground amount was worked out: rate × duration − discount = total_amount
    rate_per_hour: Mapped[int] = mapped_column(Integer, default=0)
    is_weekend: Mapped[bool] = mapped_column(Boolean, default=False)
    base_amount: Mapped[int] = mapped_column(Integer, default=0)
    discount: Mapped[int] = mapped_column(Integer, default=0)
    discount_note: Mapped[str] = mapped_column(String(120), default="")
    total_amount: Mapped[int] = mapped_column(Integer)
    round_to: Mapped[int] = mapped_column(Integer, default=1)
    notes: Mapped[str] = mapped_column(Text, default="")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    ground: Mapped[Ground | None] = relationship()
    host: Mapped[Host | None] = relationship()
    entries: Mapped[list["Entry"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan", order_by="Entry.position"
    )
    events: Mapped[list["Event"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan", order_by="Event.created_at.desc()"
    )


class Entry(Base):
    """One player's share in one booking."""

    __tablename__ = "entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    amount: Mapped[int] = mapped_column(Integer)
    is_organizer: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(10), default="pending")  # pending | claimed | paid
    utr: Mapped[str] = mapped_column(String(40), default="")
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    nudges: Mapped[int] = mapped_column(Integer, default=0)
    last_nudged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    booking: Mapped[Booking] = relationship(back_populates="entries")
    player: Mapped[Player] = relationship(back_populates="entries")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    booking: Mapped[Booking] = relationship(back_populates="events")
