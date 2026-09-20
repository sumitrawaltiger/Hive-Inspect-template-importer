# Notes

## The customer problem I optimised for

An inspection company has four years of wording in a Spectora template. The risk in switching is not "will the import
run", it is "did it quietly lose something I will only notice in front of a client". So the priority order was:

1. Bring every row across, in order, with the same words and links.
2. Never drop or change anything without saying so, on screen, before the user commits.
3. Make rename / edit / copy boring and safe.

## Data model

```
templates (id, name, source_file_name, source_sha256, copied_from_id, is_sample, import_report jsonb, timestamps)
  sections (id, template_id, position, name, original_name, source_row)
    items (id, section_id, position, name, original_name, source_row)
      comments (id, item_id, position, name, original_name,
                body_html, original_body_html, source_body_html,
                comment_type, raw_comment_type, attributes jsonb, source_row)
```

- **One row per thing the user edits.** Sections, items and comments are rows with an integer `position`, so ordering is
  explicit and reordering is a small update. Only the comment body is HTML.
- **`original_*` columns** hold the value as imported. They drive the "Edited since import" / "Renamed" badges, the
  edited count, and "Restore the imported version". `NULL` means the row was created here, not imported.
- **`source_body_html`** holds the cell exactly as it was in the file, but only for comments where the sanitiser had to
  remove something. The user can see it under "Other data from Spectora". It is never rendered as HTML.
- **`attributes jsonb`** holds every other Spectora column for that comment (answer type, multiple-choice options,
  recommendation, estimates, order, locked, default photos, last modified…) plus any column the importer does not
  recognise, keyed `Unrecognised: <header>`. They are preserved and visible but read-only. I did not give them typed
  columns because this app has no behaviour that uses them; inventing a schema for answer types I cannot exercise
  would be guessing. They survive copy and export.
- **`source_row`** on every node lets every notice and every comment point back at the exact spreadsheet row.
- **`import_report jsonb`** is the report the user saw at import time, stored so it can be reopened later.
- **Copy** is a deep copy inside one transaction: new UUIDs for every row, `copied_from_id` on the template. Nothing is
  shared, so editing a copy cannot touch the original. Deleting the original sets `copied_from_id` to null.

## Import mapping

The export is a flat sheet: one row per comment, with the section and item name repeated on each row.

| Column in file | Goes to |
| --- | --- |
| Section Name | `sections.name`. A new section starts whenever the value changes |
| Item Name | `items.name`. A new item starts whenever the value changes inside a section |
| Comment Name | `comments.name` |
| Comment Text | `comments.body_html` after sanitising |
| Comment Type | `comments.comment_type` (`info`, `limit`, `defect`); anything else → `unknown` with the raw value kept |
| All other known Spectora columns, Default Photo 1–10 (+ Caption) | `comments.attributes` |
| Anything else | `comments.attributes` under `Unrecognised: …`, plus a notice |

Headers are matched by name, not position: lower-cased, parenthetical hints like `(info, limit, defect)` or
`(w/i item)` removed, punctuation ignored. The header row is searched for in the first 40 rows of every sheet, so
preamble rows and reordered or extra columns do not break it. File order is the order. The `Order` value is kept as
data but not used to re-sort, because the file is the thing the customer can see and check.

Ambiguous rows, and what the importer does (always with a notice):

| Situation | Behaviour |
| --- | --- |
| Blank Section Name, a section exists above | Kept under the section above ("fill down") |
| Blank Section Name, nothing above | **Skipped**, shown in the report with the row's full contents |
| Blank Item Name with comment text | Kept under the item above; skipped only if the section has no item yet |
| Row with an item but no comment | The item is created with no comments |
| Same section or item name reappears later | Kept as a second, separate section/item so order is preserved |
| Blank Comment Type | Imported as `info` |
| Rows above the header, other sheets | Not imported, listed |

## Rich content

- Comment HTML is sanitised on import **and on every save** with an allowlist: paragraphs, line breaks, bold, italic,
  underline, strike, sub/sup, headings, lists, blockquote, links (`http`, `https`, `mailto`, `tel`), images
  (`http`/`https`), tables, `span`/`div`/`font`, and a short list of inline styles (colour, background, alignment,
  weight, size).
- Removed and **reported per comment**: `<script>`, `<style>`, event handlers, `javascript:` links, and embeds
  (`<iframe>`, `<video>`, `<audio>`, `<object>`). The original cell is kept in `source_body_html`.
- Dropped silently: `class`, `id` and `data-*` attributes. They refer to Spectora's stylesheet and mean nothing here.
- A cell with no markup is treated as plain text: escaped, blank lines become paragraphs, single newlines become `<br>`.
- Images stay hot-linked to wherever Spectora hosted them. The report says so, because they will break if that host
  removes them. Re-hosting them was cut.
