"use client";

import { createPortal } from "react-dom";

/** Full-screen popup. Sits on document.body because .slab's backdrop-filter would trap a fixed overlay inside the card. */
export function Popup({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
