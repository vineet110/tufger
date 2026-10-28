"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; text: string; tone: "ok" | "err" };

export function toast(text: string, tone: Toast["tone"] = "ok") {
  window.dispatchEvent(new CustomEvent("tufger:toast", { detail: { text, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    let seq = 0;
    const onToast = (e: Event) => {
      const { text, tone } = (e as CustomEvent).detail;
      const id = ++seq;
      setItems((list) => [...list.slice(-2), { id, text, tone }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 2800);
    };
    window.addEventListener("tufger:toast", onToast);
    return () => window.removeEventListener("tufger:toast", onToast);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[100] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rise board pointer-events-auto px-5 py-3 text-sm font-semibold ${t.tone === "err" ? "text-red" : "text-lime"}`}
        >
          {t.tone === "err" ? "✕ " : "● "}
          {t.text}
        </div>
      ))}
    </div>
  );
}

export async function copyText(text: string, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(label);
  } catch {
    toast("Couldn't copy. Long-press to copy instead", "err");
  }
}
