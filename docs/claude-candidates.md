# Candidate rules

Rules an agent thinks this project should have. **Not binding.** John promotes a candidate into
CLAUDE.md, rewrites it, or deletes it. Append; don't edit others' entries.

Format:

```
## YYYY-MM-DD — <rule, one line>
Why: <what goes wrong without it>
From: <PR or issue>
```

## 2026-11-12 — A server action's first statement hands its input to `act()` with a zod schema; a form posting to one says what happens on reset
Why: an action is a public endpoint, and a form React resets after a refusal loses what was typed. `test/action-guards.test.ts` checks both from the source.
From: Phase 3 (a), server actions
