"""Turn an uploaded Excel / CSV sheet into a clean player list."""

import csv
import io
import re

from openpyxl import load_workbook

NAME_HINTS = ("name", "player", "naam")
PHONE_HINTS = ("phone", "mobile", "number", "contact", "whatsapp", "no.", "cell")


def normalize_phone(raw: object) -> str | None:
    if raw is None:
        return None
    if isinstance(raw, float):
        raw = str(int(raw))  # Excel stores 9876543210 as 9876543210.0
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if len(digits) == 10 else None


def clean_name(raw: object) -> str:
    text = re.sub(r"[^\w\s.'-]", " ", str(raw or ""), flags=re.UNICODE)
    text = re.sub(r"\d+", " ", text)
    return " ".join(text.split()).strip(" .-'").title()[:120]


def _read_rows(filename: str, content: bytes) -> list[list[object]]:
    if filename.lower().endswith((".xlsx", ".xlsm")):
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.worksheets[0]
        return [list(row) for row in ws.iter_rows(values_only=True)]
    text = content.decode("utf-8-sig", errors="ignore")
    return [list(row) for row in csv.reader(io.StringIO(text))]


def _find_columns(rows: list[list[object]]) -> tuple[int, int | None, int | None]:
    """Return (first_data_row, name_col, phone_col)."""
    for idx, row in enumerate(rows[:5]):
        labels = [str(c or "").strip().lower() for c in row]
        name_col = next((i for i, l in enumerate(labels) if any(h in l for h in NAME_HINTS)), None)
        phone_col = next((i for i, l in enumerate(labels) if any(h in l for h in PHONE_HINTS)), None)
        if name_col is not None or phone_col is not None:
            return idx + 1, name_col, phone_col

    # No header row: guess from the data itself.
    width = max((len(r) for r in rows), default=0)
    phone_hits = [0] * width
    text_hits = [0] * width
    for row in rows[:50]:
        for i, cell in enumerate(row):
            if normalize_phone(cell):
                phone_hits[i] += 1
            elif clean_name(cell):
                text_hits[i] += 1
    phone_col = max(range(width), key=lambda i: phone_hits[i]) if width and max(phone_hits) else None
    name_col = max(range(width), key=lambda i: text_hits[i]) if width and max(text_hits) else None
    return 0, name_col, phone_col


def parse_sheet(filename: str, content: bytes) -> list[dict]:
    rows = [r for r in _read_rows(filename, content) if any(c not in (None, "") for c in r)]
    if not rows:
        return []
    start, name_col, phone_col = _find_columns(rows)

    players: list[dict] = []
    seen: set[str] = set()
    for row in rows[start:]:
        cell = lambda i: row[i] if i is not None and i < len(row) else None  # noqa: E731
        phone = normalize_phone(cell(phone_col))
        name = clean_name(cell(name_col))
        if not name and not phone:
            continue
        key = phone or name.lower()
        if key in seen:
            continue
        seen.add(key)
        players.append({"name": name or f"Player {phone[-4:]}", "phone": phone})
    return players
