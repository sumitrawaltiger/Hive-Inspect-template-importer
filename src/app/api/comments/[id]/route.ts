import { NextResponse } from "next/server";
import { fail, requireUuid } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { deleteComment, updateComment } from "@/lib/db/templates";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const id = requireUuid((await params).id, "This comment");
    const saved = await updateComment(await getDb(), id, await request.json());
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const id = requireUuid((await params).id, "This comment");
    await deleteComment(await getDb(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
