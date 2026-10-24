import type { MetadataRoute } from "next";

// Lets people add the portal to their phone's Home Screen (needed for alerts on iPhone).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AlzaHR Client Portal",
    short_name: "AlzaHR",
    description: "Your HR workspace with Ben at AlzaHR",
    start_url: "/",
    display: "standalone",
    background_color: "#f9f7f3",
    theme_color: "#19283c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
