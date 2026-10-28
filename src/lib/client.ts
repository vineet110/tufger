"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Today's date as YYYY-MM-DD; "" while prerendering, so no clock is read on the server. */
export function useToday(): string {
  return useSyncExternalStore(noop, () => isoDay(new Date()), () => "");
}

function subscribeStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

/** Read a localStorage key; null on the server or when storage is blocked. */
export function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    subscribeStorage,
    () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
}
