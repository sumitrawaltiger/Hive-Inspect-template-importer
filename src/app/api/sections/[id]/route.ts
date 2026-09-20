import { NextResponse } from "next/server";
import { fail, requireUuid } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { updateSection } from "@/lib/db/templates";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = requireUuid((await params).id, "This section");
    await updateSection(await getDb(), id, await request.json());
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
