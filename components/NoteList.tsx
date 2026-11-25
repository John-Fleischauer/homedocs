import { List, Row } from "./ui/Card";
import type { NoteRow } from "@/lib/notes/notes";
import { formatDay, formatQty } from "@/lib/web/format";

/*
 * Log entries, newest first: when, what each was about (its fixture, else its
 * place, else its part), how much, and the lesson for next time on a line of
 * its own. `on` is the record whose page the list is on, so its rows don't
 * each repeat that record's name.
 */
export function NoteList({
  rows,
  on = {},
}: {
  rows: NoteRow[];
  on?: { spaceId?: string; fixtureId?: string; supplyId?: string };
}) {
  return (
    <List>
      {rows.map(({ note, fixtureName, spaceName, supplyName }) => {
        const about =
          (note.fixtureId !== on.fixtureId && fixtureName) ||
          (!note.fixtureId && note.spaceId !== on.spaceId && spaceName) ||
          (note.supplyId !== on.supplyId && supplyName) ||
          "";
        return (
          <Row
            key={note.id}
            href={`/notes/${note.id}`}
            icon="note"
            title={note.title}
            detail={
              <>
                {[
                  formatDay(note.happenedOn),
                  about,
                  // Kept on one line: "12" at a line's end with "bags" below reads as a date.
                  formatQty(note.quantity, note.unit).replace(" ", "\u00a0"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {note.nextTime ? (
                  <span className="block text-ink-2">
                    Next time: {note.nextTime}
                  </span>
                ) : null}
              </>
            }
          />
        );
      })}
    </List>
  );
}
