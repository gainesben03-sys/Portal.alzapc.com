import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "The Pause", description: "Five minutes for yourself.", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0d1a2e" };

export default function PauseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
