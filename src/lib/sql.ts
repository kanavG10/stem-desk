/**
 * One tiny query interface over two engines: SQLite on a local disk, and Postgres
 * when DATABASE_URL is set. Serverless hosts give you no persistent disk, so the
 * deployed app needs Postgres — but running locally should not need an account.
 *
 * To keep one set of SQL working on both, the rules are:
 *   - always write `?` placeholders (translated to $1..$n for Postgres)
 *   - never use engine-specific date functions; pass `stamp()` / `today()` instead
 *   - end inserts that need their id with `RETURNING id`
 *   - wrap COUNT(*) in CAST(... AS INTEGER), since Postgres counts are bigints
 */

export type Params = readonly unknown[];

export interface Driver {
  all<T>(sql: string, params: Params): Promise<T[]>;
  run(sql: string, params: Params): Promise<{ id: number }>;
  exec(sql: string): Promise<void>;
  readonly kind: "sqlite" | "postgres";
}

/** UTC "YYYY-MM-DD HH:MM:SS" — the shape SQLite's datetime('now') produced. */
export function stamp(date = new Date()): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** UTC "YYYY-MM-DD". */
export function todayStamp(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ SQLite */

export async function sqliteDriver(file: string): Promise<Driver> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file, { timeout: 10_000 });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  return {
    kind: "sqlite",
    async all<T>(sql: string, params: Params) {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    async run(sql: string, params: Params) {
      if (/returning\s+id/i.test(sql)) {
        const row = db.prepare(sql).get(...(params as never[])) as { id?: number } | undefined;
        return { id: Number(row?.id ?? 0) };
      }
      const res = db.prepare(sql).run(...(params as never[]));
      return { id: Number(res.lastInsertRowid ?? 0) };
    },
    async exec(sql: string) {
      db.exec(sql);
    },
  };
}

/* ---------------------------------------------------------------- Postgres */

/** `?` is what we write; `$1..$n` is what Postgres wants. */
function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function postgresDriver(connectionString: string): Promise<Driver> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString,
    // Hosted Postgres requires TLS; their certs are not in Node's trust store.
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
  });

  return {
    kind: "postgres",
    async all<T>(sql: string, params: Params) {
      const res = await pool.query(toPgPlaceholders(sql), params as unknown[]);
      return res.rows as T[];
    },
    async run(sql: string, params: Params) {
      const res = await pool.query(toPgPlaceholders(sql), params as unknown[]);
      const row = res.rows[0] as { id?: number } | undefined;
      return { id: Number(row?.id ?? 0) };
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
  };
}
