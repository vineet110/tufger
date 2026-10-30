import type {
  Bill,
  BookingDetail,
  BookingSummary,
  Contact,
  ContactImport,
  Dashboard,
  Ground,
  HostAdminRow,
  KhataDetail,
  KhataRow,
  Me,
  PublicBill,
  PublicBooking,
  PublicRules,
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

const VAULT_KEY = "tufger.key";

/** The Tufger key that unlocks Dugout and Scorebook; kept for this browser tab only. */
export function getVaultKey(): string | null {
  try {
    return sessionStorage.getItem(VAULT_KEY);
  } catch {
    return null;
  }
}

export function setVaultKey(key: string | null) {
  try {
    if (key) sessionStorage.setItem(VAULT_KEY, key);
    else sessionStorage.removeItem(VAULT_KEY);
  } catch {}
  if (!key) window.dispatchEvent(new Event("tufger:locked"));
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
  const vaultKey = getVaultKey();
  if (vaultKey && !headers.has("X-Tufger-Key")) headers.set("X-Tufger-Key", vaultKey);
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
    if (res.status === 403 && vaultKey) setVaultKey(null); // key changed on the server
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  login: (passcode: string) => request<Session>("/auth/login", json("POST", { passcode })),
  hostLogin: (username: string, password: string) => request<Session>("/auth/host/login", json("POST", { username, password })),
  hostSignup: (username: string, display_name: string, password: string) =>
    request<Session>("/auth/host/signup", json("POST", { username, display_name, password })),
  me: () => request<Me>("/auth/me"),
  changePassword: (current: string, next: string) => request<Session>("/auth/password", json("PUT", { current, new: next })),

  // site admin only
  hosts: () => request<HostAdminRow[]>("/admin/hosts"),
  createHost: (body: {
    username: string;
    display_name: string;
    password: string;
    role: "premium" | "host";
    passcode?: string | null;
    confirm: string;
  }) =>
    request<HostAdminResult>("/admin/hosts", json("POST", body)),
  updateHost: (
    id: number,
    patch: {
      role?: "premium" | "host";
      active?: boolean;
      password?: string;
      passcode?: string | null;
      new_passcode?: boolean;
      confirm?: string;
    },
  ) => request<HostAdminResult>(`/admin/hosts/${id}`, json("PATCH", patch)),
  newPasscode: (password: string) => request<Session & { passcode: string }>("/auth/passcode/new", json("POST", { password })),
  setTufgerKey: (key: string, confirm: string) => request<{ ok: true }>("/admin/tufger-key", json("PUT", { key, confirm })),
  setVaultPassword: (next: string, confirm: string) => request<Me>("/auth/vault-password", json("PUT", { new: next, confirm })),
  publicRules: (host: string) => request<PublicRules>(`/public/rules?host=${encodeURIComponent(host)}`),

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

  contacts: () => request<Contact[]>("/contacts"),
  addContact: (name: string, phone: string | null) => request<Contact>("/contacts", json("POST", { name, phone })),
  updateContact: (id: number, patch: { name?: string; phone?: string | null; archived?: boolean }) =>
    request<Contact>(`/contacts/${id}`, json("PATCH", patch)),
  deleteContact: (id: number) => request<{ ok: true }>(`/contacts/${id}`, json("DELETE")),
  /** Checks the file when dryRun is true; saves the good rows when it's false. */
  uploadContacts: (file: File, dryRun: boolean) => {
    const body = new FormData();
    body.append("file", file);
    return request<ContactImport>(`/contacts/upload?dry_run=${dryRun}`, { method: "POST", body });
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

  khata: () => request<KhataRow[]>("/khata"),
  khataPlayer: (id: number) => request<KhataDetail>(`/khata/players/${id}`),
  addPlayer: (name: string, phone: string | null) => request<KhataDetail>("/khata/players", json("POST", { name, phone })),
  updatePlayer: (id: number, patch: { name?: string; phone?: string | null; archived?: boolean }) =>
    request<KhataDetail>(`/khata/players/${id}`, json("PATCH", patch)),
  deletePlayer: (id: number) => request<{ ok: true }>(`/khata/players/${id}`, json("DELETE")),
  gotPayment: (id: number, amount: number, note: string, settle = true) =>
    request<KhataDetail>(`/khata/players/${id}/payment`, json("POST", { amount, note, settle })),
  addDue: (id: number, amount: number, note: string) => request<KhataDetail>(`/khata/players/${id}/due`, json("POST", { amount, note })),
  deleteTxn: (txnId: number) => request<KhataDetail>(`/khata/txns/${txnId}`, json("DELETE")),
  bills: () => request<Bill[]>("/khata/bills"),
  publicBill: (slug: string) => request<PublicBill>(`/public/bill/${slug}`),
  claimBill: (slug: string, utr: string) => request<PublicBill>(`/public/bill/${slug}/claim`, json("POST", { utr })),

  /** Download the Excel backup of every player and their history. */
  async downloadBackup() {
    const token = getToken();
    const res = await fetch(apiBase() + "/khata/export", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, "Couldn't create the backup");
    const name = res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1] ?? "tufger-khata.xlsx";
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  publicBooking: (slug: string) => request<PublicBooking>(`/public/b/${slug}`),
  claim: (slug: string, entryId: number, utr: string) =>
    request<PublicBooking>(`/public/b/${slug}/claim`, json("POST", { entry_id: entryId, utr })),

  // Dugout and Scorebook calls carry the Tufger key automatically once unlocked
  unlock: (key: string) => request<{ ok: true }>("/auth/unlock", { method: "POST", headers: { "X-Tufger-Key": key } }),
  createDugoutGame: (game: SheetGameIn) =>
    request<{ id: number; slug: string; total_amount: number; players: number }>("/teamsheet/games", json("POST", game)),
  setPhone: (playerId: number, phone: string) => request<{ id: number; phone: string }>(`/players/${playerId}/phone`, json("PUT", { phone })),
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

export interface Session {
  token: string;
  me: Me;
}

/** An admin action's result; passcode is only present right after one is set or generated. */
export type HostAdminResult = HostAdminRow & { passcode: string | null };
