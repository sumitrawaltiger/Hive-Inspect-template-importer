# Template Importer

Import a Spectora **HTML-text** template export, check that nothing was lost, then edit it and make independent copies.
Built for the Hive Inspect Forward Deployed Engineer assignment.

- **Live app:** _add the Vercel URL here_ (no login; opens on the imported sample template)
- **Walkthrough video:** _add link_
- **Decisions, limits and how it was checked:** [NOTES.md](NOTES.md)
- **Input file used:** see [samples/README.md](samples/README.md)

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4 |
| Database | Postgres on Supabase, reached with `pg` over the transaction pooler |
| Local database | PGlite (Postgres compiled to WASM) when `DATABASE_URL` is not set, so the app and tests run with zero setup |
| Spreadsheet parsing | SheetJS (`xlsx` 0.20.3 from the SheetJS CDN) |
| HTML safety | `sanitize-html` with an explicit allowlist |
| Comment editor | Tiptap (StarterKit), with an HTML-source fallback |
| Tests | Vitest |

## Run it locally

```bash
npm install
npm run db:seed     # imports samples/spectora/*.xlsx (or the synthetic sample) as the protected sample template
npm run dev
```

With no environment variables the app stores everything in an embedded Postgres under `.data/`. That is a real
Postgres engine and it persists between restarts, which is enough to try everything.

## Use Supabase (what the deployed app uses)

1. Create a Supabase project.
2. Project Settings → Database → Connection string → **Transaction pooler**. Copy the URI.
3. Create `.env.local`:

   ```bash
   DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
   ```

4. Create the tables and seed the sample template:

   ```bash
   npm run db:init
   npm run db:seed
   ```

   `db:init` runs [db/schema.sql](db/schema.sql), which is idempotent. You can also paste that file into the Supabase SQL
   editor. Row level security is enabled with no policies, so the public Supabase REST API cannot read or write these
   tables; only this app's server, which connects with the database password, can.

### Environment variables

| Name | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | On Vercel | Postgres connection string. Unset locally → embedded PGlite in `.data/` |

No credentials are committed. `.env*` and `.data/` are git-ignored.

## Deploy to Vercel

1. Import the repo in Vercel (framework preset: Next.js, no build overrides).
2. Add `DATABASE_URL` under Settings → Environment Variables.
3. Run `npm run db:init && npm run db:seed` once from your machine against the same `DATABASE_URL`.
4. Open `/api/health` on the deployment. It should answer `{"ok":true,"database":"postgres","templates":1}`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Parser, persistence, copy-independence, round-trip and failure-case tests |
| `npm run fixtures` | Regenerates `samples/synthetic/*.xlsx` |
| `npm run db:init` | Applies `db/schema.sql` to `DATABASE_URL` |
| `npm run db:seed [file]` | Imports a file as the protected sample template (skips if that exact file is already there) |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |

## Layout

```
db/schema.sql                   tables: templates → sections → items → comments
src/lib/importer/columns.ts     header normalisation and the column map
src/lib/importer/parse.ts       file → tree + import report (pure, no database)
src/lib/html.ts                 sanitiser, text extraction, link extraction
src/lib/db/client.ts            pg pool or PGlite behind one small interface
src/lib/db/templates.ts         every query: import, read, edit, copy, move, delete
src/lib/exporter.ts             stored template → Spectora-shaped .xlsx
src/app/api/**                  REST endpoints (thin; they call the lib)
src/components/ImportWizard     upload → report → name → save
src/components/ImportReportView the trust report, also shown later at /templates/:id/report
src/components/TemplateEditor   rename, edit, reorder, add/delete comments, duplicate
tests/                          vitest
scripts/                        fixtures, db init, db seed
samples/                        the Spectora export and synthetic edge cases
```

## API

| Method and path | Purpose |
| --- | --- |
| `POST /api/import/preview` | Parse an upload and return the tree and report. Writes nothing |
| `POST /api/import` | Parse again and store, in one transaction |
| `GET /api/templates` · `GET /api/templates/:id` | List · full tree |
| `PATCH /api/templates/:id` · `DELETE` | Rename · delete (the sample is protected) |
| `POST /api/templates/:id/copy` | Deep copy |
| `GET /api/templates/:id/export` | Download as `.xlsx` in the Spectora column layout |
| `PATCH /api/sections/:id` · `PATCH /api/items/:id` | Rename |
| `PATCH /api/comments/:id` · `DELETE` | Name, text, type · delete |
| `POST /api/items/:id/comments` | Add a comment |
| `POST /api/move` | Move a section, item or comment up or down |
| `GET /api/health` | Database reachability |

## Credits

Scaffolded with `create-next-app`. Libraries: Next.js, React, Tailwind, SheetJS, sanitize-html, Tiptap, pg, PGlite,
Vitest. Everything under `src/lib`, `src/components`, `src/app`, `db`, `scripts` and `tests` was written for this
assignment, with Claude Code as the coding agent. See NOTES.md for how it was used.
