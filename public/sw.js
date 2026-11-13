/*
 * The app's service worker: enough to install it and to say "Offline" instead of
 * the browser's error page. Nothing a page shows is cached — every page is
 * signed in and private — only the offline page and the icon.
 *
 * The house guide has its own worker (public/g/sw.js) scoped to /g/, which is
 * the only place anything private is ever cached, and only the parts that are
 * not secret.
 */

const CACHE = "homedocs-offline-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("homedocs-offline") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  // The guide's worker owns /g/.
  if (new URL(event.request.url).pathname.startsWith("/g/")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});
