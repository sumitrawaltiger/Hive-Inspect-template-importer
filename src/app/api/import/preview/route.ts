import { NextResponse } from "next/server";
import { fail, readUpload } from "@/lib/api/respond";
import { getDb } from "@/lib/db/client";
import { findBySha } from "@/lib/db/templates";
import { parseSpectoraExport } from "@/lib/importer/parse";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const upload = await readUpload(request);
    const parsed = parseSpectoraExport(upload.buffer, upload.fileName);
    const alreadyImported = await findBySha(await getDb(), parsed.sha256).catch(() => []);
    return NextResponse.json({ parsed, alreadyImported });
  } catch (error) {
    return fail(error);
  }
}
