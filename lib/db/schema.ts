/*
 * The schema. Read docs/DATA-MODEL.md first; this file is the what, that is the why.
 *
 * Conventions every domain table follows:
 *   - uuid primary keys, `created_at`/`updated_at`, and `created_by`/`updated_by`
 *     so a record can say who last touched it ("Edited by Mom, 2 days ago").
 *   - Soft delete via `deleted_at`. Nothing a family member does is unrecoverable;
 *     "Recently deleted" restores it. Only an admin purges.
 *   - Every top-level table carries a non-null `property_id`, and the domain layer
 *     takes a PropertyScope so a query cannot forget it. There is one property
 *     today; the column is what keeps a second one cheap.
 *   - Rows that hang off "one of several owners" (attachments, external refs,
 *     part uses) use one nullable FK column per owner with a `num_nonnulls(...) = 1`
 *     check, never an `owner_type/owner_id` pair: real foreign keys, real cascades,
 *     and a typo is a compile error rather than an orphan.
 */

import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

/** Postgres full-text vector. Rebuilt in app code — see lib/search/rebuild.ts. */
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector'
  },
})

// ─── enums ───────────────────────────────────────────────────────────────────

export const userRole = pgEnum('user_role', ['admin', 'member', 'viewer'])
export const auditSource = pgEnum('audit_source', ['web', 'mcp', 'system', 'guide'])
export const spaceKind = pgEnum('space_kind', ['floor', 'room', 'outdoor', 'area', 'other'])
export const supplyCategory = pgEnum('supply_category', [
  'bulb',
  'paint',
  'filter',
  'battery',
  'landscaping',
  'other',
])
export const projectStatus = pgEnum('project_status', [
  'idea',
  'planning',
  'quoted',
  'scheduled',
  'in_progress',
  'done',
  'dropped',
])
export const projectPriority = pgEnum('project_priority', ['low', 'normal', 'high'])
export const quoteStatus = pgEnum('quote_status', ['pending', 'accepted', 'declined'])
export const secretKind = pgEnum('secret_kind', ['wifi', 'alarm', 'lockbox', 'gate', 'other'])
/** `always`: shown to any guide viewer. `home_or_pin`: at home, or after the link's PIN. */
export const secretGate = pgEnum('secret_gate', ['always', 'home_or_pin'])
export const inviteKind = pgEnum('invite_kind', ['invite', 'reset'])
export const externalSystem = pgEnum('external_system', ['homebox', 'paperless', 'homeassistant'])
export const externalStatus = pgEnum('external_status', ['ok', 'missing', 'auth_error'])

// ─── shared columns ──────────────────────────────────────────────────────────

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

const authored = {
  ...timestamps,
  createdBy: uuid('created_by').references((): AnyPgColumn => users.id),
  updatedBy: uuid('updated_by').references((): AnyPgColumn => users.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}

const propertyId = () =>
  uuid('property_id')
    .notNull()
    .references((): AnyPgColumn => properties.id)

// ─── accounts ────────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    /** Null for an account that only ever signs in with single sign-on. */
    passwordHash: text('password_hash'),
    role: userRole('role').notNull().default('member'),
    oidcIssuer: text('oidc_issuer'),
    oidcSubject: text('oidc_subject'),
    ...timestamps,
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('users_email_live').on(sql`lower(${t.email})`).where(sql`${t.deletedAt} is null`),
    uniqueIndex('users_oidc_identity').on(t.oidcIssuer, t.oidcSubject),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    /** HMAC of the cookie token; the token itself is never stored. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
    ip: text('ip'),
  },
  (t) => [index('sessions_user').on(t.userId)],
)

/**
 * Single-use links an admin hands to a family member: `invite` creates an
 * account with the given role, `reset` sets a new password on an existing one.
 */
export const invites = pgTable('invites', {
  /** HMAC of the link token. */
  id: text('id').primaryKey(),
  kind: inviteKind('kind').notNull(),
  role: userRole('role').notNull().default('member'),
  /** For `reset`: whose password. */
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  /** A label so the admin can tell outstanding invites apart ("Mom"). */
  label: text('label').notNull().default(''),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  usedBy: uuid('used_by').references(() => users.id),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    /** Null for a guide viewer (a share link has no account). */
    actorUserId: uuid('actor_user_id').references(() => users.id),
    source: auditSource('source').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    requestId: uuid('request_id').notNull(),
    clientId: text('client_id'),
  },
  (t) => [index('audit_entity').on(t.entityType, t.entityId), index('audit_at').on(t.at)],
)

// ─── property ────────────────────────────────────────────────────────────────

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** Sensitive: shown to signed-in family and on the guide, never in previews. */
  address: text('address').notNull().default(''),
  /**
   * What "at home" means for the guide's location gate: LAN CIDRs (which also
   * covers NAT hairpin) and a DDNS hostname whose A/AAAA records are the home's
   * WAN address. See lib/guide/location.ts.
   */
  homeNetworks: text('home_networks').array().notNull().default(sql`'{}'::text[]`),
  homeHostname: text('home_hostname').notNull().default(''),
  /**
   * The family's list of what a contact can do, grouped as the contact form
   * shows it; null until they change it, meaning DEFAULT_TRADE_GROUPS. Labels
   * keep their casing ("HVAC"); contact_trades stores them lower-cased.
   */
  tradeGroups: jsonb('trade_groups').$type<{ label: string; trades: string[] }[]>(),
  ...authored,
})

