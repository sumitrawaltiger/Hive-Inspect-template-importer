import { notFound } from "next/navigation";
import { TemplateEditor } from "@/components/TemplateEditor";
import { loadTemplateOrNull } from "@/lib/db/load";

export const dynamic = "force-dynamic";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const tree = await loadTemplateOrNull((await params).id);
  if (!tree) notFound();
  return <TemplateEditor key={tree.id} initial={tree} />;
}
