"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client-api";
import type { TemplateSummary } from "@/lib/types";

export function TemplateLibrary({ templates }: { templates: TemplateSummary[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<void>) {
    setBusy(id);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
        <p className="font-medium">No templates yet</p>
        <p className="mt-1 text-sm text-stone-500">Import the spreadsheet you exported from Spectora to get started.</p>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {templates.map((template) => (
          <li key={template.id} className="rounded-xl border border-stone-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/templates/${template.id}`} className="text-lg font-semibold hover:underline">
                {template.name}
              </Link>
              {template.isSample && <span className="rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-600">Sample</span>}
            </div>
            <p className="mt-1 text-sm text-stone-500">
              {template.sections} sections · {template.items} items · {template.comments} comments
            </p>
            <p className="mt-1 text-sm text-stone-500">
              {template.copiedFromId
                ? `Copy of ${template.copiedFromName ?? "a deleted template"}`
                : `Imported from ${template.sourceFileName ?? "a file"}`}
              {" · "}
              {template.editedCount === 0 ? "unchanged since import" : `${template.editedCount} edited`}
            </p>
            <p className="mt-1 text-xs text-stone-400">Last changed {new Date(template.updatedAt).toLocaleString()}</p>
            <div className="mt-4 flex gap-2 text-sm">
              <Link href={`/templates/${template.id}`} className="rounded bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-dark">
                Open
              </Link>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  run(template.id, async () => {
                    await api(`/api/templates/${template.id}/copy`, { method: "POST", json: {} });
                    router.refresh();
                  })
                }
                className="rounded border border-stone-300 px-3 py-1.5 hover:bg-stone-50 disabled:opacity-50"
              >
                {busy === template.id ? "Working…" : "Duplicate"}
              </button>
              {!template.isSample && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!window.confirm(`Delete “${template.name}”? This cannot be undone.`)) return;
                    run(template.id, async () => {
                      await api(`/api/templates/${template.id}`, { method: "DELETE" });
                      router.refresh();
                    });
                  }}
                  className="ml-auto rounded border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