// ─── places, fixtures, parts ───────────────────────────────────────────────────

export const spaces = pgTable(
  'spaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    parentId: uuid('parent_id').references((): AnyPgColumn => spaces.id),
    name: text('name').notNull(),
    kind: spaceKind('kind').notNull().default('room'),
    notes: text('notes').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    searchDoc: tsvector('search_doc'),
    ...authored,
  },
  (t) => [
    index('spaces_parent').on(t.propertyId, t.parentId),
    index('spaces_search').using('gin', t.searchDoc),
    index('spaces_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
)

/** "Fixture": something installed — a light, a valve, a system — that is not inventory. */
export const fixtures = pgTable(
  'fixtures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    /** Null means the whole house ("Main water shutoff" may not belong to a room). */
    spaceId: uuid('space_id').references(() => spaces.id),
    /** Its one system: the water heater is Water even though it burns gas. */
    systemId: uuid('system_id').references((): AnyPgColumn => systems.id),
    name: text('name').notNull(),
    category: text('category').notNull().default(''),
    notes: text('notes').notNull().default(''),
    /** Shown on the house guide's emergency card. */
    inGuide: boolean('in_guide').notNull().default(false),
    /** What a housesitter needs to know: "Turn clockwise to close". */
    guideNote: text('guide_note').notNull().default(''),
    searchDoc: tsvector('search_doc'),
    ...authored,
  },
  (t) => [
    index('fixtures_space').on(t.propertyId, t.spaceId),
    index('fixtures_system').on(t.propertyId, t.systemId),
    index('fixtures_search').using('gin', t.searchDoc),
    index('fixtures_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
)

/**
 * "System": one part of how the house works — water, electrical, heating.
 * The second way in beside places, and how the guide hands the house over
 * ("Water: main shutoff, water heater, call Ace Plumbing"). Seeded per property
 * (lib/systems/systems.ts); the family can rename, add or delete them.
 */
export const systems = pgTable(
  'systems',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    /** The seed it came from ("water"), so the seed list is not re-added; null for the family's own. */
    seedKey: text('seed_key'),
    name: text('name').notNull(),
    icon: text('icon').notNull().default('system'),
    /** Contact trades whose preferred contact is "who to call" for it: plumber, water & sewer. */
    trades: text('trades').array().notNull().default(sql`'{}'::text[]`),
    notes: text('notes').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    searchDoc: tsvector('search_doc'),
    ...authored,
  },
  (t) => [
    index('systems_property').on(t.propertyId, t.sort),
    uniqueIndex('systems_seed').on(t.propertyId, t.seedKey),
    index('systems_search').using('gin', t.searchDoc),
  ],
)

/** "Part": a reusable spec — defined once, used by many fixtures and places. */
export const supplies = pgTable(
  'supplies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    category: supplyCategory('category').notNull().default('other'),
    name: text('name').notNull(),
    /** Validated by the category's template — lib/parts/templates.ts. */
    fields: jsonb('fields').$type<Record<string, string>>().notNull().default({}),
    /** The default unit a use or a note counts in: bag, gal, bulb. */
    unit: text('unit').notNull().default(''),
    /** Other units it is sold by: pine straw comes by the roll *and* the bale. */
    extraUnits: text('extra_units').array().notNull().default(sql`'{}'::text[]`),
    buyUrl: text('buy_url').notNull().default(''),
    notes: text('notes').notNull().default(''),
    searchDoc: tsvector('search_doc'),
    ...authored,
  },
  (t) => [
    index('supplies_property').on(t.propertyId, t.category),
    index('supplies_search').using('gin', t.searchDoc),
    index('supplies_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
)

/** Where a part is used: by exactly one fixture or one place. */
export const supplyUses = pgTable(
  'supply_uses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    supplyId: uuid('supply_id')
      .notNull()
      .references(() => supplies.id),
    fixtureId: uuid('fixture_id').references(() => fixtures.id),
    spaceId: uuid('space_id').references(() => spaces.id),
    /** "walls", "trim", "front bed". Empty when there is only one use. */
    surface: text('surface').notNull().default(''),
    /** Paint sheen lives here, per use: one colour, eggshell walls, semi-gloss trim. */
    finish: text('finish').notNull().default(''),
    quantity: numeric('quantity', { precision: 12, scale: 2 }),
    unit: text('unit').notNull().default(''),
    /** What it *really* takes — the "we needed 3 more bags" figure. */
    quantityNeeded: numeric('quantity_needed', { precision: 12, scale: 2 }),
    notes: text('notes').notNull().default(''),
    ...authored,
  },
  (t) => [
    check('supply_uses_one_owner', sql`num_nonnulls(${t.fixtureId}, ${t.spaceId}) = 1`),
    uniqueIndex('supply_uses_unique_live')
      .on(t.supplyId, sql`coalesce(${t.fixtureId}, ${t.spaceId})`, t.surface)
      .where(sql`${t.deletedAt} is null`),
    index('supply_uses_fixture').on(t.fixtureId),
    index('supply_uses_space').on(t.spaceId),
    index('supply_uses_supply').on(t.supplyId),
  ],
)

// ─── contacts ──────────────────────────────────────────────────────────────────

export type ContactMethod = { label: string; value: string }

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    name: text('name').notNull(),
    company: text('company').notNull().default(''),
    phones: jsonb('phones').$type<ContactMethod[]>().notNull().default([]),
    emails: jsonb('emails').$type<ContactMethod[]>().notNull().default([]),
    website: text('website').notNull().default(''),
    notes: text('notes').notNull().default(''),
    /** Utility or service account number. Never shown on the guide. */
    accountNumber: text('account_number').notNull().default(''),
    inGuide: boolean('in_guide').notNull().default(false),
    searchDoc: tsvector('search_doc'),
    ...authored,
  },
  (t) => [
    index('contacts_property').on(t.propertyId),
    index('contacts_search').using('gin', t.searchDoc),
    index('contacts_name_trgm').using('gin', sql`${t.name} gin_trgm_ops`),
  ],
)

