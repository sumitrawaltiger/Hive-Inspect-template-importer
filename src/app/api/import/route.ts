import { NextResponse } from "next/server";
import { fail, readUpload } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { createFromImport } from "@/lib/db/templates";
import { parseSpectoraExport } from "@/lib/importer/parse";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const upload = await readUpload(request);
    const parsed = parseSpectoraExport(upload.buffer, upload.fileName);
    const id = await createFromImport(await getDb(), parsed, { name: upload.name });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
