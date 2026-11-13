import QRCode from "qrcode";
import type { ReactNode } from "react";
import type { Guide, GuideFixture } from "@/lib/guide/guide";
import { systemIcon } from "@/lib/systems/seeds";
import { wifiQrText } from "@/lib/guide/guide";
import { telHref } from "@/lib/contacts/contacts";
import { Card, Pill, Section } from "../ui/Card";
import { Icon } from "../ui/icons";
import { PrintButton } from "./PrintButton";

const KIND_ICON = {
  wifi: "link",
  alarm: "alert",
  lockbox: "key",
  gate: "key",
  other: "key",
} as const;

function FixtureCard({ t, fileBase }: { t: GuideFixture; fileBase: string }) {
  return (
    <Card className="overflow-hidden">
      {t.photos[0] ? (
        <a
          href={`${fileBase}/${t.photos[0].sha256}`}
          target="_blank"
          rel="noreferrer"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- served by our own guarded routes */}
          <img
            src={`${fileBase}/${t.photos[0].sha256}?thumb=1`}
            alt={t.photos[0].caption || t.name}
            className="max-h-56 w-full object-cover print:max-h-40"
          />
        </a>
      ) : null}
      <div className="px-4 py-3">
        <p className="text-[17px] font-semibold text-ink">{t.name}</p>
        <p className="text-sm text-ink-3">{t.where}</p>
        {t.note ? (
          <p className="mt-2 whitespace-pre-wrap text-[15px] text-ink-2">
            {t.note}
          </p>
        ) : null}
        {t.photos.length > 1 ? (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {t.photos.slice(1).map((p) => (
              <a
                key={p.sha256}
                href={`${fileBase}/${p.sha256}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- served by our own guarded routes */}
                <img
                  src={`${fileBase}/${p.sha256}?thumb=1`}
                  alt={p.caption || t.name}
                  className="h-20 w-28 rounded object-cover"
                />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

async function wifiQr(
  ssid: string,
  password: string,
  security?: string,
): Promise<string> {
  return QRCode.toString(wifiQrText(ssid, password, security), {
    type: "svg",
    margin: 1,
    width: 160,
  });
}

/*
 * The guide itself, for both audiences: a signed-in family member (/guide) and
 * a share-link visitor (/g/<token>). Everything it shows has already been
 * filtered by buildGuide — this component never decides what is secret.
 */
export async function GuideView({
  guide,
  fileBase,
  lockSlot,
  intro,
}: {
  guide: Guide;
  /** Where photos are served from: /api/files for family, /g/<token>/files for a link. */
  fileBase: string;
  /** Shown when something is held back: the PIN form, or a "show codes" button. */
  lockSlot?: ReactNode;
  intro?: ReactNode;
}) {
  const qrs = new Map<string, string>();
  for (const s of guide.secrets) {
    if (s.kind === "wifi" && s.value !== undefined && s.ssid)
      qrs.set(s.id, await wifiQr(s.ssid, s.value, s.security));
  }
  const empty =
    !guide.fixtures.length &&
    !guide.contacts.length &&
    !guide.sections.length &&
    !guide.secrets.length;

  return (
    <div className="guide">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {guide.homeName}
          </h1>
          <p className="text-[15px] text-ink-3">House Guide</p>
          {guide.address ? (
            <p className="mt-1 whitespace-pre-wrap text-[15px] text-ink-2">
              {guide.address}
            </p>
          ) : null}
        </div>
        <PrintButton />
      </div>

      {intro}

      {guide.locked && lockSlot ? (
        <div className="no-print mb-4">{lockSlot}</div>
      ) : null}

      {empty ? (
        <Card className="px-4 py-6 text-center text-[15px] text-ink-3">
          Nothing on the house guide yet
        </Card>
      ) : null}

      {guide.groups.length ? (
        <Section title="In an Emergency">
          <div className="flex flex-col gap-5">
            {guide.groups.map((g) => (
              <div key={g.id ?? "other"} className="flex flex-col gap-3">
                {/* One group with no system needs no heading. */}
                {guide.groups.length > 1 || g.id ? (
                  <h3 className="flex items-center gap-2 px-1 text-[15px] font-semibold text-ink">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <Icon name={systemIcon(g.icon)} className="h-4 w-4" />
                    </span>
                    {g.name}
                  </h3>
                ) : null}
                {g.fixtures.map((t) => (
                  <FixtureCard key={t.id} t={t} fileBase={fileBase} />
                ))}
                {g.calls.length ? (
                  <div className="flex flex-wrap gap-2">
                    {g.calls.map((c) => (
                      <a
                        key={c.id}
                        href={telHref(c.phone)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-[15px] font-medium text-accent-ink hover:bg-accent-strong"
                      >
                        <Icon name="phone" className="h-4 w-4" />
                        Call {c.name}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {guide.contacts.length ? (
        <Section title="Who to Call">
          <Card>
            <ul className="divide-y divide-line">
              {guide.contacts.map((p) => (
                <li key={p.id} className="px-4 py-3">
                  <p className="text-[15px] font-semibold text-ink">
                    {p.name}
                    {p.company ? (
                      <span className="font-normal text-ink-3">
                        {" "}
                        · {p.company}
                      </span>
                    ) : null}
                  </p>
                  {p.roles.length ? (
                    <p className="text-sm text-ink-3">{p.roles.join(", ")}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.phones.map((ph, i) => (
                      <a
                        key={i}
                        href={telHref(ph.value)}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-[15px] font-medium text-accent-ink hover:bg-accent-strong"
                      >
                        <Icon name="phone" className="h-4 w-4" />
                        {ph.value}
                        {ph.label ? <span>({ph.label})</span> : null}
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      {guide.secrets.length ? (
        <Section title="Codes">
          <Card>
            <ul className="divide-y divide-line">
              {guide.secrets.map((s) => (
                <li key={s.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Icon
                      name={KIND_ICON[s.kind]}
                      className="h-[18px] w-[18px]"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-ink">
                      {s.kind === "wifi" && s.ssid
                        ? `Wi-Fi: ${s.ssid}`
                        : s.label}
                    </p>
                    {s.value !== undefined ? (
                      <p className="mt-0.5 select-all break-all font-mono text-[17px] text-ink">
                        {s.value || "(none)"}
                      </p>
                    ) : s.error ? (
                      <p className="text-sm text-danger">{s.error}</p>
                    ) : (
                      <p className="text-sm text-ink-3">
                        Hidden; shown at the house or with the PIN
                      </p>
                    )}
                    {s.notes ? (
                      <p className="mt-1 text-sm text-ink-2">{s.notes}</p>
                    ) : null}
                  </div>
                  {qrs.has(s.id) ? (
                    <div
                      className="h-24 w-24 shrink-0 rounded bg-white p-1 [&_svg]:h-full [&_svg]:w-full"
                      title="Scan to Join Wi-Fi"
                      dangerouslySetInnerHTML={{ __html: qrs.get(s.id)! }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      {guide.sections.map((s) => (
        <Section key={s.id} title={s.title}>
          <Card className="px-4 py-3">
            {s.hidden ? (
              <p className="flex items-center gap-2 text-sm text-ink-3">
                <Pill tone="warn">Private</Pill> Shown at the house or with PIN
              </p>
            ) : (
              <p className="whitespace-pre-wrap text-[15px] text-ink-2">
                {s.body}
              </p>
            )}
          </Card>
        </Section>
      ))}
    </div>
  );
}
