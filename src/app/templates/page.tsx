import Link from "next/link";
import { TemplateLibrary } from "@/components/TemplateLibrary";
import { getDb } from "@/lib/db/client";
import { listTemplates } from "@/lib/db/templates";
import type { TemplateSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  let templates: TemplateSummary[] = [];
  let failed = false;
  try {
    templates = await listTemplates(await getDb());
  } catch (error) {
    console.error(error);
    failed = true;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My templates</h1>
          <p className="mt-1 text-sm text-stone-600">Templates you imported, and copies you made of them.</p>
        </div>
        <Link href="/import" className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Import from Spectora
        </Link>
      </div>
      {failed ? (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          The database could not be reached, so your templates cannot be shown right now. They are not lost. Reload the page in a moment.
        </div>
      ) : (
        <TemplateLibrary templates={templates} />
      )}
    </div>
  );
}
