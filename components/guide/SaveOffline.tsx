"use client";

import { useEffect } from "react";

/*
 * Ask the guide's service worker to keep the offline snapshot of this link.
 * Production only: in development a worker would serve stale pages over
 * hot reloads.
 */
export function SaveOffline({ path }: { path: string }) {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    navigator.serviceWorker
      .register("/g/sw.js", { scope: "/g/" })
      .then((reg) => {
        const worker = reg.active ?? reg.waiting ?? reg.installing;
        const send = () =>
          (reg.active ?? worker)?.postMessage({ type: "save-guide", path });
        if (reg.active) send();
        else
          worker?.addEventListener("statechange", () => reg.active && send());
      })
      .catch(() => {});
  }, [path]);
  return null;
}
