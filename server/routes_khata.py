"""Khata: every player's running account (games charged, payments, extra dues),
personal bill links, and an Excel backup."""

import io
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from openpyxl import Workbook
from openpyxl.styles import Font
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

import schemas
from auth import require_admin
from db import get_db
from models import Entry, LedgerTxn, Player, new_slug, utcnow
from roster import normalize_phone
from services import get_app_settings, log, pay_rating

router = APIRouter(prefix="/khata", tags=["khata"], dependencies=[Depends(require_admin)])
public_router = APIRouter(prefix="/public/bill", tags=["public"])

PLAYER_LOAD = (
    selectinload(Player.entries).selectinload(Entry.booking),
    selectinload(Player.txns),
)


def _utc(dt: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes, Postgres aware ones: compare them as naive UTC."""
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def _games(p: Player) -> list[Entry]:
    return [e for e in p.entries if not e.is_organizer]


def _is_organizer_only(p: Player) -> bool:
    return bool(p.entries) and not _games(p) and not p.txns


def _extra_due(p: Player) -> int:
    return sum(t.amount if t.kind == "due" else -t.amount for t in p.txns)


def _row(p: Player) -> schemas.KhataRow:
    games = _games(p)
    charged = sum(e.amount for e in games) + sum(t.amount for t in p.txns if t.kind == "due")
    paid = sum(e.amount for e in games if e.status == "paid") + sum(t.amount for t in p.txns if t.kind == "got")
    pending = sum(e.amount for e in games if e.status == "pending")
    review = sum(e.amount for e in games if e.status == "claimed")

    delays = []
    for e in games:
        done = _utc(e.claimed_at or e.paid_at)
        if e.status != "pending" and done:
            delays.append(max((done - _utc(e.booking.created_at)).total_seconds() / 3600, 0))
    avg = round(sum(delays) / len(delays), 1) if delays else None

    moments = [_utc(e.booking.created_at) for e in games]
    moments += [_utc(e.paid_at) for e in games if e.paid_at] + [_utc(e.claimed_at) for e in games if e.claimed_at]
    moments += [_utc(t.created_at) for t in p.txns]
    moments = [m for m in moments if m]

    return schemas.KhataRow(
        id=p.id,
        name=p.name,
        phone=p.phone,
        archived=p.archived,
        games=len(games),
        charged=charged,
        paid=paid,
        balance=charged - paid,
        bill_due=max(pending + _extra_due(p), 0),
        under_review=review,
        avg_pay_hours=avg,
        rating=pay_rating(avg, len(games)),
        last_activity=max(moments) if moments else None,
        has_history=bool(p.entries or p.txns),
    )


def _history(p: Player) -> list[schemas.KhataItem]:
    items: list[tuple[datetime, int, schemas.KhataItem]] = []
    for e in _games(p):
        b = e.booking
        when = f"{b.play_date:%a %d %b} · {b.start_time:%I:%M %p}".replace(" 0", " ")
        items.append((_utc(b.created_at), 0, schemas.KhataItem(
            id=f"e{e.id}", kind="charge", at=_utc(b.created_at), amount=e.amount, title=b.ground_name,
            subtitle=f"Game on {when}", status=e.status, booking_id=b.id, balance_after=0,
        )))
        if e.status == "paid" and e.paid_at:
            items.append((_utc(e.paid_at), 1, schemas.KhataItem(
                id=f"p{e.id}", kind="paid", at=_utc(e.paid_at), amount=e.amount, title=f"Paid for {b.ground_name}",
                subtitle=f"Game on {when}" + (f" · ref {e.utr}" if e.utr else ""), booking_id=b.id, balance_after=0,
            )))
    for t in p.txns:
        title = t.note or ("Payment received" if t.kind == "got" else "Due added")
        items.append((_utc(t.created_at), 2, schemas.KhataItem(
            id=f"t{t.id}", kind=t.kind, at=_utc(t.created_at), amount=t.amount, title=title,
            subtitle="Added in khata", txn_id=t.id, balance_after=0,
        )))

    items.sort(key=lambda x: (x[0], x[1]))
    running = 0
    for _, _, item in items:
        running += item.amount if item.kind in ("charge", "due") else -item.amount
        item.balance_after = running
    return [item for _, _, item in reversed(items)]


def _ensure_slug(db: Session, p: Player) -> str:
    if not p.pay_slug:
        p.pay_slug = new_slug()
        db.commit()
    return p.pay_slug


def _load_player(db: Session, player_id: int) -> Player:
    p = db.scalar(select(Player).where(Player.id == player_id).options(*PLAYER_LOAD))
    if p is None:
        raise HTTPException(404, "Player not found")
    return p


def _detail(db: Session, player_id: int) -> schemas.KhataDetail:
    db.expire_all()
    p = _load_player(db, player_id)
    slug = _ensure_slug(db, p)
    return schemas.KhataDetail(**_row(p).model_dump(), pay_slug=slug, history=_history(p))


def _clean_phone(raw: str | None) -> str | None:
    if raw is None or not raw.strip():
        return None
    phone = normalize_phone(raw)
    if not phone:
        raise HTTPException(400, "Enter a 10-digit mobile number")
    return phone


def _check_phone_free(db: Session, phone: str | None, player_id: int | None = None) -> None:
    if not phone:
        return
    other = db.scalar(select(Player).where(Player.phone == phone))
    if other and other.id != player_id:
        raise HTTPException(409, f"That number is already saved for {other.name}")


def _bill_lines(p: Player) -> list[schemas.BillLine]:
    games = sorted(
        (e for e in _games(p) if e.status != "paid"),
        key=lambda e: (e.booking.play_date, e.booking.start_time),
    )
    return [
        schemas.BillLine(
            booking_id=e.booking.id, ground_name=e.booking.ground_name, play_date=e.booking.play_date,
            start_time=e.booking.start_time, amount=e.amount, status=e.status,
        )
        for e in games
    ]


# ---------- organiser endpoints ----------

@router.get("", response_model=list[schemas.KhataRow])
def khata(db: Session = Depends(get_db)):
    players = db.scalars(select(Player).options(*PLAYER_LOAD)).all()
    rows = [_row(p) for p in players if not _is_organizer_only(p)]
    rows.sort(key=lambda r: (-r.balance, r.name.lower()))
    return rows


@router.post("/players", response_model=schemas.KhataDetail)
def add_player(body: schemas.KhataPlayerIn, db: Session = Depends(get_db)):
    phone = _clean_phone(body.phone)
    _check_phone_free(db, phone)
    p = Player(name=" ".join(body.name.split()), phone=phone)
    db.add(p)
    db.commit()
    return _detail(db, p.id)


@router.get("/players/{player_id}", response_model=schemas.KhataDetail)
def player_detail(player_id: int, db: Session = Depends(get_db)):
    return _detail(db, player_id)


@router.patch("/players/{player_id}", response_model=schemas.KhataDetail)
def update_player(player_id: int, body: schemas.KhataPlayerPatch, db: Session = Depends(get_db)):
    p = _load_player(db, player_id)
    changes = body.model_dump(exclude_unset=True)
    if "phone" in changes:
        phone = _clean_phone(body.phone)
        _check_phone_free(db, phone, p.id)
        p.phone = phone
    if body.name is not None:
        p.name = " ".join(body.name.split())
    if body.archived is not None:
        p.archived = body.archived
    db.commit()
    return _detail(db, player_id)


@router.delete("/players/{player_id}")
def delete_player(player_id: int, db: Session = Depends(get_db)):
    p = _load_player(db, player_id)
    if p.entries or p.txns:
        raise HTTPException(409, f"{p.name} has history. Hide them instead so the record stays")
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/players/{player_id}/payment", response_model=schemas.KhataDetail)
def record_payment(player_id: int, body: schemas.KhataMoneyIn, db: Session = Depends(get_db)):
    p = _load_player(db, player_id)
    remaining = body.amount
    if body.settle:
        open_games = sorted(
            (e for e in _games(p) if e.status != "paid"),
            key=lambda e: (e.booking.play_date, e.booking.start_time),
        )
        for e in open_games:
            if e.amount > remaining:
                break
            e.status = "paid"
            e.paid_at = utcnow()
            remaining -= e.amount
            log(db, e.booking, "paid", f"{p.name} paid ₹{e.amount} (recorded in khata)")
    if remaining > 0:
        note = body.note.strip() or ("Payment received" if remaining == body.amount else "Part payment / advance")
        db.add(LedgerTxn(player_id=p.id, kind="got", amount=remaining, note=note))
    db.commit()
    return _detail(db, player_id)


@router.post("/players/{player_id}/due", response_model=schemas.KhataDetail)
def add_due(player_id: int, body: schemas.KhataMoneyIn, db: Session = Depends(get_db)):
    p = _load_player(db, player_id)
    db.add(LedgerTxn(player_id=p.id, kind="due", amount=body.amount, note=body.note.strip() or "Due added"))
    db.commit()
    return _detail(db, player_id)


@router.delete("/txns/{txn_id}", response_model=schemas.KhataDetail)
def delete_txn(txn_id: int, db: Session = Depends(get_db)):
    t = db.get(LedgerTxn, txn_id)
    if t is None:
        raise HTTPException(404, "Entry not found")
    player_id = t.player_id
    db.delete(t)
    db.commit()
    return _detail(db, player_id)


@router.get("/bills", response_model=list[schemas.BillOut])
def bills(db: Session = Depends(get_db)):
    """Everyone whose bill link would ask for money, with the lines to put in the message."""
    out = []
    for p in db.scalars(select(Player).options(*PLAYER_LOAD)).all():
        if p.archived:
            continue
        row = _row(p)
        if row.bill_due <= 0:
            continue
        out.append(schemas.BillOut(
            player_id=p.id, name=p.name, phone=p.phone, pay_slug=_ensure_slug(db, p),
            lines=_bill_lines(p), extra_due=_extra_due(p), due=row.bill_due, under_review=row.under_review,
        ))
    out.sort(key=lambda b: (-b.due, b.name.lower()))
    return out


@router.get("/export")
def export(db: Session = Depends(get_db)):
    players = [p for p in db.scalars(select(Player).options(*PLAYER_LOAD)).all() if not _is_organizer_only(p)]
    wb = Workbook()
    ws = wb.active
    ws.title = "Players"
    ws.append(["Name", "Phone", "Games", "Charged (₹)", "Paid (₹)", "Balance (₹)", "Hidden"])
    for p in sorted(players, key=lambda x: x.name.lower()):
        r = _row(p)
        ws.append([r.name, r.phone or "", r.games, r.charged, r.paid, r.balance, "yes" if r.archived else ""])

    hist = wb.create_sheet("History")
    hist.append(["Date (UTC)", "Player", "Phone", "Type", "Details", "Amount (₹)", "Status", "Balance after (₹)"])
    labels = {"charge": "Game", "paid": "Paid", "got": "Got payment", "due": "Due added"}
    rows = []
    for p in players:
        for item in _history(p):
            rows.append([item.at, p.name, p.phone or "", labels[item.kind], f"{item.title} · {item.subtitle}",
                         item.amount, item.status or "", item.balance_after])
    for row in sorted(rows, key=lambda r: (r[0], r[1])):
        hist.append(row)

    for sheet in (ws, hist):
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        for col in sheet.columns:
            sheet.column_dimensions[col[0].column_letter].width = max(12, min(48, max(len(str(c.value or "")) for c in col) + 2))

    buf = io.BytesIO()
    wb.save(buf)
    filename = f"tufger-khata-{date.today():%Y-%m-%d}.xlsx"
    return Response(
        buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------- player's personal bill link (no login) ----------

def _bill_player(db: Session, slug: str) -> Player:
    p = db.scalar(select(Player).where(Player.pay_slug == slug).options(*PLAYER_LOAD))
    if p is None:
        raise HTTPException(404, "This bill link doesn't exist")
    return p


def _public_bill(db: Session, p: Player) -> schemas.PublicBill:
    s = get_app_settings(db)
    row = _row(p)
    return schemas.PublicBill(
        name=p.name, organizer_name=s.organizer_name, upi_id=s.upi_id, payee_name=s.payee_name or s.organizer_name,
        lines=_bill_lines(p), extra_due=_extra_due(p), due=row.bill_due, under_review=row.under_review,
    )


@public_router.get("/{slug}", response_model=schemas.PublicBill)
def view_bill(slug: str, db: Session = Depends(get_db)):
    return _public_bill(db, _bill_player(db, slug))


@public_router.post("/{slug}/claim", response_model=schemas.PublicBill)
def claim_bill(slug: str, body: schemas.BillClaimIn, db: Session = Depends(get_db)):
    p = _bill_player(db, slug)
    ref = f" (ref {body.utr.strip()})" if body.utr.strip() else ""
    for e in _games(p):
        if e.status == "pending":
            e.status = "claimed"
            e.claimed_at = utcnow()
            e.utr = body.utr.strip()
            log(db, e.booking, "claimed", f"{p.name} says they paid ₹{e.amount} from their bill{ref}")
    db.commit()
    db.expire_all()
    return _public_bill(db, _bill_player(db, slug))
