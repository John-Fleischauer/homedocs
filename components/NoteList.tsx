import { List, Row } from "./ui/Card";
import type { NoteRow } from "@/lib/notes/notes";
import { formatDay, formatQty } from "@/lib/web/format";

export function NoteList({ rows }: { rows: NoteRow[] }) {
  return (
    <List>
      {rows.map(({ note, fixtureName, spaceName, supplyName }) => (
        <Row
          key={note.id}
          href={`/notes/${note.id}`}
          icon="note"
          title={note.title}
          detail={[
            formatDay(note.happenedOn),
            formatQty(note.quantity, note.unit),
            note.nextTime
              ? `Next Time: ${note.nextTime}`
              : (fixtureName ?? supplyName ?? spaceName),
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      ))}
    </List>
  );
}
