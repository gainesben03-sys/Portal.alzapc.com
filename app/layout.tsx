import type { Metadata, Viewport } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { DemoBar } from "@/components/demobar";
import { PreviewBar } from "@/components/preview";

export const metadata: Metadata = {
  title: "AlzaHR Client Portal",
  description: "Client workspaces and accountability tracking for Alza advisory clients.",
  appleWebApp: { capable: true, title: "AlzaHR", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#19283c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("alza-theme");if(!t){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            // After a new release, a page left open can ask for the old styles and come up unstyled.
            // If the styles or code didn't load, reload once to pick up the new version.
            __html: `(function(){var K="alza-heal",n=Date.now();function again(){try{var l=+sessionStorage.getItem(K)||0;if(n-l<60000)return;sessionStorage.setItem(K,String(n))}catch(e){}location.reload()}function check(){var v=getComputedStyle(document.documentElement).getPropertyValue("--line");if(!v||!v.trim())again()}addEventListener("load",function(){setTimeout(check,300)});addEventListener("error",function(e){var t=e.target;if(t&&(t.tagName==="LINK"||t.tagName==="SCRIPT")&&(t.href||t.src||"").indexOf("/_next/static/")>-1)again()},true);addEventListener("unhandledrejection",function(e){var m=String(e.reason&&(e.reason.name||e.reason.message)||"");if(/ChunkLoadError|Loading (CSS )?chunk/i.test(m))again()})})();`,
          }}
        />
      </head>
      <body>
        <StoreProvider>
          <DemoBar />
          <PreviewBar />
          {children}
        </StoreProvider>
      </body>
    </html>
  );
}
