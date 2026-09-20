import { readFileSync } from "node:fs";
import path from "node:path";

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Database extends Queryable {
  kind: "postgres" | "pglite";
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function schemaSql(): string {
  return readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
}

async function createPostgres(url: string): Promise<Database> {
  const { Pool } = await import("pg");
  const needsSsl = !/localhost|127\.0\.0\.1/.test(url) && !/sslmode=disable/.test(url);
  const pool = new Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  return {
    kind: "postgres",
    async query<T>(text: string, params?: unknown[]) {
      const result = await pool.query(text, params);
      return { rows: result.rows as T[] };
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const value = await fn({
          async query<R>(text: string, params?: unknown[]) {
            const result = await client.query(text, params);
            return { rows: result.rows as R[] };
          },
        });
        await client.query("commit");
        return value;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function createPglite(dataDir?: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite(dataDir);
  await pg.exec(schemaSql());
  return {
    kind: "pglite",
    async query<T>(text: string, params?: unknown[]) {
      const result = await pg.query<T>(text, params);
      return { rows: result.rows };
    },
    transaction<T>(fn: (tx: Queryable) => Promise<T>) {
      return pg.transaction(async (tx) =>
        fn({
          async query<R>(text: string, params?: unknown[]) {
            const result = await tx.query<R>(text, params);
            return { rows: result.rows };
          },
        })
      ) as Promise<T>;
    },
    close: () => pg.close(),
  };
}

const globalStore = globalThis as unknown as { __templateDb?: Promise<Database> };

export function getDb(): Promise<Database> {
  if (!globalStore.__templateDb) {
    const url = process.env.DATABASE_URL;
    if (url) {
      globalStore.__templateDb = createPostgres(url);
    } else if (process.env.VERCEL) {
      globalStore.__templateDb = Promise.reject(
        new Error("DATABASE_URL is not set. Add the Supabase connection string in the Vercel project settings.")
      );
    } else {
      globalStore.__templateDb = createPglite(path.join(process.cwd(), ".data", "pglite"));
    }
    globalStore.__templateDb.catch(() => {
      globalStore.__templateDb = undefined;
    });
  }
  return globalStore.__templateDb;
}
