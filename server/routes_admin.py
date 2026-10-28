from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

import schemas
from auth import check_passcode, issue_token, require_admin
from db import get_db
from models import Booking, Entry, Ground, Player, utcnow
from roster import parse_sheet
from services import (
    booking_detail,
    booking_summary,
    get_app_settings,
    log,
    resolve_player,
)
from split import split_amount

auth_router = APIRouter(prefix="/auth", tags=["auth"])
router = APIRouter(dependencies=[Depends(require_admin)])

BOOKING_LOAD = (
    selectinload(Booking.entries).selectinload(Entry.player),
    selectinload(Booking.events),
    selectinload(Booking.ground),
)


@auth_router.post("/login")
def login(body: schemas.LoginIn):
    if not check_passcode(body.passcode):
        raise HTTPException(401, "Wrong passcode")
    return {"token": issue_token()}


@router.get("/auth/me")
def me():
    return {"ok": True}


# ---------- settings ----------

@router.get("/settings", response_model=schemas.SettingsIO)
def read_settings(db: Session = Depends(get_db)):
    return get_app_settings(db)


@router.put("/settings", response_model=schemas.SettingsIO)
def write_settings(body: schemas.SettingsIO, db: Session = Depends(get_db)):
    row = get_app_settings(db)
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return row


# ---------- grounds ----------

@router.get("/grounds", response_model=list[schemas.GroundOut])
def list_grounds(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Booking.ground_id, func.count()).group_by(Booking.ground_id)).all())
    grounds = db.scalars(select(Ground).order_by(Ground.name)).all()
    return [
        schemas.GroundOut(
            id=g.id, name=g.name, area=g.area, sport=g.sport,
            price_per_hour=g.price_per_hour, weekend_price_per_hour=g.weekend_price_per_hour,
            bookings=counts.get(g.id, 0),
        )
        for g in grounds
    ]


@router.post("/grounds", response_model=schemas.GroundOut)
def create_ground(body: schemas.GroundIn, db: Session = Depends(get_db)):
    ground = Ground(**body.model_dump())
    db.add(ground)
    db.commit()
    return schemas.GroundOut(id=ground.id, **body.model_dump())


@router.put("/grounds/{ground_id}", response_model=schemas.GroundOut)
def update_ground(ground_id: int, body: schemas.GroundIn, db: Session = Depends(get_db)):
    ground = db.get(Ground, ground_id) or _404("Ground")
    for key, value in body.model_dump().items():
        setattr(ground, key, value)
    db.commit()
    return schemas.GroundOut(id=ground.id, **body.model_dump())


@router.delete("/grounds/{ground_id}")
def delete_ground(ground_id: int, db: Session = Depends(get_db)):
    ground = db.get(Ground, ground_id) or _404("Ground")
    db.delete(ground)
    db.commit()
    return {"ok": True}


# ---------- roster import ----------

@router.post("/roster/upload")
async def upload_roster(file: UploadFile = File(...)):
    name = (file.filename or "").lower()
    if not name.endswith((".xlsx", ".xlsm", ".csv", ".txt")):
        raise HTTPException(400, "Upload an .xlsx or .csv file")
    content = await file.read()
    if len(content) > 2_000_000:
        raise HTTPException(400, "File too large (max 2 MB)")
    try:
        players = parse_sheet(name, content)
    except Exception:
        raise HTTPException(400, "Couldn't read that file. Is it a valid Excel/CSV?")
    return {"players": players}


# ---------- bookings ----------

@router.get("/bookings", response_model=list[schemas.BookingSummary])
def list_bookings(archived: bool = False, db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Booking)
        .where(Booking.archived == archived)
        .options(selectinload(Booking.entries), selectinload(Booking.ground))
        .order_by(Booking.play_date.desc(), Booking.start_time.desc())
    ).all()
    return [booking_summary(b) for b in rows]


