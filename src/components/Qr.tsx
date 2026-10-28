"use client";

import QRCode from "qrcode";
import { useEffect, useRef } from "react";

export function Qr({ value, size = 200 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) {
      QRCode.toCanvas(ref.current, value, { width: size, margin: 1, color: { dark: "#050c08", light: "#eef3e6" } });
    }
  }, [value, size]);
  return <canvas ref={ref} width={size} height={size} className="rounded-lg" />;
}
