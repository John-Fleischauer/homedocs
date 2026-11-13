import { randomUUID } from "node:crypto";
import type { ActorContext, PropertyScope, Role } from "../../lib/core/types";
import { properties, users } from "../../lib/db/schema";
import { seedSystems } from "../../lib/systems/systems";
import { db } from "./db";

export async function makeUser(
  role: Role = "admin",
  email = `${randomUUID()}@example.test`,
) {
  const [user] = await db
    .insert(users)
    .values({ email, displayName: `Test ${role}`, passwordHash: "x", role })
    .returning();
  return user!;
}

export async function makeProperty(
  name = "Test house",
): Promise<PropertyScope & { id: string }> {
  const [row] = await db.insert(properties).values({ name }).returning();
  await seedSystems(db, row!.id, null);
  return { id: row!.id, propertyId: row!.id };
}

export function actorFor(
  user: { id: string; role: Role },
  source: ActorContext["source"] = "web",
): ActorContext {
  return { userId: user.id, role: user.role, source, requestId: randomUUID() };
}

/** An admin, a member, a viewer and a home — what most tests need. */
export async function household() {
  const scope = await makeProperty();
  const admin = await makeUser("admin");
  const member = await makeUser("member");
  const viewer = await makeUser("viewer");
  return {
    scope,
    admin: actorFor(admin),
    member: actorFor(member),
    viewer: actorFor(viewer),
    users: { admin, member, viewer },
  };
}
