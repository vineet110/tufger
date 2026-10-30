"""The contact book: a host's saved players. Open to every host (names and numbers only, no money, so it doesn't
need the Scorebook password); bulk upload is premium. One name and one number can each be saved only once."""

from collections.abc import Callable

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

import schemas
from auth import current_host, require_premium
from db import get_db
from models import Entry, Host, LedgerTxn, Player
from roster import RosterError, clean_name, mobile_phone, name_key, read_contacts
from services import check_name_free, check_phone_free, clean_phone

router = APIRouter(prefix="/contacts", tags=["contacts"], dependencies=[Depends(current_host)])

MAX_UPLOAD_BYTES = 2_000_000
UPLOAD_TYPES = (".xlsx", ".xlsm", ".csv", ".txt", ".vcf")


async def read_upload(file: UploadFile, parse: Callable[[str, bytes], list[dict]]) -> list[dict]:
    name = (file.filename or "").lower()
    if not name.endswith(UPLOAD_TYPES):
        raise HTTPException(400, "Upload an .xlsx, .csv or .vcf file")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "File too large (max 2 MB)")
    try:
        return parse(name, content)
    except RosterError as problem:
        raise HTTPException(400, str(problem))
    except Exception:
        raise HTTPException(400, "Couldn't read that file. Is it a valid Excel/CSV?")


def _out(p: Player, games: int = 0, txns: int = 0) -> schemas.ContactOut:
    return schemas.ContactOut(id=p.id, name=p.name, phone=p.phone, archived=p.archived, games=games, has_history=bool(games or txns))


def _own(db: Session, host: Host, contact_id: int) -> Player:
    p = db.get(Player, contact_id)
    if p is None or p.host_id != host.id:
        raise HTTPException(404, "Contact not found")
    return p


def _counts(db: Session, contact_id: int) -> tuple[int, int]:
    games = db.scalar(select(func.count()).select_from(Entry).where(Entry.player_id == contact_id)) or 0
    txns = db.scalar(select(func.count()).select_from(LedgerTxn).where(LedgerTxn.player_id == contact_id)) or 0
    return games, txns


def _contact_name(raw: str) -> str:
    name = clean_name(raw)
    if not name:
        raise HTTPException(400, "Enter a name with at least one letter")
    return name


@router.get("", response_model=list[schemas.ContactOut])
def list_contacts(host: Host = Depends(current_host), db: Session = Depends(get_db)):
    games = dict(db.execute(
        select(Entry.player_id, func.count()).join(Player).where(Player.host_id == host.id).group_by(Entry.player_id)
    ).all())
    txns = dict(db.execute(
        select(LedgerTxn.player_id, func.count()).join(Player).where(Player.host_id == host.id).group_by(LedgerTxn.player_id)
    ).all())
    players = db.scalars(select(Player).where(Player.host_id == host.id).order_by(Player.name_key)).all()
    return [_out(p, games.get(p.id, 0), txns.get(p.id, 0)) for p in players]


@router.post("", response_model=schemas.ContactOut)
def add_contact(body: schemas.KhataPlayerIn, host: Host = Depends(current_host), db: Session = Depends(get_db)):
    name = _contact_name(body.name)
    phone = clean_phone(body.phone)
    check_name_free(db, host.id, name)
    check_phone_free(db, host.id, phone)
    p = Player(host_id=host.id, name=name, phone=phone)
    db.add(p)
    db.commit()
    return _out(p)


@router.post("/upload", response_model=schemas.ContactImportOut)
async def upload_contacts(
    dry_run: bool = True, file: UploadFile = File(...), host: Host = Depends(require_premium), db: Session = Depends(get_db)
):
    """Check a file (dry_run) or save it. Good rows are saved; the rest come back with the reason."""
    rows = await read_upload(file, read_contacts)
    if not rows:
        raise HTTPException(400, "No contacts found in that file")

    saved = db.scalars(select(Player).where(Player.host_id == host.id)).all()
    names = {p.name_key: p for p in saved}
    phones = {p.phone: p for p in saved if p.phone}
    file_names: dict[str, str | None] = {}  # rows earlier in this file: name key -> number
    file_phones: dict[str, str] = {}  # and number -> name
    new: list[Player] = []
    fills: list[tuple[Player, str]] = []
    skipped = 0
    rejected: list[schemas.ContactIssue] = []

    def reject(row: dict, name: str, reason: str) -> None:
        phone = "" if row["phone"] is None else str(row["phone"])[:40]
        rejected.append(schemas.ContactIssue(line=row["line"], name=name or str(row["name"])[:120], phone=phone, reason=reason))

    for row in rows:
        name = clean_name(row["name"])
        has_phone = str(row["phone"] if row["phone"] is not None else "").strip() != ""
        phone = mobile_phone(row["phone"]) if has_phone else None
        key = name_key(name)
        if not name:
            reject(row, "", "Name is missing")
        elif has_phone and not phone:
            reject(row, name, "Not a valid 10-digit mobile number")
        elif key in file_names:
            if phone is None or file_names[key] == phone:
                skipped += 1
            else:
                reject(row, name, "Same name twice in this file with different numbers")
        elif phone in phones or phone in file_phones:
            owner = phones[phone].name if phone in phones else file_phones[phone]
            if name_key(owner) == key:
                skipped += 1
            else:
                reject(row, name, f"Number already saved for {owner}")
        elif key in names and phone and names[key].phone:
            reject(row, name, f"Name already saved with a different number (…{names[key].phone[-4:]})")
        elif key in names and not phone:
            skipped += 1
        else:
            if key in names:  # saved without a number; the file supplies it
                fills.append((names[key], phone))
            else:
                new.append(Player(host_id=host.id, name=name, phone=phone))
            file_names[key] = phone
            if phone:
                file_phones[phone] = name

    if not dry_run:
        for player, phone in fills:
            player.phone = phone
        db.add_all(new)
        db.commit()
    return schemas.ContactImportOut(
        dry_run=dry_run, rows=len(rows), added=len(new), filled=len(fills), skipped=skipped, rejected=rejected
    )


@router.patch("/{contact_id}", response_model=schemas.ContactOut)
def update_contact(contact_id: int, body: schemas.KhataPlayerPatch, host: Host = Depends(current_host), db: Session = Depends(get_db)):
    p = _own(db, host, contact_id)
    # the form sends both fields, and a name from Dugout ("Ganesh +1") or an older number stays as it is
    if "phone" in body.model_fields_set and (body.phone or None) != p.phone:
        phone = clean_phone(body.phone)
        check_phone_free(db, host.id, phone, p.id)
        p.phone = phone
    if body.name is not None and body.name != p.name:
        name = _contact_name(body.name)
        check_name_free(db, host.id, name, p.id)
        p.name = name
    if body.archived is not None:
        p.archived = body.archived
    db.commit()
    return _out(p, *_counts(db, p.id))


@router.delete("/{contact_id}")
def delete_contact(contact_id: int, host: Host = Depends(current_host), db: Session = Depends(get_db)):
    p = _own(db, host, contact_id)
    if any(_counts(db, p.id)):
        raise HTTPException(409, f"{p.name} has history. Hide them instead so the record stays")
    db.delete(p)
    db.commit()
    return {"ok": True}
