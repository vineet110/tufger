"""Dugout: turn pasted WhatsApp game posts into bookings with per-player amounts.

Premium hosts only, and needs the Tufger key (see auth.require_key).
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import schemas
from auth import require_key
from db import get_db
from models import Booking, Entry, Ground, Host, utcnow
from services import log, resolve_roster


router = APIRouter(prefix="/teamsheet", tags=["dugout"], dependencies=[Depends(require_key)])


@router.post("/games", response_model=schemas.SheetGameOut)
def create_game(body: schemas.SheetGameIn, host: Host = Depends(require_key), db: Session = Depends(get_db)):
    squad = resolve_roster(db, host.id, body.players, keep_name=True)
    total = sum(p.amount for _, p in squad)
    if total <= 0:
        raise HTTPException(400, "Set an amount for the players first")

    ground = db.scalar(
        select(Ground).where(Ground.host_id == host.id, func.lower(Ground.name) == body.ground_name.strip().lower())
    )
    booking = Booking(
        host_id=host.id,
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

    for position, (player, p) in enumerate(squad):
        paid = p.paid or p.is_organizer
        db.add(Entry(
            booking_id=booking.id, player_id=player.id, position=position, amount=p.amount,
            is_organizer=p.is_organizer, status="paid" if paid else "pending",
            paid_at=utcnow() if paid else None,
        ))
    log(db, booking, "created", f"Created from Dugout with {len(squad)} players, ₹{total} total")
    db.commit()
    return schemas.SheetGameOut(id=booking.id, slug=booking.slug, total_amount=total, players=len(squad))
