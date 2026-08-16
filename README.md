# Ladiesse Taxonomy Tool

Internal tool that AI-tags Ladiesse's Shopify catalog with structured style
attributes (body shape, occasion, vibe, skin tone), stored in Postgres so it
can feed a future AI "taste graph." Products are pulled from Shopify
automatically, then AI-tagged (`npm run ai-tag`, or the "Tag with AI" button
per product); Sinem reviews and edits from there. Tags live here, not in
Shopify, until you explicitly publish them back as metafields.

## Stack

- Next.js (App Router), plain JavaScript
- Postgres via [Neon](https://neon.tech), accessed with `pg`
- Deployed to Vercel, protected by Vercel's built-in Deployment Protection
  (no auth code in this repo — anyone with dashboard access controls who
  can reach the deployed URL)

## 1. Create a Shopify custom app

Custom apps are now created in Shopify's **Dev Dashboard** (Settings → Apps
→ "Build apps in Dev Dashboard" from the Shopify admin), not the old
in-admin flow. Create an app, request the `read_products` scope (add
`write_products` too if you want the "Publish to Shopify" metafield
write-back feature), and release the version.

Dev Dashboard apps don't expose a static Admin API token in the UI anymore
— instead you get a **Client ID** and **Client Secret** (under the app's
Settings → Credentials), which this app exchanges for a short-lived (24h)
access token itself via the OAuth client credentials grant (see
`lib/shopifyAuth.js`). Just copy those two values, no install/token-reveal
step needed.

## 2. Create a Neon Postgres project

