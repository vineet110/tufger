"""Dugout: turn pasted WhatsApp game posts into bookings with per-player amounts.

Needs the organiser login *and* the TUFGER_KEY (see auth.require_key).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import schemas
from auth import require_admin, require_key
from db import get_db
from models import Booking, Entry, Ground, utcnow
from services import log, resolve_player


router = APIRouter(prefix="/teamsheet", tags=["teamsheet"], dependencies=[Depends(require_admin), Depends(require_key)])


@router.post("/games", response_model=schemas.SheetGameOut)
def create_game(body: schemas.SheetGameIn, db: Session = Depends(get_db)):
    total = sum(p.amount for p in body.players)
    if total <= 0:
        raise HTTPException(400, "Set an amount for the players first")

    ground = db.scalar(select(Ground).where(func.lower(Ground.name) == body.ground_name.strip().lower()))
    booking = Booking(
        ground_id=ground.id if ground else None,
        ground_name=ground.name if ground else body.ground_name.strip(),
        sport=body.sport,
        play_date=body.play_date,
        start_time=body.start_time,
        duration_min=body.duration_min,
        base_amount=total,
        total_amount=total,
        round_to=1,
        notes=body.message.strip(),
    )
    db.add(booking)
    db.flush()

    seen: set[int] = set()
    for position, p in enumerate(body.players):
        player = resolve_player(db, p.name, p.phone, keep_name=True)
        if player.id in seen:
            continue
        seen.add(player.id)
        paid = p.paid or p.is_organizer
        db.add(Entry(
            booking_id=booking.id, player_id=player.id, position=position, amount=p.amount,
            is_organizer=p.is_organizer, status="paid" if paid else "pending",
            paid_at=utcnow() if paid else None,
        ))
    log(db, booking, "created", f"Created from Dugout with {len(seen)} players, ₹{total} total")
    db.commit()
    return schemas.SheetGameOut(id=booking.id, slug=booking.slug, total_amount=total, players=len(seen))
