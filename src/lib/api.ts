import type {
  BookingDetail,
  BookingSummary,
  Dashboard,
  Ground,
  PlayerStats,
  PublicBooking,
  RosterRow,
  Settings,
  Sport,
} from "./types";

const TOKEN_KEY = "tufger.token";

// Same origin everywhere: Vercel routes /api/py to FastAPI, and next.config.ts proxies it locally.
export function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL || "/api/py";
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(apiBase() + path, { ...init, headers });
  } catch {
    throw new ApiError(0, "Can't reach the Tufger server. Is the API running?");
  }
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = typeof data.detail === "string" ? data.detail : "Please check the details and try again";
    } catch {}
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event("tufger:logout"));
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  login: (passcode: string) => request<{ token: string }>("/auth/login", json("POST", { passcode })),
  me: () => request<{ ok: true }>("/auth/me"),

  dashboard: () => request<Dashboard>("/dashboard"),
  settings: () => request<Settings>("/settings"),
  saveSettings: (s: Settings) => request<Settings>("/settings", json("PUT", s)),

  grounds: () => request<Ground[]>("/grounds"),
  createGround: (g: Omit<Ground, "id" | "bookings">) => request<Ground>("/grounds", json("POST", g)),
  updateGround: (id: number, g: Omit<Ground, "id" | "bookings">) => request<Ground>(`/grounds/${id}`, json("PUT", g)),
  deleteGround: (id: number) => request<{ ok: true }>(`/grounds/${id}`, json("DELETE")),

  uploadRoster: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<{ players: RosterRow[] }>("/roster/upload", { method: "POST", body });
  },

  bookings: (archived = false) => request<BookingSummary[]>(`/bookings?archived=${archived}`),
  booking: (id: number) => request<BookingDetail>(`/bookings/${id}`),
  createBooking: (body: unknown) => request<BookingDetail>("/bookings", json("POST", body)),
  patchBooking: (id: number, body: Record<string, unknown>) => request<BookingDetail>(`/bookings/${id}`, json("PATCH", body)),
  deleteBooking: (id: number) => request<{ ok: true }>(`/bookings/${id}`, json("DELETE")),
  resplit: (id: number) => request<BookingDetail>(`/bookings/${id}/resplit`, json("POST")),
  addPlayers: (id: number, players: RosterRow[]) =>
    request<BookingDetail>(`/bookings/${id}/players`, json("POST", { players, resplit: true })),
  removeEntry: (id: number, entryId: number) =>
    request<BookingDetail>(`/bookings/${id}/entries/${entryId}?resplit=true`, json("DELETE")),
  setStatus: (id: number, entryId: number, status: "pending" | "claimed" | "paid") =>
    request<BookingDetail>(`/bookings/${id}/entries/${entryId}/status`, json("POST", { status })),
  setAmount: (id: number, entryId: number, amount: number) =>
    request<BookingDetail>(`/bookings/${id}/entries/${entryId}/amount`, json("PUT", { amount })),
  nudge: (id: number, entryId: number) => request<BookingDetail>(`/bookings/${id}/entries/${entryId}/nudge`, json("POST")),

  players: () => request<PlayerStats[]>("/players"),

  publicBooking: (slug: string) => request<PublicBooking>(`/public/b/${slug}`),
  claim: (slug: string, entryId: number, utr: string) =>
    request<PublicBooking>(`/public/b/${slug}/claim`, json("POST", { entry_id: entryId, utr })),

  // Team Sheet also needs the Tufger key on every call
  sheetUnlock: (key: string) => request<{ ok: true }>("/teamsheet/unlock", { method: "POST", headers: { "X-Tufger-Key": key } }),
  sheetCreateGame: (key: string, game: SheetGameIn) =>
    request<{ id: number; slug: string; total_amount: number; players: number }>("/teamsheet/games", {
      ...json("POST", game),
      headers: { "X-Tufger-Key": key },
    }),
};

export interface SheetGameIn {
  ground_name: string;
  sport: Sport;
  play_date: string;
  start_time: string;
  duration_min: number;
  message: string;
  players: { name: string; phone: string | null; amount: number; paid: boolean; is_organizer: boolean }[];
}
