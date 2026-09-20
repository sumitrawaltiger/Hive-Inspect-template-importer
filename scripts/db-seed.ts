import "./env";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getDb } from "../src/lib/db/client";
import { createFromImport, findBySha } from "../src/lib/db/templates";
import { parseSpectoraExport } from "../src/lib/importer/parse";

function pickFile(): string {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const realDir = path.join(process.cwd(), "samples", "spectora");
  const real = existsSync(realDir) ? readdirSync(realDir).filter((f) => /\.(xlsx|xls)$/i.test(f)).sort() : [];
  if (real.length > 0) return path.join(realDir, real[0]);
  return path.join(process.cwd(), "samples", "synthetic", "synthetic-clean.xlsx");
}

async function main() {
  const file = pickFile();
  const parsed = parseSpectoraExport(readFileSync(file), path.basename(file));
  const db = await getDb();
  const existing = await findBySha(db, parsed.sha256);
  if (existing.length > 0) {
    console.log(`Already seeded: "${existing[0].name}" (${existing[0].id}). Nothing to do.`);
  } else {
    const id = await createFromImport(db, parsed, { isSample: true });
    console.log(`Seeded "${parsed.suggestedName}" from ${path.basename(file)} as ${id}`);
    console.log(`${parsed.stats.sections} sections, ${parsed.stats.items} items, ${parsed.stats.comments} comments, ${parsed.issues.length} notices`);
  }
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