Create a project at [neon.tech](https://neon.tech). Copy the **pooled**
connection string (the one with `-pooler` in the hostname) — this matters,
since the app opens a fresh connection per serverless invocation and the
pooled endpoint avoids exhausting Neon's connection limit.

## 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in:

| Variable | Where it comes from |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `SHOPIFY_STORE_DOMAIN` | e.g. `your-store.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | Step 1 — Dev Dashboard app's Credentials panel |
| `SHOPIFY_CLIENT_SECRET` | Step 1 — same panel, click reveal |
| `SHOPIFY_API_VERSION` | `2025-01` (or current) |
| `CRON_SECRET` | any random string — protects `/api/sync` from being triggered by a plain public `GET` |

## 4. Install, migrate, sync

```bash
npm install
npm run migrate    # creates tables + seeds tag_categories
npm run dev         # http://localhost:3000
```

Then either click **Sync now** in the UI, or run:

```bash
curl -X POST http://localhost:3000/api/sync
```

to pull the current Shopify catalog into `products` and seed empty
`product_tags` rows for each category.

## 5. Deploy

Code is on GitHub at `sinemalak2/ladiesse-taxonomy-tool` (private). Deploy
by importing it in the [Vercel dashboard](https://vercel.com/new):

1. **Add New → Project**, import `sinemalak2/ladiesse-taxonomy-tool`.
2. Add the env vars from `.env.local` in the project's **Environment
   Variables** settings, then deploy.
3. **Project Settings → Deployment Protection** — turn on Standard (or
   Password) Protection. This is what keeps the tool private; there's no
   auth code in this repo, access control is entirely a Vercel setting.
   Vercel Cron requests bypass Deployment Protection automatically, so the
   scheduled sync below still runs.
4. **Project Settings → Domains** — add `taxonomy.ladiesse.com`. Vercel
   will show you a CNAME target (e.g. `cname.vercel-dns.com`) to add wherever
   `ladiesse.com`'s DNS is managed (Shopify's domain settings, or your
   registrar if it's managed elsewhere) as a record for the `taxonomy`
   subdomain. Vercel issues SSL for it automatically once the DNS record
   resolves.

`vercel.json` schedules `/api/sync` once daily (3am) via Vercel Cron — the
Hobby plan caps cron jobs at once per day, and a more frequent schedule
fails deployment outright. The "Sync now" button in the UI still works
anytime for on-demand syncs. To sync more often than daily, either upgrade
to a Pro plan (which allows per-minute cron) and tighten the schedule in
`vercel.json`, or use an external pinger (e.g. cron-job.org hitting
`/api/sync` with the `CRON_SECRET` bearer header).

## API routes

```
GET  /api/products?search=&page=                   list products + tag-completion counts
GET  /api/products/:id                              product + its tags + notes
GET  /api/categories                                all tag categories
POST /api/products/:id/tags                         { category_key, values, tagged_by }
POST /api/products/:id/notes                        { notes }
POST /api/categories/:key/values                     { value }  — append a new tag option
POST /api/sync                                        manual sync trigger
GET  /api/sync                                        cron-triggered sync (requires CRON_SECRET)
POST /api/products/:id/publish-to-shopify             write assigned tags to Shopify metafields
POST /api/products/:id/mark-removal                   { marked }  — flag/unflag for later bulk deletion
POST /api/products/:id/delete                         delete immediately, from Shopify and this DB
POST /api/products/bulk-delete                        delete every product currently marked_for_removal
POST /api/products/:id/ai-tag                          regenerate all of a product's tags via AI (tagged_by='AI')
POST /api/products/ai-tag-batch                        tag the next batch of still-untagged products (used by "Tag all with AI")
POST /api/products/publish-all-to-shopify               publish every tagged product's tags to Shopify in one pass
```

## AI tagging

Tags are generated by AI, not by named stylists — there's no "Ipek/Sino"
picker anymore. Every category's tags carry a `tagged_by` of either `'AI'`
(auto-generated, unreviewed) or `'Sinem'` (reviewed/edited by hand — set
automatically whenever a tag chip is toggled in the UI). A small badge next
to each category in the tagger shows which state it's in, so a review pass
just means paging through products and looking for "AI" badges to confirm
or fix.

Three ways to run it:

- **Bulk, from the UI:** the sidebar's "Tag all with AI" button tags every
  product missing at least one category's tags, five at a time per request
  (`POST /api/products/ai-tag-batch`), looping automatically until nothing's
  left — a full-catalog run stays inside Vercel's function timeout this way.
  Progress shows live ("Tagged 40, 3 remaining..."). Safe to click again
  later — already-tagged products are skipped.
- **Bulk, from the CLI:** `npm run ai-tag` does the same walk in one long-
  running process instead of small batched requests — useful for a very
  large catalog or when you'd rather watch one continuous log. Safe to
  re-run — already-tagged products are skipped, and it never overwrites a
  category already marked `tagged_by='Sinem'`. `npm run ai-tag -- --force`
  re-tags everything, including reviewed rows — use deliberately.
- **Per product, from the UI:** the "Tag with AI" button on a product's
  detail panel calls `POST /api/products/:id/ai-tag` to regenerate that one
  product's tags. Unlike the bulk options this always overwrites, including
  categories already reviewed — it's an explicit single-product action.

Requires `ANTHROPIC_API_KEY` (see `.env.local.example`). Nothing is ever
auto-published to Shopify from an AI tag — publishing is still a separate
step (see below), so there's always a chance to review before it goes live.

## Publishing tags to Shopify

`POST /api/products/:id/publish-to-shopify` (the tagging UI's "Publish to
Shopify" button) writes one product's non-empty tag categories as
`list.single_line_text_field` metafields under the `ladiesse_taxonomy`
namespace (keys: `body_shape`, `occasion`, `vibe`, `skin_tone`), so the
storefront/AI search layer can read tags without querying this Postgres
database directly. This is one-way (DB → Shopify).

For pushing everything at once instead of product-by-product, the sidebar's
**"Publish all to Shopify"** button (confirmed via a dialog first, since
it's a live write to the storefront) or `npm run publish-all` from the CLI
both publish every product that has at least one tagged category,
regardless of whether it's been reviewed yet — same `lib/shopifyPublish.js`
logic either way, batching Shopify's `metafieldsSet` calls 25 metafields at
a time. Re-publishing later after editing tags is safe — it just overwrites
the metafield values.

## Removing products

Two ways to remove a product, both in the tagging UI (`lib/productRemoval.js`):

- **Delete now** — the product detail panel's "Delete from Shopify now"
  button calls Shopify's `productDelete` mutation immediately, then removes
  the row locally (tags/notes cascade automatically). Confirmed via a plain
  browser dialog before it fires. This is real, essentially irreversible
  deletion — there's no undo once Shopify's mutation succeeds.
- **Mark, then bulk delete** — "Mark for removal" (in the list or the detail
  panel) only flips a local flag; marked rows show greyed-out/struck-through
  in the list so they're easy to review. The sidebar's "Delete N marked from
  Shopify" button (visible whenever the count is > 0, across the whole
  catalog regardless of current search/page) deletes all of them in one
  batch, confirmed once up front. One product's Shopify failure doesn't
  abort the rest of the batch — check server logs for any that failed.

Requires the Shopify custom app's `write_products` scope (already needed for
metafield publishing above, so no extra Shopify setup if that already works).

## Stage 2: user affinity vectors (GA4 pipeline)

Nightly pipeline that turns GA4 behavior (views, searches, cart adds,
purchases) into per-user affinity scores against the tag taxonomy above —
feeds ranking in `ladiesse-market-place-orders` (`shopify-webhook.ladiesse.com`).

**Verified against real ladiesse.com BigQuery export data (2026-07-21):**
GA4's `items[].item_id` is Shopify's own format,
`shopify_<COUNTRY>_<PRODUCT_ID>_<VARIANT_ID>` — not a bare GID — so
`lib/ga4.js`'s `toProductGid()` parses the embedded product ID back into
`gid://shopify/Product/...` to join against `products.id`. No theme change
needed. `search_term` is confirmed as the right event param, but real
queries are full natural-language ("I'm going to a party in Santa
Barbara... interested in flowy dresses"), not short keywords — the simple
substring/synonym matcher in `lib/affinity.js` catches literal overlaps
(e.g. "party") but misses implied intent (e.g. "Ibiza" → beach). No GA4
User-ID is set yet, so affinity tracks anonymous `user_pseudo_id` only for
now — expected per Step 0's original spec, not a blocker.

Also: `user_events.product_id` is **not** a foreign key to `products(id)`.
GA4 retains events for products that later get archived and pruned (see
`scripts/prune-archived-products.js`), so an FK would reject real historical
events the moment their product is discontinued.

1. GA4 Admin → Product Links → BigQuery Links → link a GCP project, **daily
   export** (streaming/intraday not needed for a nightly job).
2. Create a service account with BigQuery Data Viewer + Job User roles,
   download its key, and set `GOOGLE_APPLICATION_CREDENTIALS`,
   `GA4_BQ_PROJECT_ID`, `GA4_BQ_DATASET` (see `.env.local.example`).
3. `npm run migrate` — creates `user_events` and `user_attribute_affinity`.
4. `npm run ingest-ga4` — pulls the previous day's `events_YYYYMMDD` table
   into `user_events`. Run manually once and inspect the table before
   scheduling; safe to re-run (dedupes on `user_events_dedupe_idx`).
5. `npm run aggregate-affinity` — joins `user_events` → `product_tags`
   (plus keyword-matches `search` queries against `tag_categories.values`,
   see `SEARCH_SYNONYMS` in `lib/affinity-config.js`), applies recency
   decay, and rewrites `user_attribute_affinity` from the last 90 days of
   events.
6. `GET /api/users/:user_key/affinity` → `[{ category_key, attribute_value,
   score }, ...]`, read-only. Returns `[]` below `COLD_START_MIN_EVENTS`
   total events for that user, so the search backend falls back to pure
   semantic match instead of ranking on a noisy vector. Called
   server-to-server by `ladiesse-market-place-orders` — no browser session, so it's
   gated by its own `AFFINITY_API_SECRET` bearer secret (see
   `middleware.js`) rather than the login gate, the same way `/api/sync`
   handles Vercel Cron.

`vercel.json` schedules `GET /api/affinity-pipeline` nightly (4am, an hour
after the Shopify sync) — it runs ingestion then aggregation in one request,
reusing `CRON_SECRET`. They're combined into a single route/cron entry
rather than two, since aggregation always has to run strictly after
ingestion anyway, and Vercel's Hobby plan has historically capped the
*number* of cron jobs, not just how often each one fires.

Event weights, recency half-life, the aggregation window, and the cold-start
threshold are constants in `lib/affinity-config.js`, not magic numbers
buried in the aggregation logic.

**Current data note:** as of this writing, 0 of the 1232 `product_tags`
rows have any values yet — the stylist tagging tool hasn't been used on
this catalog. View/cart/purchase events won't contribute affinity signal
until products are actually tagged; only `search` keyword-matching produces
scores today.

## Tests

```bash
npm test
```

Pure logic (upsert classification, tag-cap validation, metafield
construction, pagination, affinity scoring/decay/keyword-matching) is
extracted into `lib/` and tested with Node's built-in test runner, matching
the convention used in `ladiesse-market-place-orders`.
