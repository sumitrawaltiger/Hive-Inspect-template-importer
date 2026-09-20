import type { ImportIssue, ImportReport, IssueCode } from "@/lib/types";

type Bucket = "skipped" | "unsupported" | "missing" | "decision";

const BUCKET_OF: Record<IssueCode, Bucket> = {
  row_skipped_no_section: "skipped",
  row_skipped_no_item: "skipped",
  html_embed_removed: "unsupported",
  html_unsafe_removed: "unsupported",
  default_photos_not_imported: "unsupported",
  unknown_column: "unsupported",
  duplicate_column: "unsupported",
  extra_sheets: "unsupported",
  unknown_comment_type: "unsupported",
  missing_optional_column: "missing",
  cell_truncation_risk: "missing",
  section_inherited: "decision",
  item_inherited: "decision",
  repeated_section_name: "decision",
  repeated_item_name: "decision",
  preamble_rows: "decision",
  html_external_image: "decision",
  blank_row: "decision",
};

const BUCKETS: { key: Bucket; title: string; help: string; tone: string }[] = [
  {
    key: "skipped",
    title: "Rows that were not imported",
    help: "These rows are in your file but could not be placed in the template. Their full contents are shown so nothing disappears silently.",
    tone: "border-red-200 bg-red-50",
  },
  {
    key: "unsupported",
    title: "In your file, but not supported here",
    help: "This content exists in the export. This importer does not support it yet, so it is kept as data or hidden from display rather than rewritten.",
    tone: "border-amber-200 bg-amber-50",
  },
  {
    key: "missing",
    title: "Missing from the export itself",
    help: "Spectora did not put this information in the file, so no importer could bring it across.",
    tone: "border-sky-200 bg-sky-50",
  },
  {
    key: "decision",
    title: "Decisions the importer made",
    help: "Places where the file was ambiguous and the importer chose the option that keeps your content and its order.",
    tone: "border-stone-200 bg-white",
  },
];

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
      {sub && <div className="mt-1 text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

function IssueList({ issues }: { issues: ImportIssue[] }) {
  const shown = issues.slice(0, 200);
  return (
    <ul className="mt-3 space-y-2 text-sm">
      {shown.map((issue, index) => (
        <li key={index} className="rounded border border-stone-200 bg-white px-3 py-2">
          <div>{issue.message}</div>
          {(issue.sectionName || issue.itemName) && (
            <div className="mt-0.5 text-xs text-stone-500">
              {[issue.sectionName, issue.itemName].filter(Boolean).join(" › ")}
            </div>
          )}
          {issue.raw && (
            <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 rounded bg-stone-50 p-2 font-mono text-xs">
              {Object.entries(issue.raw).map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="text-stone-500">{key}</dt>
                  <dd className="break-words">{value.length > 300 ? `${value.slice(0, 300)}…` : value}</dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
      {issues.length > shown.length && (
        <li className="text-xs text-stone-500">…and {issues.length - shown.length} more of the same kind.</li>
      )}
    </ul>
  );
}

export function ImportReportView({ report }: { report: ImportReport }) {
  const { stats, issues, columns } = report;
  const byBucket = new Map<Bucket, ImportIssue[]>();
  for (const issue of issues) {
    const bucket = BUCKET_OF[issue.code] ?? "decision";
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), issue]);
  }
  const skipped = byBucket.get("skipped")?.length ?? 0;
  const unsupported = byBucket.get("unsupported")?.length ?? 0;
  const textMatches = stats.sourceTextChars === stats.importedTextChars;

  const verdict =
    skipped > 0
      ? { tone: "border-red-300 bg-red-50 text-red-900", text: `${skipped} row(s) could not be imported. Everything else came across. Review the skipped rows below.` }
      : unsupported > 0
        ? { tone: "border-amber-300 bg-amber-50 text-amber-900", text: `Every row was imported. ${unsupported} thing(s) in the file are not supported and are listed below.` }
        : { tone: "border-emerald-300 bg-emerald-50 text-emerald-900", text: "Every row in the file was imported, in the same order, with the same text." };

  return (
    <div className="space-y-6">
      <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${verdict.tone}`}>{verdict.text}</div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Rows in file"
          value={stats.dataRows}
          sub={`${stats.importedRows} imported · ${stats.skippedRows} skipped${stats.blankRows ? ` · ${stats.blankRows} blank` : ""}`}
        />
        <Stat label="Sections" value={stats.sections} />
        <Stat label="Items" value={stats.items} />
        <Stat
          label="Comments"
          value={stats.comments}
          sub={`${stats.commentsByType.info} info · ${stats.commentsByType.limit} limitation · ${stats.commentsByType.defect} defect${
            stats.commentsByType.unknown ? ` · ${stats.commentsByType.unknown} other` : ""
          }`}
        />
      </div>

      <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm">
        <div className="font-medium">Text check</div>
        <p className="mt-1 text-stone-600">
          The readable text of every comment was counted before and after import:{" "}
          <span className="font-mono">{stats.sourceTextChars.toLocaleString()}</span> characters in the file,{" "}
          <span className="font-mono">{stats.importedTextChars.toLocaleString()}</span> stored.{" "}
          {textMatches ? (
            <span className="font-medium text-emerald-700">They match.</span>
          ) : (
            <span className="font-medium text-amber-700">
              They differ by {Math.abs(stats.sourceTextChars - stats.importedTextChars).toLocaleString()} — see the unsupported markup notices.
            </span>
          )}{" "}
          {stats.commentsWithHtml} comment(s) carry formatting, {stats.commentsWithLinks} contain links,{" "}
          {stats.commentsAlteredBySanitizer} had markup removed.
        </p>
        <p className="mt-1 text-xs text-stone-500">
          Sheet “{stats.sheetName}”, header on row {stats.headerRow}.
        </p>
      </div>

      {BUCKETS.map((bucket) => {
        const list = byBucket.get(bucket.key) ?? [];
        if (list.length === 0) return null;
        return (
          <details key={bucket.key} open={bucket.key !== "decision"} className={`rounded-lg border px-4 py-3 ${bucket.tone}`}>
            <summary className="cursor-pointer font-medium">
              {bucket.title} <span className="text-stone-500">({list.length})</span>
            </summary>
            <p className="mt-1 text-sm text-stone-600">{bucket.help}</p>
            <IssueList issues={list} />
          </details>
        );
      })}

      <details className="rounded-lg border border-stone-200 bg-white px-4 py-3">
        <summary className="cursor-pointer font-medium">
          How each column was read <span className="text-stone-500">({columns.length})</span>
        </summary>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase text-stone-500">
            <tr>
              <th className="py-1 pr-3">Column in file</th>
              <th className="py-1 pr-3">Used as</th>
              <th className="py-1 text-right">Filled cells</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column) => (
              <tr key={column.index} className="border-t border-stone-100">
                <td className="py-1 pr-3">{column.header}</td>
                <td className="py-1 pr-3 text-stone-600">
                  {column.status === "structural" && `${column.mappedTo} (editable)`}
                  {column.status === "attribute" && "Kept as comment data (read-only)"}
                  {column.status === "unknown" && "Not recognised — values kept as read-only data"}
                  {column.status === "duplicate" && "Duplicate — values kept as read-only data"}
                </td>
                <td className="py-1 text-right tabular-nums">{column.nonEmptyCells}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