/** A trade per row, so "our plumber" is the preferred plumber, per trade. */
export const contactTrades = pgTable(
  'contact_trades',
  {
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    /** Lower-cased: plumber, electrician, hvac. */
    trade: text('trade').notNull(),
    preferred: boolean('preferred').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.trade] }), index('contact_trades_trade').on(t.trade)],
)

// ─── projects ────────────────────────────────────────────────────────────────

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    title: text('title').notNull(),
    status: projectStatus('status').notNull().default('idea'),
    priority: projectPriority('priority').notNull().default('normal'),
    targetDate: date('target_date'),
    summary: text('summary').notNull().default(''),
    /** The recurring job this is one round of: "Back yard pine straw". */
    seriesId: uuid('series_id').references((): AnyPgColumn => projectSeries.id),
    /** Who is doing it. Starts as the series' usual contact. */
    contactId: uuid('contact_id').references(() => contacts.id),
    searchDoc: tsvector('search_doc'),
    ...authored,
  },
  (t) => [
    index('projects_property').on(t.propertyId, t.status),
    index('projects_series').on(t.seriesId),
    index('projects_search').using('gin', t.searchDoc),
  ],
)

export const projectSpaces = pgTable(
  'project_spaces',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.spaceId] })],
)

export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    contactId: uuid('contact_id').references(() => contacts.id),
    amount: numeric('amount', { precision: 12, scale: 2 }),
    receivedOn: date('received_on'),
    status: quoteStatus('status').notNull().default('pending'),
    notes: text('notes').notNull().default(''),
    ...authored,
  },
  (t) => [index('quotes_project').on(t.projectId)],
)

