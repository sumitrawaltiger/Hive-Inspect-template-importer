<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project rules for coding agents

- The importer must never drop or rewrite content silently. Any new skip, fallback or normalisation in
  `src/lib/importer/parse.ts` needs an `ImportIssue` with a source row, a bucket in `ImportReportView`, and a test.
- `parse.ts` stays pure: bytes in, tree and report out. No database or network access.
- All SQL lives in `src/lib/db/templates.ts` and must run on both `pg` and PGlite. Pass bulk data as one
  `jsonb_to_recordset($1::jsonb)` parameter, not as array parameters.
- Comment HTML is sanitised with `sanitizeForSave` on every write. Never render `source_body_html` as HTML.
- Column matching is by normalised header name (`columns.ts`), never by position.
- Before finishing: `npm run typecheck && npm run lint && npm test && npm run build`.
- New edge case in the format → add it to `scripts/make-synthetic-fixtures.ts`, run `npm run fixtures`, add a test.
