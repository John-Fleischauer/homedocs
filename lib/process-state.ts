/*
 * In-memory state that has to survive the bundler, not just the process.
 *
 * A module-level `const queue = new Map()` is the obvious way to hold something
 * for the length of a process, and in a Next build it is wrong in a way nothing
 * catches. Next compiles server code in layers — a Server Component or Server
 * Action is one, a Route Handler under `app/api/` is another, `instrumentation`
 * is a third — and the same source file compiled into two layers is **two
 * modules**, each with its own copy of everything at module scope. Both halves
 * typecheck, both halves have tests that pass, and at runtime one writes to a
 * Map the other will never read.
 *
 * It is worth being concrete, because the symptom is silence. In the build that
 * shipped, `lib/metadata/progress.ts` came out twice:
 *
 *   chunks/ssr/lib_metadata_…  module 385:   let b=new Map … "startPass"
 *   chunks/_03ax_ab._.js       module 68836: let t=new Map … "passProgress"
 *
 * The pass counted into the first Map; `GET /api/metadata/backlog` read the
 * second, which is empty and always was. The re-import screen showed "starting…"
 * for the whole minute a cover pass takes and gave every appearance of having
 * hung. `lib/metadata/cover-queue.ts` was split the same way, so a cover handed
 * over by a scan commit was never seen by the worker draining the queue.
 *
 * `globalThis` is the one namespace the layers share, because it is the
 * *process* rather than the bundle. So state that two entry points both need
 * goes through here and is keyed by name — which also makes the sharing legible:
 * a reader of `progress.ts` can see that the Map is deliberately not local.
 *
 * This is for progress counters and hand-off queues, and the same caveat applies
 * as before: it is one process, it is lost on restart, and nothing may depend on
 * it. Anything that must survive a restart belongs in Postgres.
 */

type Registry = Map<string, unknown>;

const holder = globalThis as unknown as { __homedocs_process_state?: Registry };

/**
 * The process-wide Map registered under `name`, created on first ask.
 *
 * Call it at module scope and use the result exactly like a local Map. Every
 * copy of the calling module — however many layers it was compiled into — gets
 * the same one.
 */
export function processMap<V>(name: string): Map<string, V> {
  const registry = (holder.__homedocs_process_state ??= new Map());

  const existing = registry.get(name);
  if (existing) return existing as Map<string, V>;

  const created = new Map<string, V>();
  registry.set(name, created);
  return created;
}
