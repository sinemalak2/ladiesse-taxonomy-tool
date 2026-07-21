# Ladiesse Taxonomy Tool

Internal tool for Ipek and Sino to tag Ladiesse's Shopify catalog with
structured style attributes (body shape, occasion, vibe, skin tone), stored
in Postgres so it can feed a future AI "taste graph." Products are pulled
from Shopify automatically; tags live here, not in Shopify, until you
explicitly publish them back as metafields.

## Stack

- Next.js (App Router), plain JavaScript
- Postgres via [Neon](https://neon.tech), accessed with `pg`
- Deployed to Vercel, protected by Vercel's built-in Deployment Protection
  (no auth code in this repo — anyone with dashboard access controls who
  can reach the deployed URL)

## 1. Create a Shopify custom app

In the Shopify admin: **Settings → Apps and sales channels → Develop apps →
Create an app**. Scope it to:

- `read_products` (required)
- `write_products` (only needed for the "Publish to Shopify" metafield
  write-back feature)

Install the app, then generate an **Admin API access token**.

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
| `SHOPIFY_ADMIN_API_TOKEN` | Step 1 |
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
   Password) Protection. This is what keeps the tool private to you and
   Ipek; there's no auth code in this repo, access control is entirely a
   Vercel setting. Vercel Cron requests bypass Deployment Protection
   automatically, so the scheduled sync below still runs.
4. **Project Settings → Domains** — add `taxonomy.ladiesse.com`. Vercel
   will show you a CNAME target (e.g. `cname.vercel-dns.com`) to add wherever
   `ladiesse.com`'s DNS is managed (Shopify's domain settings, or your
   registrar if it's managed elsewhere) as a record for the `taxonomy`
   subdomain. Vercel issues SSL for it automatically once the DNS record
   resolves.

`vercel.json` schedules `/api/sync` every 30 minutes via Vercel Cron. Note:
Vercel's Hobby plan has at times restricted cron frequency — if the
scheduled runs don't fire as expected, check your plan's cron limits in the
Vercel dashboard; an external pinger (e.g. cron-job.org hitting
`/api/sync` with the `CRON_SECRET` bearer header) is a fallback.

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
```

## Publishing tags to Shopify

`POST /api/products/:id/publish-to-shopify` writes each non-empty tag
category as a `list.single_line_text_field` metafield under the
`ladiesse_taxonomy` namespace (keys: `body_shape`, `occasion`, `vibe`,
`skin_tone`), so the storefront/AI search layer can read tags without
querying this Postgres database directly. This is one-way (DB → Shopify),
triggered manually per product from the tagging UI.

## Tests

```bash
npm test
```

Pure logic (upsert classification, tag-cap validation, metafield
construction, pagination) is extracted into `lib/` and tested with Node's
built-in test runner, matching the convention used in `ladiesse-ai-search`.
