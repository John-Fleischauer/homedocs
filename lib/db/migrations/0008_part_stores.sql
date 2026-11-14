ALTER TABLE "supplies" ADD COLUMN "stores" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- A part's one "where to buy" link becomes its first store. The retailer is
-- left blank: the app names a known one from the link's host
-- (lib/parts/retailers.ts), and how it's bought isn't known, so either.
UPDATE "supplies" SET "stores" = jsonb_build_array(jsonb_build_object('retailer', '', 'url', "buy_url", 'how', 'either')) WHERE "buy_url" <> '';
