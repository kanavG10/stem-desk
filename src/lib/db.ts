import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS editors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  handle     TEXT NOT NULL UNIQUE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'editor',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS articles (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
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
  stage_moved_at TEXT NOT NULL DEFAULT (date('now')),
  archived       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS article_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  parent_id  INTEGER REFERENCES article_notes(id) ON DELETE CASCADE,
  author_id  INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  body       TEXT NOT NULL,
  resolved   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  text        TEXT NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  assignee_id INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  article_id  INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  due_date    TEXT,
  created_by  INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  done_at     TEXT
);

CREATE TABLE IF NOT EXISTS spreads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  issue       TEXT NOT NULL DEFAULT '',
  page_label  TEXT NOT NULL DEFAULT '',
  filename    TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS annotations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  spread_id  INTEGER NOT NULL REFERENCES spreads(id) ON DELETE CASCADE,
  page       INTEGER NOT NULL DEFAULT 1,
  x          REAL NOT NULL,
  y          REAL NOT NULL,
  w          REAL NOT NULL DEFAULT 0,
  h          REAL NOT NULL DEFAULT 0,
  body       TEXT NOT NULL,
  author_id  INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  resolved   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS annotation_replies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  annotation_id INTEGER NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  author_id     INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  body          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mentions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  editor_id     INTEGER NOT NULL REFERENCES editors(id) ON DELETE CASCADE,
  actor_id      INTEGER REFERENCES editors(id) ON DELETE SET NULL,
  context_type  TEXT NOT NULL,
  context_id    INTEGER,
  context_label TEXT NOT NULL DEFAULT '',
  excerpt       TEXT NOT NULL DEFAULT '',
  url           TEXT NOT NULL DEFAULT '/',
  seen          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email   TEXT NOT NULL,
  to_name    TEXT NOT NULL DEFAULT '',
  subject    TEXT NOT NULL,
  html       TEXT NOT NULL,
  text       TEXT NOT NULL DEFAULT '',
  kind       TEXT NOT NULL DEFAULT 'notification',
  status     TEXT NOT NULL DEFAULT 'queued',
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_annotations_spread ON annotations(spread_id);
CREATE INDEX IF NOT EXISTS idx_mentions_editor ON mentions(editor_id, seen);
CREATE INDEX IF NOT EXISTS idx_todos_done ON todos(done);
CREATE INDEX IF NOT EXISTS idx_article_notes ON article_notes(article_id, parent_id);
`;

function iso(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Seed rows mirror the section's real tracker so nothing starts empty. */
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

function seed(db: DatabaseSync) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM editors").get() as { n: number };
  if (count.n > 0) return;

  const insEditor = db.prepare(
    "INSERT INTO editors (name, handle, email, role) VALUES (?, ?, ?, ?)"
  );
  insEditor.run("Kanav Gupta", "kanav", "28kanavg@students.harker.org", "STEM Editor");
  insEditor.run("Saria Lum", "saria", "28sarial@students.harker.org", "STEM Editor");

  const insArticle = db.prepare(`INSERT INTO articles
    (title, writers, week, editor_id, folder_made, draft, section_edits, managing_edits,
     eic_edits, huang_edits, copy_edits, huang_needed, note, stage_moved_at, last_contact)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const [title, writers, week, editorId, s, huang, note, moved, contact] of SEED_ARTICLES) {
    insArticle.run(
      title, writers, week, editorId,
      s[0], s[1], s[2], s[3], s[4], s[5], s[6],
      huang, note, iso(-moved), iso(-contact)
    );
  }

  const insTodo = db.prepare(
    "INSERT INTO todos (text, assignee_id, article_id, due_date, created_by, done) VALUES (?,?,?,?,?,?)"
  );
  insTodo.run("@saria the meteor shower piece hasn't moved in two weeks — kill it or reassign?", 2, 5, iso(0), 1, 0);
  insTodo.run("Ask Ms. Huang when she can read amy jin bfts", 1, 3, iso(1), 1, 0);
  insTodo.run("Section edits on ss sunscreen", 2, 1, iso(0), 1, 0);
  insTodo.run("Pull art for the el nino explainer", 1, 8, iso(2), 1, 0);
  insTodo.run("Set the Week 2 budget", 1, null, iso(-1), 1, 1);

  const insNote = db.prepare(
    "INSERT INTO article_notes (article_id, parent_id, author_id, body) VALUES (?,?,?,?)"
  );
  const first = Number(
    insNote.run(5, null, 1, "@saria this has sat at draft for two weeks. Spike it or hand it to someone else?").lastInsertRowid
  );
  insNote.run(5, first, 2, "Give me until Friday — Cynthia says she has 600 words.");
  insNote.run(3, null, 2, "Ms. Huang wants to read this one before it goes to copy.");
}

