import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Approve an offer", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
