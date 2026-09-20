import { NextResponse } from "next/server";
import { fail, requireUuid } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { ValidationError, moveNode } from "@/lib/db/templates";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!["section", "item", "comment"].includes(body.kind) || !["up", "down"].includes(body.direction)) {
      throw new ValidationError("Unknown move request.");
    }
    await moveNode(await getDb(), body.kind, requireUuid(String(body.id), `This ${body.kind}`), body.direction);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