@router.post("/bookings", response_model=schemas.BookingDetail)
def create_booking(body: schemas.BookingIn, db: Session = Depends(get_db)):
    ground = db.get(Ground, body.ground_id) or _404("Ground")
    settings = get_app_settings(db)

    roster = list(body.players)
    if body.include_organizer:
        roster.insert(0, schemas.RosterPlayer(name=settings.organizer_name or "Organiser"))
    base_amount = round(body.rate_per_hour * body.duration_min / 60)
    total_amount = base_amount - body.discount
    if total_amount <= 0:
        raise HTTPException(400, "The discount can't be more than the ground charges")
    amounts = split_amount(total_amount, [p.amount for p in roster], body.round_to)

    booking = Booking(
        ground_id=ground.id,
        ground_name=ground.name,
        sport=ground.sport,
        play_date=body.play_date,
        start_time=body.start_time,
        duration_min=body.duration_min,
        rate_per_hour=body.rate_per_hour,
        is_weekend=body.is_weekend,
        base_amount=base_amount,
        discount=body.discount,
        discount_note=body.discount_note.strip(),
        total_amount=total_amount,
        round_to=body.round_to,
        notes=body.notes,
    )
    db.add(booking)
    db.flush()

    seen: set[int] = set()
    for position, (p, amount) in enumerate(zip(roster, amounts)):
        player = resolve_player(db, p.name, p.phone)
        if player.id in seen:
            continue
        seen.add(player.id)
        is_org = body.include_organizer and position == 0
        db.add(Entry(
            booking_id=booking.id, player_id=player.id, position=position, amount=amount,
            is_organizer=is_org, status="paid" if is_org else "pending",
            paid_at=utcnow() if is_org else None,
        ))
    rate = f"{'weekend' if body.is_weekend else 'weekday'} rate ₹{body.rate_per_hour}/hr"
    off = f", ₹{body.discount} discount" if body.discount else ""
    log(db, booking, "created", f"Booking created with {len(seen)} players, ₹{total_amount} total ({rate}{off})")
    db.commit()
    return _load(db, booking.id)


@router.get("/bookings/{booking_id}", response_model=schemas.BookingDetail)
def get_booking(booking_id: int, db: Session = Depends(get_db)):
    return _load(db, booking_id)


@router.patch("/bookings/{booking_id}", response_model=schemas.BookingDetail)
def patch_booking(booking_id: int, body: schemas.BookingPatch, db: Session = Depends(get_db)):
    booking = db.get(Booking, booking_id) or _404("Booking")
    changes = body.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(booking, key, value)
    if "archived" in changes:
        log(db, booking, "archived", "Booking archived" if body.archived else "Booking restored")
    elif changes:
        log(db, booking, "edited", "Booking details updated")
    db.commit()
    return _load(db, booking_id)


@router.delete("/bookings/{booking_id}")
def delete_booking(booking_id: int, db: Session = Depends(get_db)):
    booking = db.get(Booking, booking_id) or _404("Booking")
    db.delete(booking)
    db.commit()
    return {"ok": True}


@router.post("/bookings/{booking_id}/resplit", response_model=schemas.BookingDetail)
def resplit(booking_id: int, db: Session = Depends(get_db)):
    booking = _load_model(db, booking_id)
    _resplit(booking)
    log(db, booking, "edited", f"Re-split ₹{booking.total_amount} across {len(booking.entries)} players")
    db.commit()
    return _load(db, booking_id)


@router.post("/bookings/{booking_id}/players", response_model=schemas.BookingDetail)
def add_players(booking_id: int, body: schemas.AddPlayersIn, db: Session = Depends(get_db)):
    booking = _load_model(db, booking_id)
    existing = {e.player_id for e in booking.entries}
    position = max((e.position for e in booking.entries), default=-1) + 1
    added = []
    for p in body.players:
        player = resolve_player(db, p.name, p.phone)
        if player.id in existing:
            continue
        existing.add(player.id)
        entry = Entry(
            booking_id=booking.id, player_id=player.id, position=position, amount=p.amount or 0, status="pending"
        )
        booking.entries.append(entry)
        position += 1
        added.append(player.name)
    if body.resplit:
        _resplit(booking)
    if added:
        log(db, booking, "edited", f"Added {', '.join(added)}")
    db.commit()
    return _load(db, booking_id)


