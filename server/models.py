import secrets
from datetime import date, datetime, time, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, Time
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


class AppSettings(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    organizer_name: Mapped[str] = mapped_column(String(80), default="Organiser")
    upi_id: Mapped[str] = mapped_column(String(120), default="")
    payee_name: Mapped[str] = mapped_column(String(80), default="")
    reminder_template: Mapped[str] = mapped_column(Text, default=DEFAULT_REMINDER)


class Ground(Base):
    __tablename__ = "grounds"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    area: Mapped[str] = mapped_column(String(120), default="")
    sport: Mapped[str] = mapped_column(String(20), default="cricket")
    price_per_hour: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(15), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    entries: Mapped[list["Entry"]] = relationship(back_populates="player")


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(16), unique=True, index=True, default=new_slug)
    ground_id: Mapped[int | None] = mapped_column(ForeignKey("grounds.id", ondelete="SET NULL"))
    ground_name: Mapped[str] = mapped_column(String(120))  # snapshot, survives ground edits
    sport: Mapped[str] = mapped_column(String(20), default="cricket")
    play_date: Mapped[date] = mapped_column(Date)
    start_time: Mapped[time] = mapped_column(Time)
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    total_amount: Mapped[int] = mapped_column(Integer)
    round_to: Mapped[int] = mapped_column(Integer, default=1)
    notes: Mapped[str] = mapped_column(Text, default="")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    ground: Mapped[Ground | None] = relationship()
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
