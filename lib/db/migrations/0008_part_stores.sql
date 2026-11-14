ALTER TABLE "supplies" ADD COLUMN "stores" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- A part's one "where to buy" link becomes its first store. The retailer is
-- left blank: the app names a known one from the link's host
-- (lib/parts/retailers.ts), and how it's bought isn't known, so either.
UPDATE "supplies" SET "stores" = jsonb_build_array(jsonb_build_object('retailer', '', 'url', "buy_url", 'how', 'either')) WHERE "buy_url" <> '';
--> statement-breakpoint
-- Search finds a part by its stores (lib/search/rebuild.ts). A migration can't
-- run the app's rebuild, so the moved link's site goes in its words now
-- ("homedepot com", "lowes com"); a part saved again, or Settings' search
-- rebuild, writes the stores' full names.
UPDATE "supplies" SET "search_doc" = coalesce("search_doc", ''::tsvector) || setweight(to_tsvector('english', regexp_replace(coalesce(substring("buy_url" from '^[A-Za-z]+://(?:www\.)?([^/:?#]+)'), ''), '[.-]', ' ', 'g')), 'C') WHERE "buy_url" <> '';
