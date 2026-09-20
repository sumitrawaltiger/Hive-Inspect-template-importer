"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ApiError, api } from "@/lib/client-api";
import type { ParseResult } from "@/lib/types";
import { ImportReportView } from "./ImportReportView";

interface Preview {
  parsed: ParseResult;
  alreadyImported: { id: string; name: string }[];
}

const MAX_BYTES = 4 * 1024 * 1024;

export function ImportWizard() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"reading" | "saving" | null>(null);
  const [error, setError] = useState<{ message: string; details?: unknown } | null>(null);
  const [dragging, setDragging] = useState(false);

  async function choose(next: File | undefined) {
    if (!next) return;
    setError(null);
    setPreview(null);
    setFile(next);
    if (next.size > MAX_BYTES) {
      setError({ message: `This file is ${(next.size / 1024 / 1024).toFixed(1)} MB. The importer accepts files up to 4 MB.` });
      return;
    }
    setBusy("reading");
    try {
      const body = new FormData();
      body.append("file", next);
      const result = await api<Preview>("/api/import/preview", { method: "POST", body });
      setPreview(result);
      setName(result.parsed.suggestedName);
    } catch (caught) {
      const apiError = caught as ApiError;
      setError({ message: apiError.message, details: apiError.details });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!file || !preview) return;
    setBusy("saving");
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("name", name);
      const { id } = await api<{ id: string }>("/api/import", { method: "POST", body });
      router.push(`/templates/${id}`);
    } catch (caught) {
      setError({ message: (caught as ApiError).message });
      setBusy(null);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setError(null);
    if (input.current) input.current.value = "";
  }

  const found = (error?.details as { found?: string[] } | null)?.found;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import a template from Spectora</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          In Spectora open <b>Templates → My Templates</b>, pick the template, then <b>⋯ → Export to spreadsheet → Export HTML Text</b>.
          Upload the .xlsx it downloads. Nothing is saved until you have checked the result.
        </p>
      </div>

      {!preview && (
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition ${
            dragging ? "border-brand bg-amber-50" : "border-stone-300 bg-white hover:border-stone-400"
          }`}
        >
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(event) => choose(event.target.files?.[0])}
          />
          <div className="text-base font-medium">{busy === "reading" ? "Reading your file…" : "Drop the Spectora export here, or click to choose it"}</div>
          <div className="mt-1 text-sm text-stone-500">.xlsx or .xls, up to 4 MB</div>
          {file && !busy && <div className="mt-3 text-sm text-stone-600">Last file: {file.name}</div>}
        </label>
      )}

      {error && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <div className="font-semibold">{preview ? "The template was not saved" : "This file was not imported"}</div>
          <p className="mt-1">{error.message}</p>
          {found && found.length > 0 && (
            <p className="mt-2 text-xs">
              Columns found in the file: <span className="font-mono">{found.join(", ")}</span>
            </p>
          )}
          <p className="mt-2 text-xs text-red-800">Nothing was saved. You can choose another file or try again.</p>
        </div>
      )}

      {preview && (
        <>
          <div className="sticky top-0 z-10 -mx-2 flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
            <label className="min-w-64 flex-1 text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">Template name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2"
              />
            </label>
            <button onClick={reset} disabled={busy !== null} className="rounded border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50">
              Choose another file
            </button>
            <button
              onClick={save}
              disabled={busy !== null || !name.trim()}
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {busy === "saving" ? "Saving…" : "Save template"}
            </button>
          </div>

          {preview.alreadyImported.length > 0 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              This exact file has been imported before as{" "}
              {preview.alreadyImported.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ", "}
                  <Link href={`/templates/${t.id}`} className="underline">{t.name}</Link>
                </span>
              ))}
              . Saving will create a second, separate template.
            </div>
          )}

          <ImportReportView report={preview.parsed} />

          <section>
            <h2 className="text-lg font-semibold">What will be created</h2>
            <p className="text-sm text-stone-600">Sections and items in the order they appear in your file. Open a section to check it.</p>
            <div className="mt-3 space-y-2">
              {preview.parsed.sections.map((section, s) => (
                <details key={s} className="rounded-lg border border-stone-200 bg-white px-4 py-2">
                  <summary className="cursor-pointer">
                    <span className="font-medium">{section.name}</span>{" "}
                    <span className="text-sm text-stone-500">
                      {section.items.length} items · {section.items.reduce((n, item) => n + item.comments.length, 0)} comments · row {section.sourceRow}
                    </span>
                  </summary>
                  <ul className="mt-2 space-y-2 border-t border-stone-100 pt-2 text-sm">
                    {section.items.map((item, i) => (
                      <li key={i}>
                        <div className="font-medium">{item.name}</div>
                        {item.comments.length === 0 ? (
                          <div className="pl-4 text-xs text-stone-500">No comments in the file for this item.</div>
                        ) : (
                          <ul className="pl-4 text-stone-600">
                            {item.comments.map((comment, c) => (
                              <li key={c} className="truncate">
                                <span className="mr-2 inline-block w-14 text-xs uppercase text-stone-400">{comment.commentType}</span>
                                {comment.name || <i>(unnamed)</i>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
