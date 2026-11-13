import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Names wrap, never truncate (standards design.md, Layout): a name is often
 * what tells two similar rows apart, and an ellipsis hides exactly the part
 * that differs. A wrapping name gets `wrap-anywhere`, and `min-w-0` in a flex
 * or grid row.
 */

/* A class in a string (quotes, backticks or a space either side), so the word
   in a comment's prose doesn't count. Arbitrary values (`line-clamp-[3]`)
   included. */
const CLASS =
  /(?:^|['"`\s])(truncate|text-ellipsis|line-clamp-[\w[\]]+)(?=$|['"`\s])/;
const CSS =
  /text-overflow:\s*ellipsis|-webkit-line-clamp|@apply[^;]*\b(truncate|line-clamp)/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx?|css)$/.test(path) ? [path] : [];
  });
}

/* Comments blanked out, line breaks kept, so the line numbers still point at
   the source. */
function code(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}

describe("names wrap", () => {
  it("no component truncates text", () => {
    const offenders = [
      ...sources("app"),
      ...sources("components"),
      ...sources("lib"),
    ].flatMap((path) =>
      code(readFileSync(path, "utf8"))
        .split("\n")
        .flatMap((line, i) => {
          const banned = path.endsWith(".css")
            ? CSS.test(line)
            : CLASS.test(line);
          return banned ? [`${path}:${i + 1}: ${line.trim()}`] : [];
        }),
    );
    expect(offenders).toEqual([]);
  });
});
