import { NextResponse } from "next/server";
import { fail } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from templates");
    return NextResponse.json({ ok: true, database: db.kind, templates: rows[0].n });
  } catch (error) {
    return fail(error);
  }
}