export const projectItems = pgTable(
  'project_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    text: text('text').notNull(),
    done: boolean('done').notNull().default(false),
    spaceId: uuid('space_id').references(() => spaces.id),
    /** Which quote covers this item, if any. */
    quoteId: uuid('quote_id').references(() => quotes.id),
    /** The series item this was copied from; what "differs from the series" compares against. */
    seriesItemId: uuid('series_item_id').references((): AnyPgColumn => projectSeriesItems.id),
    /** "Only this project": never offered back to the series. */
    oneOff: boolean('one_off').notNull().default(false),
    sort: integer('sort').notNull().default(0),
    ...authored,
  },
  (t) => [index('project_items_project').on(t.projectId)],
)

/**
 * "Series": a job done again and again — mulching the front bed every spring.
 * It holds the defaults each new round starts from (places, checklist,
 * materials, who usually does it) and the one "how we do it" text every round
 * shows. A round can send its changes back, one row at a time, after asking.
 */
export const projectSeries = pgTable(
  'project_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    title: text('title').notNull(),
    /** Shown on every project in the series, never copied, so it cannot drift. */
    howTo: text('how_to').notNull().default(''),
    contactId: uuid('contact_id').references(() => contacts.id),
    searchDoc: tsvector('search_doc'),
    ...authored,
  },
  (t) => [
    index('project_series_property').on(t.propertyId),
    index('project_series_search').using('gin', t.searchDoc),
  ],
)

export const projectSeriesSpaces = pgTable(
  'project_series_spaces',
  {
    seriesId: uuid('series_id')
      .notNull()
      .references(() => projectSeries.id, { onDelete: 'cascade' }),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.seriesId, t.spaceId] })],
)

/** The checklist a new project in the series starts with. */
export const projectSeriesItems = pgTable(
  'project_series_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => projectSeries.id),
    text: text('text').notNull(),
    spaceId: uuid('space_id').references(() => spaces.id),
    sort: integer('sort').notNull().default(0),
    ...authored,
  },
  (t) => [index('project_series_items_series').on(t.seriesId)],
)

/**
 * "Material": one line of what a job takes — 8 rolls of pine straw around the
 * stairs. On a series it is the default; on a project, what this round took.
 */
export const materials = pgTable(
  'materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    seriesId: uuid('series_id').references(() => projectSeries.id),
    projectId: uuid('project_id').references(() => projects.id),
    name: text('name').notNull(),
    /** Optional: the part it is. Its name and units fill in the line. */
    supplyId: uuid('supply_id').references(() => supplies.id),
    quantity: numeric('quantity', { precision: 12, scale: 2 }),
    unit: text('unit').notNull().default(''),
    spaceId: uuid('space_id').references(() => spaces.id),
    /** "around the stairs", "1 roll covers about 50 sq ft". */
    notes: text('notes').notNull().default(''),
    /** On a project: the series line it was copied from. */
    seriesMaterialId: uuid('series_material_id').references((): AnyPgColumn => materials.id),
    /** On a project: "only this project", never offered back to the series. */
    oneOff: boolean('one_off').notNull().default(false),
    sort: integer('sort').notNull().default(0),
    ...authored,
  },
  (t) => [
    check('materials_one_owner', sql`num_nonnulls(${t.seriesId}, ${t.projectId}) = 1`),
    check('materials_series_rows_plain', sql`${t.seriesId} is null or (not ${t.oneOff} and ${t.seriesMaterialId} is null)`),
    index('materials_series').on(t.seriesId),
    index('materials_project').on(t.projectId),
    index('materials_supply').on(t.supplyId),
  ],
)

// ─── notes (logs) ────────────────────────────────────────────────────────────

