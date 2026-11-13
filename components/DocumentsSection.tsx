import { db } from "@/lib/db";
import type { Owner } from "@/lib/files/attachments";
import { documentsFor } from "@/lib/integrations/integrations";
import type { PaperlessFilterKind } from "@/lib/integrations/clients";
import { linkPickedAction, removeLinkAction } from "@/lib/web/link-actions";
import { viewer } from "@/lib/web/context";
import { DeleteButton } from "./DeleteButton";
import { LinkPicker } from "./LinkPicker";
import { LinkThumb } from "./LinkThumb";
import { List, Pill, Section } from "./ui/Card";
import { Icon } from "./ui/icons";

/*
 * A record's paperless documents in one list: the ones linked to it one by
 * one, then everything filed under its tag (a place, project or system) or
 * correspondent (a contact). Filing in paperless is the only upkeep for the
 * second kind; the first is for a manual or receipt that belongs here alone.
 * `kind` is left out for records that don't follow a tag (fixtures, parts,
 * notes). Nothing shows when there is nothing to list and paperless isn't
 * connected.
 */
const KIND_LABEL: Record<PaperlessFilterKind, string> = {
  tag: "Tag",
  correspondent: "Correspondent",
};

export async function DocumentsSection({
  owner,
  kind,
  canEdit,
}: {
  owner: Owner;
  kind?: PaperlessFilterKind;
  canEdit: boolean;
}) {
  const { scope } = await viewer();
  const { connected, documents, filter } = await documentsFor(
    db,
    scope,
    owner,
    kind,
  );
  if (!documents.length && !filter && !(canEdit && connected)) return null;
  const link = linkPickedAction.bind(null, `${owner.kind}:${owner.id}`);

  return (
    <Section
      title="Documents"
      action={
        filter ? (
          <a
            href={filter.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-10 items-center gap-1 px-1 text-sm text-accent"
          >
            Open {kind ? KIND_LABEL[kind] : null}{" "}
            <Icon name="external" className="h-4 w-4" />
          </a>
        ) : null
      }
    >
      <div className="flex flex-col gap-3">
        {documents.length ? (
          <List>
            {documents.map((d) => (
              <li
                key={d.externalId}
                className="flex min-h-14 items-center gap-3 px-4 py-2"
              >
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <LinkThumb
                    src={
                      d.hasThumb
                        ? `/api/ext/paperless/${d.externalId}/thumb`
                        : null
                    }
                  />
                  <span className="min-w-0">
                    <span className="block wrap-anywhere text-[15px] font-medium text-ink">
                      {d.title}
                    </span>
                    <span className="flex items-center gap-2 text-sm text-ink-3">
                      <span className="min-w-0 wrap-anywhere">
                        {d.subtitle}
                      </span>
                      {d.status === "missing" ? (
                        <Pill tone="warn">Missing</Pill>
                      ) : null}
                      {d.status === "auth_error" ? (
                        <Pill tone="warn">Reconnect</Pill>
                      ) : null}
                    </span>
                  </span>
                </a>
                {canEdit && d.linkId ? (
                  <DeleteButton
                    compact
                    what={d.title}
                    label="Remove"
                    recoverable={false}
                    action={removeLinkAction.bind(null, d.linkId)}
                  />
                ) : null}
              </li>
            ))}
          </List>
        ) : filter?.error ? null : (
          <p className="px-1 text-sm text-ink-3">No documents yet</p>
        )}

        {filter ? (
          <div className="flex min-h-10 items-center gap-2 px-1">
            <p
              className={`min-w-0 flex-1 text-sm ${filter.error ? "text-warn" : "text-ink-3"}`}
            >
              {filter.error ??
                [
                  `${kind === "correspondent" ? "Correspondent" : "Tag"}: ${filter.title}`,
                  filter.total > filter.shown
                    ? `newest ${filter.shown} of ${filter.total}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
            </p>
            {canEdit ? (
              <DeleteButton
                compact
                what={`the ${kind} ${filter.title}`}
                label="Unlink"
                recoverable={false}
                action={removeLinkAction.bind(null, filter.id)}
              />
            ) : null}
          </div>
        ) : null}

        {canEdit && connected ? (
          <LinkPicker
            systems={[
              { system: "paperless", name: "paperless", label: "Add Document" },
              ...(kind
                ? [
                    {
                      system: "paperless" as const,
                      name: "paperless",
                      kind,
                      label: filter
                        ? `Change ${KIND_LABEL[kind]}`
                        : `Add ${KIND_LABEL[kind]} Documents`,
                    },
                  ]
                : []),
            ]}
            link={link}
          />
        ) : null}
      </div>
    </Section>
  );
}
