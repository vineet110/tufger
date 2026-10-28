from sqlalchemy import func, select
from sqlalchemy.orm import Session

import schemas
from models import AppSettings, Booking, Entry, Event, Player
from roster import clean_name, normalize_phone


def get_app_settings(db: Session) -> AppSettings:
    row = db.get(AppSettings, 1)
    if row is None:
        row = AppSettings(id=1)
        db.add(row)
        db.commit()
    return row


def log(db: Session, booking: Booking, kind: str, message: str) -> None:
    db.add(Event(booking_id=booking.id, kind=kind, message=message))


def resolve_player(db: Session, name: str, phone: str | None, keep_name: bool = False) -> Player:
    """Find a squad member by phone (or by a unique name), else create one.

    keep_name skips the name clean-up, for Team Sheet names like "Ganesh +1" or "Rishi (tt)".
    """
    phone = normalize_phone(phone)
    name = " ".join(name.split())[:120] if keep_name else (clean_name(name) or name.strip())
    if phone:
        player = db.scalar(select(Player).where(Player.phone == phone))
        if player:
            return player
        # a known player who had no number yet: attach this one instead of creating a twin
        unnumbered = db.scalars(
            select(Player).where(func.lower(Player.name) == name.lower(), Player.phone.is_(None))
        ).all()
        if len(unnumbered) == 1:
            unnumbered[0].phone = phone
            return unnumbered[0]
    else:
        matches = db.scalars(select(Player).where(func.lower(Player.name) == name.lower())).all()
        if len(matches) == 1:
            return matches[0]
    player = Player(name=name or "Player", phone=phone)
    db.add(player)
    db.flush()
    return player


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
