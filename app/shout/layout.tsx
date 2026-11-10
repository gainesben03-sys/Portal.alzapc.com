import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Shoutouts", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#19283c" };

export default function ShoutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
