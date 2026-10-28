import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Doto, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const shoulders = Big_Shoulders({
  variable: "--font-shoulders",
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
});

const doto = Doto({
  variable: "--font-doto",
  subsets: ["latin"],
  weight: ["700", "900"],
});

const jet = JetBrains_Mono({
  variable: "--font-jet",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Tufger · Turf Booking Manager", template: "%s · Tufger" },
  description: "Split turf bookings and collect every player's share over UPI without chasing anyone.",
};

export const viewport: Viewport = {
  themeColor: "#050c08",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${shoulders.variable} ${doto.variable} ${instrument.variable} ${jet.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
