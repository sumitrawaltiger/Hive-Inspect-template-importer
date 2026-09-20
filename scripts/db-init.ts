import "./env";
import { getDb, schemaSql } from "../src/lib/db/client";

async function main() {
  const db = await getDb();
  if (db.kind === "postgres") await db.query(schemaSql());
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from templates");
  console.log(`Schema is ready on ${db.kind}. Templates stored: ${rows[0].n}`);
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
