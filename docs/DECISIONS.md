# Decisions

Choices this repo made that a reader would otherwise question: why, and since when. Newest
first.

## 2026-11-12: A sign-on that matches nobody gets no access until an admin places it

**Before:** a single sign-on that matched no account created one with `OIDC_DEFAULT_ROLE` (viewer
unless set), and on an empty house the first one became the admin. A viewer can reveal the
house's codes in the app, so who reached the house was decided only by the identity provider's
group restriction.

**Now** (the standards' security.md, Sign-in with OIDC; John's answer to the conformance plan's
question 8, as the other apps do):

- **Matching is unchanged:** by identity first, then a one-time link by verified (or
  `OIDC_TRUST_EMAIL`) address, never a re-link; a removed account refuses by identity or address.
- **No match:** an account is created with `users.awaiting_placement = true` (role `viewer` only
  because the column needs one), audited, and **no session is started**. The login page says
  they're waiting.
- **Nothing resolves for it:** `resolveSession`, `resolveBearer` and refresh-token rotation refuse
  an awaiting account as they refuse a removed one, and no password reset can be made for it, so
  nothing in the house (the codes included) is reachable through it even if a credential existed.
- **An admin places it** under Awaiting Placement on the Family page: Let In with a role
  (`OIDC_DEFAULT_ROLE` is the suggestion), or Remove (a soft delete, so the next sign-on is refused
  as removed). Each is audited. Add Person can still bring a removed one back.
- **The first account is made only at `/setup`.** A sign-on on a house with no accounts is sent
  there. Under `OIDC_ONLY`, set up with a password, then sign on with the same address to link.
- **The provider's group restriction stays a deployment requirement** (docs/DEPLOYMENT.md): it
  decides who can get onto the list at all.

**Existing accounts are unaffected:** the column was added with `default false` and nothing was
backfilled, so every account that existed, including ones an earlier sign-on created with access,
keeps its role, sessions and connector tokens.
