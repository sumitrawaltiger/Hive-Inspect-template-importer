import { fail, requireUuid } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { getTemplateTree } from "@/lib/db/templates";
import { templateToXlsx } from "@/lib/exporter";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, "This template");
    const tree = await getTemplateTree(await getDb(), id);
    const fileName = `${tree.name.replace(/[^\w\- ]+/g, "").trim() || "template"}.xlsx`;
    return new Response(new Uint8Array(templateToXlsx(tree)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
