import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { listTemplates } from "@/lib/db/templates";

export const dynamic = "force-dynamic";

export default async function Home() {
  let target = "/templates";
  try {
    const templates = await listTemplates(await getDb());
    if (templates.length > 0) target = `/templates/${templates[0].id}`;
  } catch {
    target = "/templates";
  }
  redirect(target);
}
