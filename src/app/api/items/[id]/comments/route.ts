import { NextResponse } from "next/server";
import { fail, requireUuid } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { addComment } from "@/lib/db/templates";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, "This item");
    return NextResponse.json({ id: await addComment(await getDb(), id) }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
