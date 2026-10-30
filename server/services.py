from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

import schemas
from models import AppSettings, Booking, Entry, Event, Player
from roster import clean_name, mobile_phone, name_key, normalize_phone


def get_app_settings(db: Session, host_id: int) -> AppSettings:
    """A host's own settings row, created on first use."""
    row = db.scalar(select(AppSettings).where(AppSettings.host_id == host_id))
    if row is None:
        from models import Host  # local import: Host lives next to AppSettings

        host = db.get(Host, host_id)
        row = AppSettings(host_id=host_id, organizer_name=host.display_name if host else "Organiser")
        db.add(row)
        db.commit()
    return row


def log(db: Session, booking: Booking, kind: str, message: str) -> None:
    db.add(Event(booking_id=booking.id, kind=kind, message=message))


class NameTaken(Exception):
    """The name belongs to a saved player with a different number."""


def clean_phone(raw: str | None) -> str | None:
    if raw is None or not raw.strip():
        return None
    phone = mobile_phone(raw)
    if not phone:
        raise HTTPException(400, "Enter a 10-digit mobile number")
    return phone


def check_phone_free(db: Session, host_id: int, phone: str | None, player_id: int | None = None) -> None:
    if not phone:
        return
    other = db.scalar(select(Player).where(Player.host_id == host_id, Player.phone == phone))
    if other and other.id != player_id:
        raise HTTPException(409, f"That number is already saved for {other.name}")


def check_name_free(db: Session, host_id: int, name: str, player_id: int | None = None) -> None:
    other = db.scalar(select(Player).where(Player.host_id == host_id, Player.name_key == name_key(name)))
    if other and other.id != player_id:
        hidden = " (hidden)" if other.archived else ""
        raise HTTPException(409, f"{other.name}{hidden} is already saved. Use a different name, like {other.name} K")


def resolve_player(db: Session, host_id: int, name: str, phone: str | None, keep_name: bool = False) -> Player:
    """Find one of this host's players by phone, then by name, else create one.

    The phone decides who someone is. A name on its own means the saved player with that name, but a
    name with a different number is someone else, so it raises NameTaken rather than bill the wrong person.
    keep_name skips the name clean-up, for Team Sheet names like "Ganesh +1" or "Rishi (tt)".
    """
    phone = normalize_phone(phone)
    name = " ".join(name.split())[:120] if keep_name else (clean_name(name) or name.strip())
    if phone:
        player = db.scalar(select(Player).where(Player.host_id == host_id, Player.phone == phone))
        if player:
            return player
    elif not name:
        raise HTTPException(400, "Every player needs a name or a number")
    made_up = phone and name in ("", f"Player {phone[-4:]}")  # no name given: two numbers can end alike
    name = f"Player {phone[-4:]}" if made_up else name
    named = db.scalar(select(Player).where(Player.host_id == host_id, Player.name_key == name_key(name)))
    if named and made_up and named.phone:
        named, name = None, f"Player {phone}"
    if named:
        if phone and named.phone:
            raise NameTaken(f"{named.name} (saved with …{named.phone[-4:]})")
        if phone:  # a known player who had no number yet
            named.phone = phone
            db.flush()
        return named
    player = Player(host_id=host_id, name=name, phone=phone)
    db.add(player)
    db.flush()
    return player


def resolve_roster(db: Session, host_id: int, rows: list, keep_name: bool = False) -> list[tuple[Player, object]]:
    """Every row's player, each player once. All name clashes are reported together, and nothing is saved."""
    resolved: dict[int, tuple[Player, object]] = {}
    clashes: list[str] = []
    for row in rows:
        try:
            player = resolve_player(db, host_id, row.name, row.phone, keep_name=keep_name)
        except NameTaken as clash:
            clashes.append(str(clash))
            continue
        resolved.setdefault(player.id, (player, row))
    if clashes:
        raise HTTPException(
            409, f"Name already taken: {', '.join(clashes)}. Use the saved number, or give this person a different name"
        )
    return list(resolved.values())


def tally(entries: list[Entry]) -> schemas.Tally:
    return schemas.Tally(
        target=sum(e.amount for e in entries),
        collected=sum(e.amount for e in entries if e.status == "paid"),
        claimed=sum(e.amount for e in entries if e.status == "claimed"),
        players=len(entries),
        paid_count=sum(1 for e in entries if e.status == "paid"),
        claimed_count=sum(1 for e in entries if e.status == "claimed"),
        pending_count=sum(1 for e in entries if e.status == "pending"),
    )


def booking_summary(b: Booking) -> schemas.BookingSummary:
    return schemas.BookingSummary(
        id=b.id,
        slug=b.slug,
        ground_name=b.ground_name,
        ground_area=b.ground.area if b.ground else "",
        sport=b.sport,
        play_date=b.play_date,
        start_time=b.start_time,
        duration_min=b.duration_min,
        total_amount=b.total_amount,
        rate_per_hour=b.rate_per_hour,
        is_weekend=b.is_weekend,
        base_amount=b.base_amount or b.total_amount + b.discount,
        discount=b.discount,
        discount_note=b.discount_note,
        archived=b.archived,
        created_at=b.created_at,
        tally=tally(b.entries),
    )


def entry_out(e: Entry) -> schemas.EntryOut:
    return schemas.EntryOut(
        id=e.id,
        player_id=e.player_id,
        name=e.player.name,
        phone=e.player.phone,
        amount=e.amount,
        is_organizer=e.is_organizer,
        status=e.status,
        utr=e.utr,
        claimed_at=e.claimed_at,
        paid_at=e.paid_at,
        nudges=e.nudges,
    )


def booking_detail(b: Booking) -> schemas.BookingDetail:
    return schemas.BookingDetail(
        **booking_summary(b).model_dump(),
        round_to=b.round_to,
        notes=b.notes,
        entries=[entry_out(e) for e in b.entries],
        events=[schemas.EventOut(kind=ev.kind, message=ev.message, created_at=ev.created_at) for ev in b.events[:50]],
    )


def pay_rating(avg_hours: float | None, games: int) -> str:
    if avg_hours is None:
        return "New" if games == 0 else "Yet to pay"
    if avg_hours <= 2:
        return "Lightning"
    if avg_hours <= 12:
        return "Quick"
    if avg_hours <= 48:
        return "Steady"
    return "Slow"