/**
 * Brings an existing database up to the current schema. New installs get everything
 * from SCHEMA and skip all of this, so each step has to be safe to run on a database
 * that is already correct.
 */
function migrate(db: DatabaseSync) {
  const columns = (table: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

  const articleCols = columns("articles");

  if (!articleCols.includes("published")) {
    db.exec("ALTER TABLE articles ADD COLUMN published INTEGER NOT NULL DEFAULT 0");
  }

  // Story notes used to be one free-text field. Carry whatever is in it across to the
  // threaded notes table before the column goes.
  if (articleCols.includes("notes")) {
    const carried = db
      .prepare("SELECT id, editor_id, notes FROM articles WHERE trim(notes) <> ''")
      .all() as { id: number; editor_id: number | null; notes: string }[];
    const ins = db.prepare(
      "INSERT INTO article_notes (article_id, author_id, body) VALUES (?,?,?)"
    );
    for (const row of carried) ins.run(row.id, row.editor_id, row.notes);
    db.exec("ALTER TABLE articles DROP COLUMN notes");
  }

  // Seeded placeholder addresses become the real ones.
  db.prepare("UPDATE editors SET email = ? WHERE handle = ? AND email <> ?")
    .run("28kanavg@students.harker.org", "kanav", "28kanavg@students.harker.org");
  db.prepare("UPDATE editors SET email = ? WHERE handle = ? AND email <> ?")
    .run("28sarial@students.harker.org", "saria", "28sarial@students.harker.org");

  // The bundled example spread was noise; drop it and its file.
  const sample = db
    .prepare("SELECT id, stored_name FROM spreads WHERE stored_name = 'sample-week-1-b6.pdf'")
    .get() as { id: number; stored_name: string } | undefined;
  if (sample) {
    db.prepare("DELETE FROM spreads WHERE id = ?").run(sample.id);
    fs.rmSync(path.join(UPLOAD_DIR, sample.stored_name), { force: true });
  }
}

function create(): DatabaseSync {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  // `timeout` makes concurrent openers wait for the lock instead of throwing, which
  // matters during a production build: Next spins up several workers at once and each
  // one would otherwise race to create and seed the file.
  const db = new DatabaseSync(path.join(DATA_DIR, "stemhub.db"), { timeout: 10_000 });
  db.exec(PRAGMAS);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(SCHEMA);
    migrate(db);
    seed(db);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return db;
}

const g = globalThis as unknown as { __stemhub_db?: DatabaseSync };

/**
 * Opened on first query, never at module load — importing a route file must not touch
 * the filesystem, or `next build` fails while it is only collecting route config.
 */
export function db(): DatabaseSync {
  return (g.__stemhub_db ??= create());
}

/** Small helpers so route handlers stay short. */
export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...(params as never[])) as T[];
}
export function one<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  return db().prepare(sql).get(...(params as never[])) as T | undefined;
}
export function run(sql: string, ...params: unknown[]) {
  return db().prepare(sql).run(...(params as never[]));
}
