import type { MetadataRoute } from "next";
import { PAGE_COLOR } from "@/lib/design/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "homedocs",
    short_name: "homedocs",
    description: "Everything about our house, in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: PAGE_COLOR.light,
    theme_color: "#0f6b5c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Search", url: "/search" },
      { name: "Add", url: "/add" },
      { name: "House Guide", url: "/guide" },
    ],
  };
}
