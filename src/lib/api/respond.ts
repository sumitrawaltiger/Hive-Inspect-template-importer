import { NextResponse } from "next/server";
import { NotFoundError, ValidationError } from "../db/templates";
import { ImportError } from "../importer/parse";

export function fail(error: unknown) {
  if (error instanceof ImportError) {
    return NextResponse.json({ error: error.message, code: error.code, details: error.details ?? null }, { status: 422 });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message, code: "validation" }, { status: 400 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message, code: "not_found" }, { status: 404 });
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "The request body was not valid JSON.", code: "bad_request" }, { status: 400 });
  }
  console.error(error);
  const message = error instanceof Error ? error.message : "Unknown error";
  const isDb = /DATABASE_URL|ECONNREFUSED|ENOTFOUND|timeout|password authentication|relation .* does not exist/i.test(message);
  return NextResponse.json(
    {
      error: isDb
        ? "The database could not be reached, so nothing was saved. Try again in a moment."
        : "Something went wrong on the server and nothing was saved.",
      code: isDb ? "database_unavailable" : "server_error",
      details: process.env.NODE_ENV === "production" ? null : message,
    },
    { status: isDb ? 503 : 500 }
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(id: string, what: string) {
  if (!UUID.test(id)) throw new NotFoundError(what);
  return id;
}

export async function readUpload(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    throw new ValidationError("No file was uploaded. Choose the .xlsx file exported from Spectora.");
  }
  const name = form.get("name");
  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    fileName: file.name || "upload.xlsx",
    name: typeof name === "string" ? name : undefined,
  };
}
