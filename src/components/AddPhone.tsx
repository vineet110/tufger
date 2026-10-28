"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "./Toast";

/** Inline "add WhatsApp number" for a player who doesn't have one yet. */
export function AddPhone({ playerId, name, onSaved }: { playerId: number; name: string; onSaved: (phone: string) => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          const p = await api.setPhone(playerId, value);
          toast(`Number saved for ${name}`);
          onSaved(p.phone);
        } catch (err) {
          toast(err instanceof Error ? err.message : "Couldn't save the number", "err");
        } finally {
          setSaving(false);
        }
      }}
    >
      <input
        className="field !py-2 font-[family-name:var(--font-jet)] text-sm"
        inputMode="tel"
        placeholder={`${name.split(" ")[0]}'s WhatsApp number`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button className="btn btn-sm" disabled={!value.trim() || saving}>
        Save
      </button>
    </form>
  );
}
