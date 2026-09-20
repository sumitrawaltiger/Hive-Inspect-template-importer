import { NextResponse } from "next/server";
import { fail } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { listTemplates } from "@/lib/db/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ templates: await listTemplates(await getDb()) });
  } catch (error) {
    return fail(error);
  }
}
