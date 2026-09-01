import { NextResponse } from "next/server";
import { all, one, run } from "@/lib/db";
import { flagsFor } from "@/lib/digest";
import type { Article } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const articles = all<Article>(
    `SELECT a.*,
            (SELECT COUNT(*) FROM article_notes n
              WHERE n.article_id = a.id AND n.parent_id IS NULL) AS note_count
       FROM articles a
      WHERE a.archived = 0
      ORDER BY a.week, a.id`
  );
  return NextResponse.json({ articles: articles.map((a) => ({ ...a, flags: flagsFor(a) })) });
}

export async function POST(req: Request) {
  const b = (await req.json()) as Partial<Article>;
  const res = run(
    `INSERT INTO articles (title, writers, week, editor_id, huang_needed, note)
     VALUES (?,?,?,?,?,?)`,
    b.title?.trim() ?? "",
    b.writers ?? "",
    b.week ?? "",
    b.editor_id ?? null,
    b.huang_needed ?? 0,
    b.note ?? ""
  );
  const article = one<Article>("SELECT * FROM articles WHERE id = ?", Number(res.lastInsertRowid))!;
  return NextResponse.json({ article: { ...article, flags: flagsFor(article) } }, { status: 201 });
}


