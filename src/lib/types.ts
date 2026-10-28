export type Sport = "cricket" | "football" | "other";
export type EntryStatus = "pending" | "claimed" | "paid";

export interface Settings {
  organizer_name: string;
  upi_id: string;
  payee_name: string;
  reminder_template: string;
}

export interface Ground {
  id: number;
  name: string;
  area: string;
  sport: Sport;
  price_per_hour: number; // weekday
  weekend_price_per_hour: number | null; // null = same as weekday
  bookings: number;
}

export interface RosterRow {
  name: string;
  phone: string | null;
  amount?: number | null;
}

export interface Tally {
  target: number;
  collected: number;
  claimed: number;
  players: number;
  paid_count: number;
  claimed_count: number;
  pending_count: number;
}

export interface BookingSummary {
  id: number;
  slug: string;
  ground_name: string;
  ground_area: string;
  sport: Sport;
  play_date: string;
  start_time: string;
  duration_min: number;
  total_amount: number;
  rate_per_hour: number;
  is_weekend: boolean;
  base_amount: number;
  discount: number;
  discount_note: string;
  archived: boolean;
  created_at: string;
  tally: Tally;
}

export interface Entry {
  id: number;
  player_id: number;
  name: string;
  phone: string | null;
  amount: number;
  is_organizer: boolean;
  status: EntryStatus;
  utr: string;
  claimed_at: string | null;
  paid_at: string | null;
  nudges: number;
}

export interface BookingDetail extends BookingSummary {
  round_to: number;
  notes: string;
  entries: Entry[];
  events: { kind: string; message: string; created_at: string }[];
}

export interface PublicBooking {
  slug: string;
  ground_name: string;
  ground_area: string;
  sport: Sport;
  play_date: string;
  start_time: string;
  duration_min: number;
  total_amount: number;
  base_amount: number;
  discount: number;
  notes: string;
  organizer_name: string;
  upi_id: string;
  payee_name: string;
  tally: Tally;
  entries: { id: number; name: string; amount: number; status: EntryStatus; is_organizer: boolean }[];
}

export interface KhataRow {
  id: number;
  name: string;
  phone: string | null;
  archived: boolean;
  games: number;
  charged: number;
  paid: number;
  balance: number; // > 0 owes you, < 0 advance
  bill_due: number;
  under_review: number;
  avg_pay_hours: number | null;
  rating: string;
  last_activity: string | null;
  has_history: boolean;
}

export interface KhataItem {
  id: string;
  kind: "charge" | "paid" | "got" | "due";
  at: string;
  amount: number;
  title: string;
  subtitle: string;
  status: EntryStatus | null;
  booking_id: number | null;
  txn_id: number | null;
  balance_after: number;
}

export interface KhataDetail extends KhataRow {
  pay_slug: string;
  history: KhataItem[];
}

export interface BillLine {
  booking_id: number;
  ground_name: string;
  play_date: string;
  start_time: string;
  amount: number;
  status: EntryStatus;
}

export interface Bill {
  player_id: number;
  name: string;
  phone: string | null;
  pay_slug: string;
  lines: BillLine[];
  extra_due: number;
  due: number;
  under_review: number;
}

export interface PublicBill {
  name: string;
  organizer_name: string;
  upi_id: string;
  payee_name: string;
  lines: BillLine[];
  extra_due: number;
  due: number;
  under_review: number;
}

export interface Dashboard {
  active_bookings: number;
  to_collect: number;
  collected_all_time: number;
  awaiting_confirmation: number;
  players: number;
  next_game: BookingSummary | null;
}
