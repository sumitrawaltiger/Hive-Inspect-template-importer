# Sample files

## `spectora/` — the real export

Put the Spectora export here. `npm run db:seed` imports the first `.xlsx` in this folder as the protected sample
template, and `npm test` runs the row-by-row preservation check against every file in it.

| File | Template | Where it came from |
| --- | --- | --- |
| _add the file name_ | _e.g. InterNACHI Residential_ | Spectora trial account → Templates → My Templates → ⋯ → Export to spreadsheet → **Export HTML Text** |

## `synthetic/` — generated edge cases

Written by `npm run fixtures` (`scripts/make-synthetic-fixtures.ts`). The content is made up for testing and mirrors the
Spectora column layout. It contains no customer data.

| File | What it exercises |
| --- | --- |
| `synthetic-clean.xlsx` | Formatting, links, entities, plain-text cells, an item with no comments, answer-type attributes |
| `synthetic-messy.xlsx` | Preamble rows, a second sheet, `<script>`/`onclick`/`javascript:` markup, an `<iframe>`, an external image, default photo columns, blank section and item cells, an unknown comment type, an unknown column, a blank row, a section name that reappears later |
| `failure-missing-columns.xlsx` | No "Comment Text" column |
| `failure-not-a-template.xlsx` | A spreadsheet that is not a template |
| `failure-not-a-spreadsheet.xlsx` | A text file renamed to `.xlsx` |
