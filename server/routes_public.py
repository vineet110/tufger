"""Endpoints players hit from the shared pay link: no login."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

import schemas
from db import get_db
from models import Booking, Entry, utcnow
from services import get_app_settings, log, tally

router = APIRouter(prefix="/public", tags=["public"])


def _booking(db: Session, slug: str) -> Booking:
    booking = db.scalar(
        select(Booking)
        .where(Booking.slug == slug)
        .options(selectinload(Booking.entries).selectinload(Entry.player), selectinload(Booking.ground))
    )
    if booking is None:
        raise HTTPException(404, "This pay link doesn't exist")
    return booking


def _public(db: Session, booking: Booking) -> schemas.PublicBooking:
    s = get_app_settings(db)
    return schemas.PublicBooking(
        slug=booking.slug,
        ground_name=booking.ground_name,
        ground_area=booking.ground.area if booking.ground else "",
        sport=booking.sport,
        play_date=booking.play_date,
        start_time=booking.start_time,
        duration_min=booking.duration_min,
        total_amount=booking.total_amount,
        base_amount=booking.base_amount or booking.total_amount + booking.discount,
        discount=booking.discount,
        notes=booking.notes,
        organizer_name=s.organizer_name,
        upi_id=s.upi_id,
        payee_name=s.payee_name or s.organizer_name,
        tally=tally(booking.entries),
        entries=[
            schemas.PublicEntry(id=e.id, name=e.player.name, amount=e.amount, status=e.status, is_organizer=e.is_organizer)
            for e in booking.entries
        ],
    )


@router.get("/b/{slug}", response_model=schemas.PublicBooking)
def view(slug: str, db: Session = Depends(get_db)):
    return _public(db, _booking(db, slug))


@router.post("/b/{slug}/claim", response_model=schemas.PublicBooking)
def claim(slug: str, body: schemas.ClaimIn, db: Session = Depends(get_db)):
    booking = _booking(db, slug)
    entry = next((e for e in booking.entries if e.id == body.entry_id), None)
    if entry is None:
        raise HTTPException(404, "Player not on this booking")
    if entry.status == "pending":
        entry.status = "claimed"
        entry.claimed_at = utcnow()
        entry.utr = body.utr.strip()
        ref = f" (ref {entry.utr})" if entry.utr else ""
        log(db, booking, "claimed", f"{entry.player.name} says they paid ₹{entry.amount}{ref}")
        db.commit()
    return _public(db, booking)
