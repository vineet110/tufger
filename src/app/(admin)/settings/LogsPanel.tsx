"use client";

import { useCallback, useEffect, useState } from "react";
import { copyText, toast } from "@/components/Toast";
import { api } from "@/lib/api";
import type { HostAdminRow, LogLevel, LogRow } from "@/lib/types";

const LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARNING", "ERROR"];
const TONE: Record<string, string> = {
  DEBUG: "text-muted",
  INFO: "text-sky",
  WARNING: "text-led",
  ERROR: "text-red",
  CRITICAL: "text-red",
};

/** Site admin only: the saved app logs (server/logger.py). What's kept is set in server/config.ini → [logging]. */
export function LogsPanel({ hosts }: { hosts: HostAdminRow[] | null }) {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [level, setLevel] = useState<LogLevel>("INFO");
  const [q, setQ] = useState("");
  const [host, setHost] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const names = new Map(hosts?.map((h) => [h.id, h.username]) ?? []);

  const load = useCallback(
    async (before: number | null = null) => {
      setBusy(true);
      try {
        const page = await api.logs({ level, q: q.trim(), host: host.trim(), before });
        setRows((old) => (before ? [...(old ?? []), ...page.rows] : page.rows));
        setNext(page.next_before);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't load logs", "err");
      } finally {
        setBusy(false);
      }
    },
    [level, q, host],
  );

  useEffect(() => {
    const t = setTimeout(() => load(), 300); // wait for typing to settle
    return () => clearTimeout(t);
  }, [load]);

  function download() {
    const lines = (rows ?? []).map((r) =>
      [r.created_at, r.level, r.logger, r.request_id, r.host_id ? `@${names.get(r.host_id) ?? r.host_id}` : "-", r.message].join("\t"),
    );
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tufger-logs-${new Date().toISOString().slice(0, 16).replace(":", "")}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="slab p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-3xl">Logs</h2>
        <div className="flex gap-3 text-xs">
          <button className="text-chalk-dim underline" onClick={() => load()} disabled={busy}>
            Refresh
          </button>
          <button className="text-chalk-dim underline" onClick={download} disabled={!rows?.length}>
            Download shown
          </button>
          <button
            className="text-chalk-dim underline hover:text-red"
            onClick={async () => {
              if (!confirm("Delete every saved log line?")) return;
              try {
                const { deleted } = await api.clearLogs();
                toast(`${deleted} log lines deleted`);
                load();
              } catch (e) {
                toast(e instanceof Error ? e.message : "Couldn't clear logs", "err");
              }
            }}
          >
            Clear all
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">
        Logins, bookings, payments, admin changes and every failed request. Change what&apos;s kept and for how long in{" "}
        <code className="font-mono text-chalk-dim">server/config.ini</code>.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {LEVELS.map((l) => (
          <button key={l} className={`chip ${level === l ? "chip-claimed" : ""}`} onClick={() => setLevel(l)}>
            {l === "DEBUG" ? "all" : `${l.toLowerCase()}+`}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input className="field !py-2 text-sm" placeholder="Search text, path, slug or request id" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="field !py-2 text-sm" placeholder="Host username" value={host} onChange={(e) => setHost(e.target.value)} />
      </div>

      <div className="mt-4 max-h-[32rem] overflow-y-auto rounded-xl border border-line">
        {rows === null ? (
          <div className="p-6 text-center text-sm text-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted">No logs match.</div>
        ) : (
          rows.map((r) => (
            <button
              key={r.id}
              onClick={() => setOpen(open === r.id ? null : r.id)}
              className="block w-full border-b border-line px-3 py-2 text-left font-mono text-[0.72rem] last:border-0 hover:bg-white/[0.03]"
            >
              <div className="flex gap-2">
                <span className="shrink-0 text-muted">{new Date(r.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "medium" })}</span>
                <span className={`w-14 shrink-0 font-bold ${TONE[r.level] ?? ""}`}>{r.level}</span>
                <span className={`min-w-0 ${open === r.id ? "break-words whitespace-pre-wrap" : "truncate"}`}>{r.message}</span>
              </div>
              {open === r.id && (
                <div className="mt-2 grid gap-0.5 text-muted">
                  <span>source: {r.logger}</span>
                  {r.host_id && <span>host: @{names.get(r.host_id) ?? r.host_id}</span>}
                  {r.ip && <span>ip: {r.ip}</span>}
                  {r.request_id && (
                    <span>
                      request:{" "}
                      <span
                        className="underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyText(r.request_id, "Request id copied");
                        }}
                      >
                        {r.request_id}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </button>
          ))
        )}
      </div>
      {next && (
        <button className="btn btn-sm mt-3 w-full" disabled={busy} onClick={() => load(next)}>
          {busy ? "Loading…" : "Older logs"}
        </button>
      )}
    </section>
  );
}
