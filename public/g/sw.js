/*
 * The house guide's service worker, scoped to /g/.
 *
 * It never caches the live guide page. When the page loads it asks this worker
 * to save the *offline snapshot* (/g/<token>/offline: plain HTML, no codes, no
 * address, no sensitive sections). If the phone later has no signal, a visit to
 * the guide shows that snapshot — until the link's expiry, after which it is
 * deleted rather than shown. When the server says the link is gone (404/410),
 * the snapshot is deleted too.
 */

const CACHE = "homedocs-guide-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

function guidePath(url) {
  const m = /^\/g\/([A-Za-z0-9_-]{20,100})\/?$/.exec(new URL(url).pathname);
  return m ? `/g/${m[1]}` : null;
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (
    data.type !== "save-guide" ||
    typeof data.path !== "string" ||
    !guidePath(self.location.origin + data.path)
  )
    return;
  event.waitUntil(
    fetch(`${data.path}/offline`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (res) => {
        const cache = await caches.open(CACHE);
        if (!res.ok) return cache.delete(data.path);
        return cache.put(data.path, res);
      })
      .catch(() => {}),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  const path = guidePath(event.request.url);
  if (!path) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(event.request);
        if (res.status === 404 || res.status === 410) await cache.delete(path);
        return res;
      } catch {
        const saved = await cache.match(path);
        const expires = Number(saved?.headers.get("x-guide-expires") ?? 0);
        if (saved && expires > Date.now()) return saved;
        if (saved) await cache.delete(path);
        return new Response(
          '<!doctype html><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;padding:24px">' +
            "<h1>Offline</h1><p>This guide isn’t saved on this phone, or its link has expired.</p>",
          { headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }
    })(),
  );
});
