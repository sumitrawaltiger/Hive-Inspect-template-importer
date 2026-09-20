import { NextResponse } from "next/server";
import { fail, requireUuid } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { deleteTemplate, getTemplateTree, renameTemplate } from "@/lib/db/templates";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const id = requireUuid((await params).id, "This template");
    return NextResponse.json({ template: await getTemplateTree(await getDb(), id) });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const id = requireUuid((await params).id, "This template");
    const body = await request.json();
    await renameTemplate(await getDb(), id, body.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  try {
    const id = requireUuid((await params).id, "This template");
    await deleteTemplate(await getDb(), id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
