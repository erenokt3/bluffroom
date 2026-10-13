/**
 * Database access layer.
 *
 * Two interchangeable drivers implement the same tiny interface:
 *  - "postgres": postgres.js connected to Supabase Postgres via DATABASE_URL
 *    (use the Supabase *transaction pooler* URL on Vercel).
 *  - "pglite": embedded PostgreSQL (WASM) for local development without any
 *    account and for automated tests. Selected automatically when
 *    DATABASE_URL is not set (never in production unless explicitly allowed).
 *
 * Both run the exact same SQL migrations from supabase/migrations.
 */
import { readdir, readFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type Row = Record<string, unknown>;

export interface Sql {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Run one or more statements without parameters (simple protocol). */
  exec(sqlText: string): Promise<void>;
}

export interface Db extends Sql {
  kind: "postgres" | "pglite";
  tx<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/* ----------------------------- postgres.js ------------------------------ */

async function createPostgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const client = postgres(url, {
    prepare: false, // required for Supabase transaction pooler (pgbouncer)
    max: Number(process.env.DATABASE_POOL_MAX ?? 3),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  const q = async <T>(runner: typeof client, text: string, params: unknown[] = []) =>
    [...(await runner.unsafe(text, params as never[]))] as unknown as T[];
  return {
    kind: "postgres",
    query: (text, params) => q(client, text, params),
    tx: async (fn) =>
      (await client.begin(async (tx) =>
        fn({
          query: (text, params) => q(tx as unknown as typeof client, text, params),
          exec: async (text) => {
            await tx.unsafe(text).simple();
          },
        }),
      )) as never,
    exec: async (text) => {
      await client.unsafe(text).simple();
    },
    close: async () => {
      await client.end({ timeout: 5 });
    },
  };
}

/* -------------------------------- PGlite -------------------------------- */

export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir && dataDir !== "memory://") {
    await mkdir(dataDir, { recursive: true });
  }
  const pg = dataDir && dataDir !== "memory://" ? new PGlite(dataDir) : new PGlite();
  await pg.waitReady;
  return {
    kind: "pglite",
    query: async <T>(text: string, params: unknown[] = []) =>
      (await pg.query(text, params)).rows as T[],
    tx: (fn) =>
      pg.transaction(async (tx) =>
        fn({
          query: async <T>(text: string, params: unknown[] = []) => (await tx.query(text, params)).rows as T[],
          exec: async (text: string) => {
            await tx.exec(text);
          },
        }),
      ),
    exec: async (text) => {
      await pg.exec(text);
    },
    close: async () => {
      await pg.close();
    },
  };
}

/* ------------------------------ migrations ------------------------------ */

export async function runMigrations(db: Db, dir = path.join(process.cwd(), "supabase", "migrations")) {
  await db.exec(
    `create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());
     alter table schema_migrations enable row level security;`,
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(
    (await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name),
  );
  for (const file of files) {
    if (applied.has(file)) continue;
    const sqlText = await readFile(path.join(dir, file), "utf8");
    await db.tx(async (tx) => {
      await tx.exec(sqlText);
      await tx.query("insert into schema_migrations (name) values ($1)", [file]);
    });
  }
}

/* ------------------------------- singleton ------------------------------ */

const globalForDb = globalThis as unknown as { __bluffDb?: Promise<Db> };

export function getDbKind(): "postgres" | "pglite" {
  return process.env.DATABASE_URL ? "postgres" : "pglite";
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__bluffDb) {
    globalForDb.__bluffDb = (async () => {
      const url = process.env.DATABASE_URL;
      if (url) return createPostgresDb(url);
      if (process.env.VERCEL && process.env.ALLOW_PGLITE_IN_PRODUCTION !== "true") {
        throw new Error(
          "DATABASE_URL tanımlı değil. Vercel üzerinde Supabase Postgres bağlantısı zorunludur.",
        );
      }
      const dir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
      const db = await createPgliteDb(dir);
      await runMigrations(db);
      return db;
    })().catch((err) => {
      globalForDb.__bluffDb = undefined;
      throw err;
    });
  }
  return globalForDb.__bluffDb;
}

/** Test helper: replace the global database. */
export function setDbForTests(db: Db | undefined) {
  globalForDb.__bluffDb = db ? Promise.resolve(db) : undefined;
}
