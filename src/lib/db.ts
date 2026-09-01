import fs from "node:fs";
import path from "node:path";
import {
  postgresDriver,
  sqliteDriver,
  stamp,
  todayStamp,
  type Driver,
  type Params,
} from "./sql";

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export { stamp, todayStamp };

/** Postgres when a connection string exists, otherwise a file on this machine. */
export function isPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Written once, run on both engines. Only the identity column differs, so the
 * schema is a template with `${ID}` filled in per engine.
 */
function schema(ID: string): string {
  return `
CREATE TABLE IF NOT EXISTS editors (
  id         ${ID},
  name       TEXT NOT NULL,
  handle     TEXT NOT NULL UNIQUE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'editor',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
  id             ${ID},
  title          TEXT NOT NULL,
  writers        TEXT NOT NULL DEFAULT '',
  week           TEXT NOT NULL DEFAULT '',
  editor_id      INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  folder_made    INTEGER NOT NULL DEFAULT 0,
  draft          INTEGER NOT NULL DEFAULT 0,
  section_edits  INTEGER NOT NULL DEFAULT 0,
  managing_edits INTEGER NOT NULL DEFAULT 0,
  eic_edits      INTEGER NOT NULL DEFAULT 0,
  huang_edits    INTEGER NOT NULL DEFAULT 0,
  huang_needed   INTEGER NOT NULL DEFAULT 0,
  copy_edits     INTEGER NOT NULL DEFAULT 0,
  spiked         INTEGER NOT NULL DEFAULT 0,
  published      INTEGER NOT NULL DEFAULT 0,
  note           TEXT NOT NULL DEFAULT '',
  last_contact   TEXT,
  stage_moved_at TEXT NOT NULL,
  archived       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article_notes (
  id         ${ID},
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES article_notes(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  resolved   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
  id          ${ID},
  text        TEXT NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  assignee_id INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  article_id  INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  due_date    TEXT,
  created_by  INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  done_at     TEXT
);

CREATE TABLE IF NOT EXISTS spreads (
  id          ${ID},
  title       TEXT NOT NULL,
  issue       TEXT NOT NULL DEFAULT '',
  page_label  TEXT NOT NULL DEFAULT '',
  filename    TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS annotations (
  id         ${ID},
  spread_id  INTEGER NOT NULL REFERENCES spreads(id) ON DELETE CASCADE,
  page       INTEGER NOT NULL DEFAULT 1,
  x          REAL NOT NULL,
  y          REAL NOT NULL,
  w          REAL NOT NULL DEFAULT 0,
  h          REAL NOT NULL DEFAULT 0,
  body       TEXT NOT NULL,
  author_id  INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  resolved   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS annotation_replies (
  id            ${ID},
  annotation_id INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  author_id     INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mentions (
  id            ${ID},
  editor_id     INTEGER NOT NULL REFERENCES editors(id) ON DELETE CASCADE,
  actor_id      INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  context_type  TEXT NOT NULL,
  context_id    INTEGER,
  context_label TEXT NOT NULL DEFAULT '',
  excerpt       TEXT NOT NULL DEFAULT '',
  url           TEXT NOT NULL DEFAULT '/',
  seen          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox (
  id         ${ID},
  to_email   TEXT NOT NULL,
  to_name    TEXT NOT NULL DEFAULT '',
  subject    TEXT NOT NULL,
  html       TEXT NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'notification',
  status     TEXT NOT NULL DEFAULT 'queued',
  error      TEXT,
  created_at TEXT NOT NULL,
  sent_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_annotations_spread ON annotations(spread_id);
CREATE INDEX IF NOT EXISTS idx_mentions_editor ON mentions(editor_id, seen);
CREATE INDEX IF NOT EXISTS idx_todos_done ON todos(done);
CREATE INDEX IF NOT EXISTS idx_article_notes ON article_notes(article_id, parent_id);
`;
}

type SeedRow = [
  title: string,
  writers: string,
  week: string,
  editorId: number,
  stages: [number, number, number, number, number, number, number],
  huangNeeded: number,
  note: string,
  movedDaysAgo: number,
  contactDaysAgo: number,
];