/** "Note": a dated record of something that happened, with a "next time" lesson. */
export const logs = pgTable(
  'logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    happenedOn: date('happened_on').notNull().default(sql`current_date`),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    spaceId: uuid('space_id').references(() => spaces.id),
    fixtureId: uuid('fixture_id').references(() => fixtures.id),
    supplyId: uuid('supply_id').references(() => supplies.id),
    contactId: uuid('contact_id').references(() => contacts.id),
    projectId: uuid('project_id').references(() => projects.id),
    quantity: numeric('quantity', { precision: 12, scale: 2 }),
    unit: text('unit').notNull().default(''),
    cost: numeric('cost', { precision: 12, scale: 2 }),
    /** The lesson for next time: "we needed 3 more bags". */
    nextTime: text('next_time').notNull().default(''),
    /** When "next time" is: shown on Home within ±30 days of this date. */
    remindAfter: date('remind_after'),
    searchDoc: tsvector('search_doc'),
    ...authored,
  },
  (t) => [
    index('logs_property_date').on(t.propertyId, t.happenedOn),
    index('logs_remind').on(t.propertyId, t.remindAfter),
    index('logs_space').on(t.spaceId),
    index('logs_fixture').on(t.fixtureId),
    index('logs_supply').on(t.supplyId),
    index('logs_contact').on(t.contactId),
    index('logs_project').on(t.projectId),
    index('logs_search').using('gin', t.searchDoc),
  ],
)

// ─── house guide ─────────────────────────────────────────────────────────────

/** Free text only — the emergency card is generated from fixtures and contacts. */
export const guideSections = pgTable('guide_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: propertyId(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  /** Gated like a secret: at home, or after the link's PIN. */
  sensitive: boolean('sensitive').notNull().default(false),
  sort: integer('sort').notNull().default(0),
  ...authored,
})

/** Wi-Fi, alarm and lockbox codes. The value is encrypted at rest. */
export const secrets = pgTable('secrets', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: propertyId(),
  kind: secretKind('kind').notNull().default('other'),
  label: text('label').notNull(),
  /** AES-256-GCM under INTEGRATIONS_KEY — lib/crypto/sealed.ts. */
  sealedValue: text('sealed_value').notNull(),
  /** Not secret: SSID and security type for the Wi-Fi QR code. */
  meta: jsonb('meta').$type<Record<string, string>>().notNull().default({}),
  gate: secretGate('gate').notNull().default('home_or_pin'),
  inGuide: boolean('in_guide').notNull().default(true),
  notes: text('notes').notNull().default(''),
  sort: integer('sort').notNull().default(0),
  ...authored,
})

export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    /** HMAC of the 256-bit link token. */
    tokenHash: text('token_hash').notNull(),
    label: text('label').notNull(),
    /** Limit the guide to one part of the property (one building, the yard). */
    rootSpaceId: uuid('root_space_id').references(() => spaces.id),
    /** Argon2 hash of the PIN that unlocks gated content away from home. */
    pinHash: text('pin_hash'),
    pinFailures: integer('pin_failures').notNull().default(0),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('share_links_token').on(t.tokenHash)],
)

export const shareLinkViews = pgTable(
  'share_link_views',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    shareLinkId: uuid('share_link_id')
      .notNull()
      .references(() => shareLinks.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    atHome: boolean('at_home').notNull().default(false),
    /** What happened: view, unlock, pin_failed, locked. */
    event: text('event').notNull().default('view'),
  },
  (t) => [index('share_link_views_link').on(t.shareLinkId, t.at)],
)

// ─── attachments and external references ─────────────────────────────────────

/** Photos and files. The bytes live on disk by content hash — lib/files/store.ts. */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    sha256: text('sha256').notNull(),
    mime: text('mime').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width'),
    height: integer('height'),
    originalName: text('original_name').notNull().default(''),
    caption: text('caption').notNull().default(''),
    sort: integer('sort').notNull().default(0),
    spaceId: uuid('space_id').references(() => spaces.id),
    fixtureId: uuid('fixture_id').references(() => fixtures.id),
    supplyId: uuid('supply_id').references(() => supplies.id),
    logId: uuid('log_id').references(() => logs.id),
    contactId: uuid('contact_id').references(() => contacts.id),
    projectId: uuid('project_id').references(() => projects.id),
    quoteId: uuid('quote_id').references(() => quotes.id),
    systemId: uuid('system_id').references(() => systems.id),
    ...authored,
  },
  (t) => [
    check(
      'attachments_one_owner',
      sql`num_nonnulls(${t.spaceId}, ${t.fixtureId}, ${t.supplyId}, ${t.logId}, ${t.contactId}, ${t.projectId}, ${t.quoteId}, ${t.systemId}) = 1`,
    ),
    index('attachments_sha').on(t.sha256),
    index('attachments_space').on(t.spaceId),
    index('attachments_fixture').on(t.fixtureId),
    index('attachments_supply').on(t.supplyId),
    index('attachments_log').on(t.logId),
    index('attachments_contact').on(t.contactId),
    index('attachments_project').on(t.projectId),
    index('attachments_quote').on(t.quoteId),
    index('attachments_system').on(t.systemId),
  ],
)