- The formatting editor (Tiptap) understands paragraphs, bold/italic/underline/strike, lists, links, headings, quotes.
  If a comment contains anything else (tables, colours, images) it opens in **HTML source mode** with a warning, so
  opening and saving a comment can never flatten formatting the user did not look at.

### Missing from the export vs not supported by this importer

The report separates these on screen.

**Not in the export at all** (no importer could recover it): the image files behind Default Photo columns; anything
Spectora does not give a column to (template-level settings, section/item-level options beyond the name); text beyond
Excel's 32,767-character cell limit (flagged if a cell is at the limit); a missing Comment Name or Comment Type column.

**In the export, not supported here:** embeds and unsafe markup (hidden, original kept); default photo file names and
captions, answer types, options, units, defaults, estimates, recommendation, location, locked/simple-format/disable
photos flags, uses, last modified (all kept as read-only data, not editable, no behaviour); unrecognised columns (kept
as read-only data); extra sheets (ignored, named in the report); plain-text exports work but obviously carry no
formatting; `.csv` is accepted but untested against a real Spectora file.

## The improvement I chose: make the import easy to trust

Before anything is saved, the user gets a report for their file:

- Row accounting: rows in the file = imported + skipped, with blank rows counted separately.
- A text check: the readable characters of every comment are counted in the file and again after sanitising.
- Four lists: rows not imported (with their full contents), in-the-file-but-unsupported, missing-from-the-export, and
  decisions the importer made.
- How every column was read, with the number of filled cells.
- The resulting section → item → comment outline, with source row numbers.
- A warning if this exact file (SHA-256) was imported before.

The same report is stored and reachable from the template afterwards. After import, "Edited since import" badges,
"Restore the imported version" and "Download .xlsx" (same column layout) keep that trust going: the customer can
always see what they changed and can always get their content back out.

Why this and not a fancier editor: a non-technical inspector cannot diff a 400-row spreadsheet against a new system. If
they cannot verify the import, they retype or they do not switch.

## How I checked it

`npm test` (23 tests):

- **Preservation:** hierarchy, order, names, links, entities, inline colour, plain-text line breaks, an item with no
  comments, attributes.
- **Real export check** (runs on every file in `samples/spectora/`): re-reads the sheet independently of the parser
  and asserts row count, order, names, readable text and link targets comment by comment.
- **Round trip:** import → store → export to xlsx → import again → identical tree.
- **Saved edits:** rename section/item, edit comment, sanitised on save, originals retained, empty name rejected.
- **Independent copies:** no shared ids; rename, edit, delete, add and reorder in the copy, then assert the original
  tree is deep-equal to before; delete the copy, assert again.
- **Persistence:** close the database, reopen from disk, same tree.
- **Atomic import:** a failure halfway leaves no template and no orphan rows.
- **Failure cases:** not a spreadsheet, not a template, missing required column, empty upload.

By hand in the browser: import of the messy fixture, the report, save, edit with the formatting editor, reload,
duplicate, and the missing-column failure message.

## What I cut, deliberately

| Cut | Why |
| --- | --- |
| Login and multi-tenant data | The reviewer needs to open a URL. It also means anyone can edit; the sample template is delete-protected and re-seedable |
| Adding/deleting sections and items, drag and drop | Rename, edit, reorder (up/down) and add/delete comments cover the brief. Structural editing is the next step |
| Typed, editable answer types / options / estimates | No behaviour here uses them. Kept losslessly as data instead of half-modelled |
| Re-hosting images, importing default photos | The files are not in the export; needs Spectora access and storage |
| Concurrent-edit protection | Last write wins. Single-inspector workflow; would add `updated_at` checks |
| Undo history | "Restore the imported version" per comment is the 80% case |
| An LLM in the import path | The format is tabular and deterministic. A model adds a way to invent or drop content and nothing the header map does not already do. Where I would use one later: suggesting mappings for a *different* vendor's export, behind the same report and row accounting |
| Uploads over 4 MB | Vercel's request body limit is about 4.5 MB. A template export is tens of KB |

## Known limitations

- Item-level rows: if Spectora puts item-only settings on a row with no comment name or text, they are kept as a
  nameless comment's data rather than on the item.
- Merged cells are not unmerged; blank-cell fill-down handles the common case and is always reported.
- Blank comment type becomes `info`.
- `.xls` is accepted through SheetJS but only `.xlsx` was exercised.

## AI tools

Built with Claude Code as the coding agent: it researched the export format from Spectora's help centre, scaffolded the
app, wrote the parser, schema, tests and UI, and drove a browser to check the flows. I directed scope and the
decisions above, reviewed the code, and ran the checks. There is no model inside the product.

## Things for me to fill in before submitting

- [ ] Real Spectora export committed to `samples/spectora/`, table in `samples/README.md` filled in, real-export test green
- [ ] Live URL and video link in README
- [ ] Hive Inspect feedback and the Hive vs Binsr comparison (from my own trial use)
- [ ] Approximate time spent
