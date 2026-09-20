import Link from "next/link";
import { notFound } from "next/navigation";
import { ImportReportView } from "@/components/ImportReportView";
import { loadTemplateOrNull } from "@/lib/db/load";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const tree = await loadTemplateOrNull((await params).id);
  if (!tree) notFound();
  return (
    <div className="space-y-6">
      <div>
        <Link href={`/templates/${tree.id}`} className="text-sm text-stone-500 underline">← Back to {tree.name}</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Import report</h1>
        <p className="mt-1 text-sm text-stone-600">
          What happened when <span className="font-mono text-xs">{tree.sourceFileName}</span> was imported. This is a record of the import;
          later edits do not change it.
        </p>
      </div>
      {tree.importReport ? (
        <ImportReportView report={tree.importReport} />
      ) : (
        <p className="text-sm text-stone-500">No report was stored for this template.</p>
      )}
    </div>
  );
}