@router.delete("/bookings/{booking_id}/entries/{entry_id}", response_model=schemas.BookingDetail)
def remove_entry(booking_id: int, entry_id: int, resplit: bool = True, db: Session = Depends(get_db)):
    booking = _load_model(db, booking_id)
    entry = _entry(booking, entry_id)
    booking.entries.remove(entry)
    if resplit and booking.entries:
        _resplit(booking)
    log(db, booking, "edited", f"Removed {entry.player.name}")
    db.commit()
    return _load(db, booking_id)


@router.post("/bookings/{booking_id}/entries/{entry_id}/status", response_model=schemas.BookingDetail)
def set_entry_status(booking_id: int, entry_id: int, body: schemas.EntryStatusIn, db: Session = Depends(get_db)):
    booking = _load_model(db, booking_id)
    entry = _entry(booking, entry_id)
    previous = entry.status
    entry.status = body.status
    if body.status == "paid":
        entry.paid_at = entry.paid_at or utcnow()
        verb = "confirmed" if previous == "claimed" else "marked paid"
        log(db, booking, "paid", f"{entry.player.name} {verb} · ₹{entry.amount}")
    elif body.status == "pending":
        entry.paid_at = None
        entry.claimed_at = None
        entry.utr = ""
        log(db, booking, "reset", f"{entry.player.name} moved back to pending")
    db.commit()
    return _load(db, booking_id)


@router.put("/bookings/{booking_id}/entries/{entry_id}/amount", response_model=schemas.BookingDetail)
def set_entry_amount(booking_id: int, entry_id: int, body: schemas.EntryAmountIn, db: Session = Depends(get_db)):
    booking = _load_model(db, booking_id)
    entry = _entry(booking, entry_id)
    entry.amount = body.amount
    log(db, booking, "edited", f"{entry.player.name}'s share set to ₹{body.amount}")
    db.commit()
    return _load(db, booking_id)


@router.post("/bookings/{booking_id}/entries/{entry_id}/nudge", response_model=schemas.BookingDetail)
def nudge(booking_id: int, entry_id: int, db: Session = Depends(get_db)):
    booking = _load_model(db, booking_id)
    entry = _entry(booking, entry_id)
    entry.nudges += 1
    entry.last_nudged_at = utcnow()
    db.commit()
    return _load(db, booking_id)


# ---------- dashboard ----------

@router.get("/dashboard", response_model=schemas.DashboardOut)
def dashboard(db: Session = Depends(get_db)):
    bookings = db.scalars(
        select(Booking).options(selectinload(Booking.entries), selectinload(Booking.ground))
    ).all()
    active = [b for b in bookings if not b.archived]
    upcoming = sorted(
        (b for b in active if b.play_date >= date.today()),
        key=lambda b: (b.play_date, b.start_time),
    )
    all_entries = [e for b in bookings for e in b.entries if not e.is_organizer]
    return schemas.DashboardOut(
        active_bookings=len(active),
        to_collect=sum(e.amount for b in active for e in b.entries if e.status != "paid"),
        collected_all_time=sum(e.amount for e in all_entries if e.status == "paid"),
        awaiting_confirmation=sum(1 for b in active for e in b.entries if e.status == "claimed"),
        players=db.scalar(select(func.count()).select_from(Player)) or 0,
        next_game=booking_summary(upcoming[0]) if upcoming else None,
    )


# ---------- helpers ----------

def _404(what: str):
    raise HTTPException(404, f"{what} not found")


def _load_model(db: Session, booking_id: int) -> Booking:
    booking = db.scalar(select(Booking).where(Booking.id == booking_id).options(*BOOKING_LOAD))
    return booking or _404("Booking")


def _load(db: Session, booking_id: int) -> schemas.BookingDetail:
    db.expire_all()
    return booking_detail(_load_model(db, booking_id))


def _entry(booking: Booking, entry_id: int) -> Entry:
    entry = next((e for e in booking.entries if e.id == entry_id), None)
    return entry or _404("Player entry")


def _resplit(booking: Booking) -> None:
    # Shares already paid (or claimed) are locked; the rest of the total is split among unpaid players.
    fixed = [e.amount if e.status != "pending" else None for e in booking.entries]
    amounts = split_amount(booking.total_amount, fixed, booking.round_to)
    for entry, amount in zip(booking.entries, amounts):
        entry.amount = amount
