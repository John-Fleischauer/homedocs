/*
 * The offline copy of a shared guide: plain HTML, no scripts, nothing gated.
 *
 * The guide's service worker (public/g/sw.js) caches this — never the live
 * page — so a phone that loses signal still shows shutoffs and phone numbers,
 * while codes, the address and sensitive sections never touch the device's
 * storage. It carries its expiry; the worker stops showing it after that.
 */

import type { Guide } from "./guide";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

const tel = (v: string) => `tel:${v.replace(/[^\d+]/g, "")}`;

export function offlineHtml(guide: Guide, expiresAt: Date): string {
  const fixtures = guide.groups
    .map((g) => {
      const items = g.fixtures
        .map(
          (t) =>
            `<li><strong>${esc(t.name)}</strong><br><span class="m">${esc(t.where)}</span>${
              t.note ? `<p>${esc(t.note)}</p>` : ""
            }</li>`,
        )
        .join("");
      const calls = g.calls
        .map(
          (c) =>
            `<li>Call <a href="${esc(tel(c.phone))}">${esc(c.name)}: ${esc(c.phone)}</a></li>`,
        )
        .join("");
      const heading =
        guide.groups.length > 1 || g.id ? `<h3>${esc(g.name)}</h3>` : "";
      return `${heading}<ul>${items}${calls}</ul>`;
    })
    .join("");
  const contacts = guide.contacts
    .map(
      (p) =>
        `<li><strong>${esc(p.name)}</strong>${p.company ? ` (${esc(p.company)})` : ""}<br><span class="m">${esc(
          p.roles.join(", "),
        )}</span>${p.phones.map((ph) => `<br><a href="${esc(tel(ph.value))}">${esc(ph.value)}</a>`).join("")}</li>`,
    )
    .join("");
  const sections = guide.sections
    .filter((s) => !s.sensitive)
    .map(
      (s) =>
        `<h2>${esc(s.title)}</h2><p>${esc(s.body).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const wifi = guide.secrets
    .filter((s) => !s.gated && s.kind === "wifi" && s.value !== undefined)
    .map(
      (s) =>
        `<li><strong>${esc(s.ssid ?? s.label)}</strong><br>Password: <code>${esc(s.value!)}</code></li>`,
    )
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(guide.homeName)} · house guide (offline)</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:16px;background:#f6f5f2;color:#1c1b19}
@media(prefers-color-scheme:dark){body{background:#141412;color:#f2f0ea}a{color:#5cc4ae}}
h1{font-size:1.5rem;margin:.2em 0}h3{font-size:1rem;margin:1em 0 0}h2{font-size:1rem;text-transform:uppercase;letter-spacing:.04em;margin-top:1.5em}
ul{padding:0;list-style:none}li{padding:10px 0;border-bottom:1px solid #8883}.m{opacity:.7;font-size:.9em}
.b{background:#fdf1df;color:#8a4b00;padding:10px 12px;border-radius:10px;font-size:.9em}a{color:#0f6b5c;font-weight:600}</style></head>
<body><p class="b">Offline copy. Codes are not saved on this phone — reconnect to see them. Saved copy works until ${esc(
    expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
  )}.</p>
<h1>${esc(guide.homeName)}</h1>
${fixtures ? `<h2>In an emergency</h2>${fixtures}` : ""}
${contacts ? `<h2>Who to call</h2><ul>${contacts}</ul>` : ""}
${wifi ? `<h2>Wi-Fi</h2><ul>${wifi}</ul>` : ""}
${sections}
</body></html>`;
}
