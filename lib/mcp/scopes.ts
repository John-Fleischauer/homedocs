/*
 * Authorization at the call, which is the one that counts.
 *
 * Filtering `tools/list` by scope is ergonomics — it keeps a model from planning
 * around a tool it cannot call, which is a real benefit. But a tool list is
 * client-side and can be stale: a conversation that started before a re-grant
 * narrowed its scopes is holding a list that no longer describes what it may do.
 * So the list is the first layer and this is the load-bearing one.
 *
 * And the check is the *intersection*, never the scope alone. A granted
 * homedocs:write does not let a viewer write — the authorize endpoint will not
 * even mint it, and if one ever existed (a demotion after the grant) the role
 * half refuses it here.
 */

import { type Scope, scopesForRole } from "../oauth/config";
import type { BearerIdentity } from "../oauth/grants";

export function granted(identity: BearerIdentity, scope: Scope): boolean {
  return (
    identity.scopes.includes(scope) &&
    scopesForRole(identity.role).includes(scope)
  );
}

/**
 * The message matters as much as the refusal. "Scope insufficient" with nothing
 * else leaves a model retrying the same call; naming the scope and saying that
 * reconnecting can grant it is something it can act on or report.
 */
export function refusalFor(identity: BearerIdentity, scope: Scope): string {
  if (!scopesForRole(identity.role).includes(scope)) {
    return (
      `This account does not hold ${scope}: it is a viewer account, and reconnecting will not ` +
      `change that — an admin has to change the role on the Family page.`
    );
  }
  return (
    `This connection was not granted ${scope}. Reconnect the homedocs connector and approve ` +
    `${scope} to use this tool.`
  );
}
