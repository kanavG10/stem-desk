#!/usr/bin/env node
/**
 * Copies a local SQLite database into the Postgres one, and uploads any spreads on
 * disk to the storage bucket. Run it once, after the deployed app has booted at
 * least once (that is what creates the tables).
 *
 *   DATABASE_URL=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/migrate-to-postgres.mjs
 *
 * Safe to re-run: it refuses to touch a Postgres database that already has stories.
 * Pass --replace to wipe the remote tables first — which is what you want on a fresh
 * project, since the app seeds itself with example stories the first time it boots.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const SQLITE = process.env.SQLITE_PATH ?? "data/stemhub.db";
const UPLOADS = process.env.UPLOAD_PATH ?? "data/uploads";
const BUCKET = process.env.SUPABASE_BUCKET ?? "spreads";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!fs.existsSync(SQLITE)) {
  console.error(`no SQLite database at ${SQLITE}`);
  process.exit(1);
}

const src = new DatabaseSync(SQLITE, { readOnly: true });
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const rows = (table) => src.prepare(`SELECT * FROM ${table}`).all();

async function copy(table, columns) {
  const data = rows(table);
  if (data.length === 0) return 0;
  for (const row of data) {
    const values = columns.map((c) => row[c] ?? null);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");
    // Ids must survive the move, since editor_id / article_id / spread_id point at
    // them. The identity columns are GENERATED ALWAYS, so say so explicitly.
    await pool.query(
      `INSERT INTO ${table} (${columns.join(",")})
       OVERRIDING SYSTEM VALUE
       VALUES (${placeholders})
       ON CONFLICT (id) DO NOTHING`,
      values
    );
  }
  // Identity columns do not know about the ids we just forced in.
  await pool.query(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'),
            GREATEST((SELECT MAX(id) FROM ${table}), 1))`
  );
  return data.length;
}

async function uploadSpreads() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log("  (no bucket configured — skipping PDF upload)");
    return;
  }
  for (const spread of rows("spreads")) {
    const file = path.join(UPLOADS, spread.stored_name);
    if (!fs.existsSync(file)) {
      console.log(`  missing on disk, skipped: ${spread.stored_name}`);
      continue;
    }
    const body = fs.readFileSync(file);
    const res = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${spread.stored_name}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/pdf",
          "x-upsert": "true",
        },
        body,
      }
    );
    console.log(
      `  ${res.ok ? "uploaded" : `FAILED ${res.status}`}  ${spread.filename} ` +
        `(${(body.length / 1048576).toFixed(1)} MB)`
    );
  }
}

const TABLES = [
  "annotation_replies", "annotations", "article_notes", "mentions",
  "outbox", "todos", "spreads", "articles", "editors",
];

const replace = process.argv.includes("--replace");
const existing = await pool.query("SELECT COUNT(*)::int AS n FROM articles");

if (existing.rows[0].n > 0 && !replace) {
  console.error(
    `Postgres already holds ${existing.rows[0].n} stories. Refusing to overwrite.\n` +
      "Re-run with --replace if you meant to clear it and import from SQLite."
  );
  process.exit(1);
}

if (replace) {
  console.log(`Clearing ${existing.rows[0].n} existing stories and everything attached…`);
  await pool.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

console.log("Copying rows…");
for (const [table, columns] of [
  ["editors", ["id", "name", "handle", "email", "role", "created_at"]],
  ["articles", ["id", "title", "writers", "week", "editor_id", "folder_made", "draft",
    "section_edits", "managing_edits", "eic_edits", "huang_edits", "huang_needed",
    "copy_edits", "spiked", "published", "note", "last_contact", "stage_moved_at",
    "archived", "created_at", "updated_at"]],
  ["article_notes", ["id", "article_id", "parent_id", "author_id", "body", "resolved", "created_at"]],
  ["todos", ["id", "text", "done", "assignee_id", "article_id", "due_date", "created_by",
    "created_at", "done_at"]],
  ["spreads", ["id", "title", "issue", "page_label", "filename", "stored_name", "size_bytes",
    "uploaded_by", "created_at"]],
  ["annotations", ["id", "spread_id", "page", "x", "y", "w", "h", "body", "author_id",
    "resolved", "created_at"]],
  ["annotation_replies", ["id", "annotation_id", "author_id", "body", "created_at"]],
  ["mentions", ["id", "editor_id", "actor_id", "context_type", "context_id", "context_label",
    "excerpt", "url", "seen", "created_at"]],
]) {
  const n = await copy(table, columns);
  console.log(`  ${table.padEnd(20)} ${n}`);
}

console.log("Uploading spreads…");
await uploadSpreads();

await pool.end();
console.log("Done.");
