"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isPremium, useMe } from "@/components/AdminShell";
import { Popup } from "@/components/Popup";
import { toast } from "@/components/Toast";
import { Upgrade } from "@/components/VaultGate";
import { api } from "@/lib/api";
import { initials } from "@/lib/format";
import type { Contact, ContactImport } from "@/lib/types";

const fmtPhone = (p: string) => `+91 ${p.slice(0, 5)} ${p.slice(5)}`;
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function ContactsPage() {
  const { me } = useMe();
  const canUpload = isPremium(me);
  const [upgrading, setUpgrading] = useState(false);
  const [rows, setRows] = useState<Contact[] | null>(null);
  const [q, setQ] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ContactImport | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api.contacts().then(setRows, (e) => toast(e.message, "err"));
  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (c) => c.archived === showHidden && (!needle || c.name.toLowerCase().includes(needle) || (c.phone ?? "").includes(needle)),
    );
  }, [rows, q, showHidden]);
  const hiddenCount = (rows ?? []).filter((c) => c.archived).length;

  function clearUpload() {
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function check(f: File) {
    setBusy(true);
    try {
      setPreview(await api.uploadContacts(f, true));
      setFile(f);
    } catch (e) {
      toast(message(e, "Couldn't read that file"), "err");
      clearUpload();
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!file) return;
    setBusy(true);
    try {
      const r = await api.uploadContacts(file, false);
      toast(`${r.added} added${r.filled ? `, ${r.filled} numbers filled in` : ""}`);
      clearUpload();
      load();
    } catch (e) {
      toast(message(e, "Couldn't save the contacts"), "err");
    } finally {
      setBusy(false);
    }
  }

  async function act(run: () => Promise<unknown>, done: string) {
    try {
      await run();
      toast(done);
      setEditing(null);
      await load();
    } catch (e) {
      toast(message(e, "Couldn't save that"), "err");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow !text-led">● Contacts</div>
          <h1 className="display mt-2 text-6xl sm:text-7xl">Your contact book</h1>
          <p className="mt-2 max-w-xl text-chalk-dim">
            Every name is saved once, so the right person always gets the right bill. Two Rahuls? Save them as Rahul K and Rahul S.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-lime" onClick={() => setAdding((a) => !a)}>
            + Add contact
          </button>
          {canUpload ? (
            <>
              <button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>
                📄 {busy && !preview ? "Reading…" : "Bulk upload"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xlsm,.csv,.txt,.vcf"
                hidden
                onChange={(e) => e.target.files?.[0] && check(e.target.files[0])}
              />
            </>
          ) : (
            <button className="btn" onClick={() => setUpgrading(true)}>
              🔒 Bulk upload <sup className="ml-0.5 text-[0.6rem] text-led">PRO</sup>
            </button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted">
        {canUpload
          ? "Bulk upload takes Excel, CSV or a phone contacts file (.vcf), up to 5,000 rows. You'll see what will be saved first."
          : "Bulk upload is a Premium feature. Upgrade to unlock it."}
      </p>

      {upgrading && (
        <Popup onClose={() => setUpgrading(false)}>
          <Upgrade
            title="Bulk upload"
            name={me.display_name}
            feature="bulk contact upload"
            blurb="Upgrade to Premium to unlock this. Save your whole list at once from Excel, CSV or your phone's contacts (.vcf), instead of adding people one by one."
            onClose={() => setUpgrading(false)}
          />
        </Popup>
      )}

      {adding && (
        <ContactForm
          onCancel={() => setAdding(false)}
          onSave={(name, phone) =>
            act(async () => {
              await api.addContact(name, phone);
              setAdding(false);
            }, "Contact saved")
          }
        />
      )}

      {preview && file && (
        <section className="slab rise border-lime/40 p-5">
          <div className="eyebrow mb-3 !text-lime">Check {file.name}</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Count label="New" value={preview.added} />
            <Count label="Numbers filled in" value={preview.filled} />
            <Count label="Already saved" value={preview.skipped} />
            <Count label="Can't be saved" value={preview.rejected.length} warn />
          </div>
          {preview.rejected.length > 0 && (
            <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-line text-sm">
              {preview.rejected.slice(0, 100).map((r) => (
                <div key={r.line} className="flex flex-wrap gap-x-3 border-b border-line px-3 py-2 last:border-0">
                  <span className="font-mono text-xs text-muted">Row {r.line}</span>
                  <span className="font-semibold">{r.name || "—"}</span>
                  <span className="font-mono text-xs text-muted">{r.phone}</span>
                  <span className="text-red">{r.reason}</span>
                </div>
              ))}
              {preview.rejected.length > 100 && <div className="px-3 py-2 text-muted">…and {preview.rejected.length - 100} more</div>}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-lime" disabled={busy || !(preview.added + preview.filled)} onClick={save}>
              {busy ? "Saving…" : `Save ${preview.added + preview.filled} contact${preview.added + preview.filled === 1 ? "" : "s"}`}
            </button>
            <button className="btn btn-ghost" onClick={clearUpload}>
              Cancel
            </button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input className="field max-w-xs" placeholder="Search name or number…" value={q} onChange={(e) => setQ(e.target.value)} />
        {(hiddenCount > 0 || showHidden) && (
          <button className="text-sm text-chalk-dim underline" onClick={() => setShowHidden((s) => !s)}>
            {showHidden ? "Back to contacts" : `${hiddenCount} hidden`}
          </button>
        )}
        <span className="ml-auto text-sm text-muted">{rows ? `${rows.length} saved` : ""}</span>
      </div>

      {rows === null ? (
        <div className="slab h-64 animate-pulse opacity-50" />
      ) : visible.length === 0 ? (
        <div className="slab p-10 text-center text-chalk-dim">{rows.length ? "No one matches that." : canUpload ? "No contacts yet. Add one, or upload your list." : "No contacts yet. Add your first one."}</div>
      ) : (
        <div className="slab divide-y divide-line overflow-hidden">
          {visible.map((c) =>
            editing === c.id ? (
              <div key={c.id} className="p-3">
                <ContactForm
                  initial={c}
                  onCancel={() => setEditing(null)}
                  onSave={(name, phone) => act(() => api.updateContact(c.id, { name, phone: phone ?? "" }), "Contact updated")}
                />
              </div>
            ) : (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-dashed border-chalk/50 font-[family-name:var(--font-shoulders)] text-base font-black text-chalk-dim">
                  {initials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{c.name}</div>
                  <div className="truncate text-xs text-muted">
                    {c.phone ? <span className="font-[family-name:var(--font-jet)]">{fmtPhone(c.phone)}</span> : <span className="text-led">no number</span>}
                    {" · "}
                    {c.games} game{c.games === 1 ? "" : "s"}
                  </div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing(c.id)}>
                  Edit
                </button>
                {c.has_history || c.archived ? (
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => act(() => api.updateContact(c.id, { archived: !c.archived }), c.archived ? "Contact restored" : "Contact hidden")}
                  >
                    {c.archived ? "Restore" : "Hide"}
                  </button>
                ) : (
                  <button className="btn btn-sm btn-ghost" onClick={() => act(() => api.deleteContact(c.id), "Contact deleted")}>
                    Delete
                  </button>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function Count({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-black/30 p-3">
      <div className="eyebrow !text-[0.68rem]">{label}</div>
      <div className={`led mt-1 text-3xl leading-none ${warn && value ? "text-red" : ""}`}>{value}</div>
    </div>
  );
}

function ContactForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Contact;
  onSave: (name: string, phone: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="slab rise flex flex-wrap items-end gap-3 border-lime/40 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave(name, phone.trim() || null);
        setSaving(false);
      }}
    >
      <label className="min-w-[180px] flex-1">
        <span className="eyebrow label">Name</span>
        <input className="field" autoFocus maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul K" />
      </label>
      <label className="min-w-[180px] flex-1">
        <span className="eyebrow label">WhatsApp number</span>
        <input
          className="field font-[family-name:var(--font-jet)]"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="98765 43210"
        />
      </label>
      <button className="btn btn-lime" disabled={!name.trim() || saving}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