const SEED_ARTICLES: SeedRow[] = [
  ["ss sunscreen", "saria, aileen", "Week 1", 2, [1, 1, 0, 0, 0, 0, 0], 0, "", 8, 8],
  ["diarrhea parasite", "saria, leah", "Week 1", 2, [1, 1, 1, 0, 0, 0, 0], 0, "", 3, 2],
  ["amy jin bfts", "claire, madelene", "Week 1", 1, [1, 1, 1, 1, 1, 0, 0], 1, "wp", 2, 4],
  ["proteinmaxxing", "kanav, dyuthi", "Week 1", 1, [1, 1, 1, 0, 0, 0, 0], 0, "", 5, 3],
  ["8/12 meteor shower", "cynthia, elizabeth", "Week 1", 2, [1, 0, 0, 0, 0, 0, 0], 0, "", 13, 13],
  ["ai data centers", "kanav, chelsea", "Week 2", 1, [1, 0, 0, 0, 0, 0, 0], 0, "", 4, 4],
  ["summer stem researchers rr", "lily, nathan", "Week 2", 2, [1, 1, 1, 0, 0, 0, 0], 0, "", 1, 1],
  ["el nino/climate explainer", "kanav", "Week 2", 1, [1, 1, 1, 0, 0, 0, 0], 0, "", 7, 11],
  ["cognitive development w/ AI longform", "claire", "Week 2", 1, [1, 0, 0, 0, 0, 0, 0], 0, "dire", 2, 2],
];

async function seed(d: Driver) {
  const [{ n }] = await d.all<{ n: number }>(
    "SELECT CAST(COUNT(*) AS INTEGER) AS n FROM editors",
    []
  );
  if (Number(n) > 0) return;

  const now = stamp();
  for (const [name, handle, email] of [
    ["Kanav Gupta", "kanav", "28kanavg@students.harker.org"],
    ["Saria Lum", "saria", "28sarial@students.harker.org"],
  ]) {
    await d.run(
      "INSERT INTO editors (name, handle, email, role, created_at) VALUES (?,?,?,?,?)",
      [name, handle, email, "STEM Editor", now]
    );
  }

  for (const [title, writers, week, editorId, s, huang, note, moved, contact] of SEED_ARTICLES) {
    await d.run(
      `INSERT INTO articles
        (title, writers, week, editor_id, folder_made, draft, section_edits, managing_edits,
         eic_edits, huang_edits, copy_edits, huang_needed, note, stage_moved_at, last_contact,
         created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [title, writers, week, editorId, s[0], s[1], s[2], s[3], s[4], s[5], s[6], huang, note,
       todayStamp(-moved), todayStamp(-contact), now, now]
    );
  }

  for (const [text, assignee, articleId, due, done] of [
    ["Section edits on ss sunscreen", 2, 1, todayStamp(0), 0],
    ["Ask Ms. Huang when she can read amy jin bfts", 1, 3, todayStamp(1), 0],
    ["Pull art for the el nino explainer", 1, 8, todayStamp(2), 0],
    ["Set the Week 2 budget", 1, null, todayStamp(-1), 1],
  ] as [string, number, number | null, string, number][]) {
    await d.run(
      "INSERT INTO todos (text, assignee_id, article_id, due_date, created_by, done, created_at) VALUES (?,?,?,?,?,?,?)",
      [text, assignee, articleId, due, 1, done, now]
    );
  }
}

/** Columns added after the first release, applied to databases that predate them. */
async function migrate(d: Driver) {
  const add = async (table: string, column: string, definition: string) => {
    try {
      await d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch {
      /* already there */
    }
  };
  await add("articles", "published", "INTEGER NOT NULL DEFAULT 0");
}

async function connect(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  let d: Driver;

  if (url) {
    d = await postgresDriver(url);
    // Several serverless invocations can boot at once; the lock makes the first
    // one create the schema while the rest wait rather than collide.
    await d.exec("SELECT pg_advisory_lock(548123)");
    try {
      await d.exec(schema("INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY"));
      await migrate(d);
      await seed(d);
    } finally {
      await d.exec("SELECT pg_advisory_unlock(548123)");
    }
  } else {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    d = await sqliteDriver(path.join(DATA_DIR, "stemhub.db"));
    await d.exec(schema("INTEGER PRIMARY KEY AUTOINCREMENT"));
    await migrate(d);
    await seed(d);
  }
  return d;
}

const g = globalThis as unknown as { __stemhub_db?: Promise<Driver> };

/** Opened on first query, never at module load, so `next build` can import routes. */
export function db(): Promise<Driver> {
  return (g.__stemhub_db ??= connect());
}

export async function all<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  return (await db()).all<T>(sql, params as Params);
}

export async function one<T = Record<string, unknown>>(
  sql: string,
  ...params: unknown[]
): Promise<T | undefined> {
  const rows = await (await db()).all<T>(sql, params as Params);
  return rows[0];
}

export async function run(sql: string, ...params: unknown[]): Promise<{ id: number }> {
  return (await db()).run(sql, params as Params);
}
