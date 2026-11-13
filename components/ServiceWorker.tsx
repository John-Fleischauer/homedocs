"use client";

import { useEffect } from "react";

/* Registers public/sw.js in a production build. In development it would serve
   stale pages over hot reloads, so it stays off. The guide's own worker is
   registered by the guide page, with a narrower scope (public/g/sw.js). */
export function ServiceWorker() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    if (location.pathname.startsWith("/g/")) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
