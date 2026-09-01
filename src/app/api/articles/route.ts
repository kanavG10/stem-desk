import { NextResponse } from "next/server";
import { all, one, run, stamp, todayStamp } from "@/lib/db";
import { flagsFor } from "@/lib/digest";
import type { Article } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const articles = await all<Article>(
    `SELECT a.*,
            (SELECT CAST(COUNT(*) AS INTEGER) FROM article_notes n
              WHERE n.article_id = a.id AND n.parent_id IS NULL) AS note_count
       FROM articles a
      WHERE a.archived = 0
      ORDER BY a.week, a.id`
  );
  return NextResponse.json({ articles: articles.map((a) => ({ ...a, flags: flagsFor(a) })) });
}

export async function POST(req: Request) {
  const b = (await req.json()) as Partial<Article>;
  const now = stamp();
  const res = await run(
    `INSERT INTO articles (title, writers, week, editor_id, huang_needed, note,
       stage_moved_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`,
    b.title?.trim() ?? "",
    b.writers ?? "",
    b.week ?? "",
    b.editor_id ?? null,
    b.huang_needed ?? 0,
    b.note ?? "",
    todayStamp(),
    now,
    now
  );
  const article = (await one<Article>("SELECT * FROM articles WHERE id = ?", res.id))!;
  return NextResponse.json({ article: { ...article, flags: flagsFor(article) } }, { status: 201 });
}


