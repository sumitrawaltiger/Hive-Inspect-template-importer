import { NextResponse } from "next/server";
import { fail, requireUuid } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { copyTemplate } from "@/lib/db/templates";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, "This template");
    const body = await request.json().catch(() => ({}));
    const copyId = await copyTemplate(await getDb(), id, typeof body.name === "string" ? body.name : undefined);
    return NextResponse.json({ id: copyId }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
