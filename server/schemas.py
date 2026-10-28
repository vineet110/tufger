from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, Field

Sport = Literal["cricket", "football", "other"]
EntryStatus = Literal["pending", "claimed", "paid"]


class LoginIn(BaseModel):
    passcode: str


class SettingsIO(BaseModel):
    organizer_name: str = Field(max_length=80)
    upi_id: str = Field(default="", max_length=120)
    payee_name: str = Field(default="", max_length=80)
    reminder_template: str


class GroundIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    area: str = Field(default="", max_length=120)
    sport: Sport = "cricket"
    price_per_hour: int = Field(ge=0)  # weekday
    weekend_price_per_hour: int | None = Field(default=None, ge=0)


class GroundOut(GroundIn):
    id: int
    bookings: int = 0


class RosterPlayer(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str | None = None
    amount: int | None = Field(default=None, ge=0)  # custom share, else auto-split


class BookingIn(BaseModel):
    ground_id: int
    play_date: date
    start_time: time
    duration_min: int = Field(ge=15, le=24 * 60)
    rate_per_hour: int = Field(gt=0)
    is_weekend: bool = False
    discount: int = Field(default=0, ge=0)
    discount_note: str = Field(default="", max_length=120)
    round_to: int = Field(default=1, ge=1)
    include_organizer: bool = False
    notes: str = ""
    players: list[RosterPlayer] = Field(min_length=1)


class BookingPatch(BaseModel):
    play_date: date | None = None
    start_time: time | None = None
    duration_min: int | None = Field(default=None, ge=15)
    total_amount: int | None = Field(default=None, gt=0)
    notes: str | None = None
    archived: bool | None = None


class EntryOut(BaseModel):
    id: int
    player_id: int
    name: str
    phone: str | None
    amount: int
    is_organizer: bool
    status: EntryStatus
    utr: str
    claimed_at: datetime | None
    paid_at: datetime | None
    nudges: int


class EventOut(BaseModel):
    kind: str
    message: str
    created_at: datetime


class Tally(BaseModel):
    target: int
    collected: int
    claimed: int
    players: int
    paid_count: int
    claimed_count: int
    pending_count: int


class BookingSummary(BaseModel):
    id: int
    slug: str
    ground_name: str
    ground_area: str
    sport: str
    play_date: date
    start_time: time
    duration_min: int
    total_amount: int
    rate_per_hour: int
    is_weekend: bool
    base_amount: int
    discount: int
    discount_note: str
    archived: bool
    created_at: datetime
    tally: Tally


class BookingDetail(BookingSummary):
    round_to: int
    notes: str
    entries: list[EntryOut]
    events: list[EventOut]


class EntryStatusIn(BaseModel):
    status: EntryStatus


class EntryAmountIn(BaseModel):
    amount: int = Field(ge=0)


class AddPlayersIn(BaseModel):
    players: list[RosterPlayer] = Field(min_length=1)
    resplit: bool = True


class ClaimIn(BaseModel):
    entry_id: int
    utr: str = Field(default="", max_length=40)


class PublicEntry(BaseModel):
    id: int
    name: str
    amount: int
    status: EntryStatus
    is_organizer: bool


class PublicBooking(BaseModel):
    slug: str
    ground_name: str
    ground_area: str
    sport: str
    play_date: date
    start_time: time
    duration_min: int
    total_amount: int
    base_amount: int
    discount: int
    notes: str
    organizer_name: str
    upi_id: str
    payee_name: str
    tally: Tally
    entries: list[PublicEntry]


class KhataRow(BaseModel):
    id: int
    name: str
    phone: str | None
    archived: bool
    games: int
    charged: int
    paid: int
    balance: int  # > 0 = owes you, < 0 = advance
    bill_due: int  # what their bill link asks for (unpaid games + extra dues)
    under_review: int
    avg_pay_hours: float | None
    rating: str
    last_activity: datetime | None
    has_history: bool


class KhataItem(BaseModel):
    id: str
    kind: Literal["charge", "paid", "got", "due"]
    at: datetime
    amount: int
    title: str
    subtitle: str
    status: EntryStatus | None = None
    booking_id: int | None = None
    txn_id: int | None = None
    balance_after: int


class KhataDetail(KhataRow):
    pay_slug: str
    history: list[KhataItem]


class KhataPlayerIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str | None = None


class KhataPlayerPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = None  # "" removes the number
    archived: bool | None = None


class KhataMoneyIn(BaseModel):
    amount: int = Field(gt=0)
    note: str = Field(default="", max_length=200)
    settle: bool = True  # payments: mark the oldest unpaid games as paid first


class BillLine(BaseModel):
    booking_id: int
    ground_name: str
    play_date: date
    start_time: time
    amount: int
    status: EntryStatus


class BillOut(BaseModel):
    player_id: int
    name: str
    phone: str | None
    pay_slug: str
    lines: list[BillLine]
    extra_due: int  # khata dues minus payments not tied to a game (can be negative = credit)
    due: int
    under_review: int


class PublicBill(BaseModel):
    name: str
    organizer_name: str
    upi_id: str
    payee_name: str
    lines: list[BillLine]
    extra_due: int
    due: int
    under_review: int


class BillClaimIn(BaseModel):
    utr: str = Field(default="", max_length=40)


class DashboardOut(BaseModel):
    active_bookings: int
    to_collect: int
    collected_all_time: int
    awaiting_confirmation: int
    players: int
    next_game: BookingSummary | None


class SheetPlayerIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: str | None = None
    amount: int = Field(ge=0)
    paid: bool = False
    is_organizer: bool = False


class SheetGameIn(BaseModel):
    ground_name: str = Field(min_length=1, max_length=120)
    sport: Sport = "other"
    play_date: date
    start_time: time
    duration_min: int = Field(ge=15, le=24 * 60)
    message: str = Field(default="", max_length=2000)
    players: list[SheetPlayerIn] = Field(min_length=1)


class SheetGameOut(BaseModel):
    id: int
    slug: str
    total_amount: int
    players: int


class PhoneIn(BaseModel):
    phone: str = Field(min_length=10, max_length=20)
