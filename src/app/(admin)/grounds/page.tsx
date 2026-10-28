"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { api } from "@/lib/api";
import { rupees, sportEmoji, sportLabel } from "@/lib/format";
import type { Ground, Sport } from "@/lib/types";

type Draft = Omit<Ground, "id" | "bookings">;
const EMPTY: Draft = { name: "", area: "", sport: "cricket", price_per_hour: 0, weekend_price_per_hour: null };

export default function GroundsPage() {
  const [grounds, setGrounds] = useState<Ground[] | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);

  const load = () => api.grounds().then(setGrounds);
  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow !text-led">● Grounds</div>
          <h1 className="display mt-2 text-6xl sm:text-7xl">Your turfs</h1>
          <p className="mt-2 text-chalk-dim">Save the hourly rate once and every booking works out the amount for you.</p>
        </div>
        <button className="btn btn-lime" onClick={() => setEditing("new")}>
          + Add ground
        </button>
      </div>

      {editing === "new" && (
        <GroundForm
          initial={EMPTY}
          onCancel={() => setEditing(null)}
          onSave={async (d) => {
            await api.createGround(d);
            toast("Ground added");
            setEditing(null);
            load();
          }}
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {grounds?.map((g) =>
          editing === g.id ? (
            <GroundForm
              key={g.id}
              initial={g}
              onCancel={() => setEditing(null)}
              onSave={async (d) => {
                await api.updateGround(g.id, d);
                toast("Ground updated");
                setEditing(null);
                load();
              }}
              onDelete={async () => {
                if (!confirm(`Delete ${g.name}? Past bookings keep the name.`)) return;
                await api.deleteGround(g.id);
                toast("Ground deleted");
                setEditing(null);
                load();
              }}
            />
          ) : (
            <button key={g.id} onClick={() => setEditing(g.id)} className="slab rise flex items-center gap-4 p-5 text-left transition-colors hover:border-chalk/30">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-black/40 text-3xl">{sportEmoji[g.sport]}</div>
              <div className="min-w-0 flex-1">
                <div className="display truncate text-3xl">{g.name}</div>
                <div className="text-xs text-muted">
                  {g.area || "—"} · {sportLabel[g.sport]} · {g.bookings} booking{g.bookings === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <div className="eyebrow !text-[0.68rem]">Weekday</div>
                  <div className="led text-xl">{rupees(g.price_per_hour)}</div>
                </div>
                <div>
                  <div className="eyebrow !text-[0.68rem]">Weekend</div>
                  <div className="led text-xl">{rupees(g.weekend_price_per_hour ?? g.price_per_hour)}</div>
                </div>
              </div>
            </button>
          ),
        )}
      </div>
      {grounds?.length === 0 && editing !== "new" && (
        <div className="slab p-10 text-center text-chalk-dim">No grounds yet. Add the turfs you usually book.</div>
      )}
    </div>
  );
}

function GroundForm({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: Draft;
  onSave: (d: Draft) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState<Draft>({
    name: initial.name,
    area: initial.area,
    sport: initial.sport,
    price_per_hour: initial.price_per_hour,
    weekend_price_per_hour: initial.weekend_price_per_hour,
  });
  const [busy, setBusy] = useState(false);
  return (
    <div className="slab rise border-lime/40 p-5 md:col-span-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="eyebrow label">Name</label>
          <input className="field" autoFocus value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Smash Arena" />
        </div>
        <div>
          <label className="eyebrow label">Area</label>
          <input className="field" value={d.area} onChange={(e) => setD({ ...d, area: e.target.value })} placeholder="Andheri West" />
        </div>
        <div>
          <label className="eyebrow label">Sport</label>
          <div className="seg">
            {(["cricket", "football", "other"] as Sport[]).map((s) => (
              <button key={s} type="button" aria-pressed={d.sport === s} onClick={() => setD({ ...d, sport: s })}>
                {sportEmoji[s]} {s}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="eyebrow label">Weekday ₹/hr</label>
            <input
              className="field led !text-xl"
              type="number"
              inputMode="numeric"
              value={d.price_per_hour || ""}
              onChange={(e) => setD({ ...d, price_per_hour: Math.max(0, Number(e.target.value)) })}
            />
          </div>
          <div>
            <label className="eyebrow label">Weekend ₹/hr</label>
            <input
              className="field led !text-xl"
              type="number"
              inputMode="numeric"
              placeholder="same"
              value={d.weekend_price_per_hour ?? ""}
              onChange={(e) => setD({ ...d, weekend_price_per_hour: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
            />
          </div>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          className="btn btn-lime btn-sm"
          disabled={!d.name || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(d);
            } catch (e) {
              toast(e instanceof Error ? e.message : "Couldn't save", "err");
              setBusy(false);
            }
          }}
        >
          Save
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        {onDelete && (
          <button className="btn btn-sm btn-ghost ml-auto !text-red" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