/** A link to a record in Homebox, paperless-ngx or Home Assistant. */
export const externalRefs = pgTable(
  'external_refs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    system: externalSystem('system').notNull(),
    externalId: text('external_id').notNull(),
    url: text('url').notNull(),
    title: text('title').notNull().default(''),
    subtitle: text('subtitle').notNull().default(''),
    status: externalStatus('status').notNull().default('ok'),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    spaceId: uuid('space_id').references(() => spaces.id),
    fixtureId: uuid('fixture_id').references(() => fixtures.id),
    supplyId: uuid('supply_id').references(() => supplies.id),
    logId: uuid('log_id').references(() => logs.id),
    contactId: uuid('contact_id').references(() => contacts.id),
    projectId: uuid('project_id').references(() => projects.id),
    quoteId: uuid('quote_id').references(() => quotes.id),
    /** A house system (Water & plumbing) — not to be confused with `system`, the other app. */
    systemId: uuid('system_id').references(() => systems.id),
    ...authored,
  },
  (t) => [
    check(
      'external_refs_one_owner',
      sql`num_nonnulls(${t.spaceId}, ${t.fixtureId}, ${t.supplyId}, ${t.logId}, ${t.contactId}, ${t.projectId}, ${t.quoteId}, ${t.systemId}) = 1`,
    ),
    index('external_refs_lookup').on(t.system, t.externalId),
    index('external_refs_fixture').on(t.fixtureId),
    index('external_refs_supply').on(t.supplyId),
    index('external_refs_space').on(t.spaceId),
    index('external_refs_owner_project').on(t.projectId),
    index('external_refs_owner_contact').on(t.contactId),
    index('external_refs_owner_system').on(t.systemId),
  ],
)

// ─── OAuth (MCP connectors) ─────────────────────────────────────────────────

export const oauthTokenKind = pgEnum('oauth_token_kind', ['access', 'refresh'])
export const oauthRegistrationSource = pgEnum('oauth_registration_source', ['dcr', 'manual'])

export const oauthClients = pgTable('oauth_clients', {
  id: text('id').primaryKey(),
  clientName: text('client_name').notNull(),
  logoUri: text('logo_uri'),
  /* An allowlist, checked exactly. No prefix matching, no wildcards. */
  redirectUris: text('redirect_uris').array().notNull(),
  registrationSource: oauthRegistrationSource('registration_source').notNull().default('dcr'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
})

export const oauthAuthorizationCodes = pgTable('oauth_authorization_codes', {
  codeHash: text('code_hash').primaryKey(),
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  scope: text('scope').notNull(),
  resource: text('resource'),
  codeChallenge: text('code_challenge').notNull(),
  codeChallengeMethod: text('code_challenge_method').notNull().default('S256'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /* Single-use; a second exchange revokes the whole grant. */
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
})

export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    kind: oauthTokenKind('kind').notNull(),
    clientId: text('client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    resource: text('resource'),
    /* Refresh rotation chain — reuse of a rotated token revokes the chain. */
    parentId: uuid('parent_id').references((): AnyPgColumn => oauthTokens.id),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('oauth_tokens_hash_key').on(t.tokenHash),
    index('oauth_tokens_user_idx').on(t.userId),
    index('oauth_tokens_client_idx').on(t.clientId),
  ],
)

// ─── integrations ────────────────────────────────────────────────────────────

/** A connection to Homebox or paperless-ngx, for live lookups. The token is sealed. */
export const integrations = pgTable(
  'integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: propertyId(),
    system: externalSystem('system').notNull(),
    baseUrl: text('base_url').notNull(),
    /** AES-256-GCM under INTEGRATIONS_KEY — lib/crypto/sealed.ts. */
    sealedToken: text('sealed_token').notNull(),
    /** What the last "test connection" found: a version, a document count, or the error. */
    lastStatus: text('last_status').notNull().default(''),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    /**
     * paperless only: tags every document homedocs lists must also have — the
     * house's own tag, so "Plumbing" shows this house's plumbing and not the
     * last one's.
     */
    requiredTags: jsonb('required_tags').$type<{ id: number; name: string }[]>().notNull().default([]),
    ...timestamps,
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [uniqueIndex('integrations_property_system').on(t.propertyId, t.system)],
)
