import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "Alza Client Portal",
  description: "Client workspaces and accountability tracking for Alza advisory clients.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1a2b4a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
