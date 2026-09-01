import { NextResponse } from "next/server";
import { all, one, run, stamp } from "@/lib/db";
import { processMentions } from "@/lib/mentions";
import type { Article, ArticleNote } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await all<ArticleNote>(
    "SELECT * FROM article_notes WHERE article_id = ? ORDER BY created_at, id",
    Number(id)
  );
  return NextResponse.json({
    notes: rows
      .filter((n) => n.parent_id === null)
      .map((n) => ({ ...n, replies: rows.filter((r) => r.parent_id === n.id) })),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { body: string; parent_id?: number; actorId?: number };
  const body = (b.body ?? "").trim();
  if (!body) return NextResponse.json({ error: "body required" }, { status: 400 });

  const article = await one<Article>("SELECT * FROM articles WHERE id = ?", Number(id));
  if (!article) return NextResponse.json({ error: "not found" }, { status: 404 });

  const res = await run(
    "INSERT INTO article_notes (article_id, parent_id, author_id, body, created_at) VALUES (?,?,?,?,?) RETURNING id",
    article.id,
    b.parent_id ?? null,
    b.actorId ?? null,
    body,
    stamp()
  );
  const note = (await one<ArticleNote>(
    "SELECT * FROM article_notes WHERE id = ?",
    res.id
  ))!;

  const label = article.title || "Untitled story";
  const url = `/articles?story=${article.id}`;
  const tagged = await processMentions({
    text: body,
    actorId: b.actorId ?? null,
    contextType: "article",
    contextId: article.id,
    contextLabel: label,
    url,
  });

  // A reply always reaches the person whose note it answers.
  if (b.parent_id) {
    const parent = await one<ArticleNote>(
      "SELECT * FROM article_notes WHERE id = ?",
      b.parent_id
    );
    const authorId = parent?.author_id ?? null;
    if (authorId && authorId !== (b.actorId ?? null) && !tagged.some((e) => e.id === authorId)) {
      const author = await one<{ handle: string }>("SELECT handle FROM editors WHERE id = ?", authorId);
      if (author) {
        await processMentions({
          text: `@${author.handle} ${body}`,
          actorId: b.actorId ?? null,
          contextType: "article",
          contextId: article.id,
          contextLabel: label,
          url,
        });
      }
    }
  }

  return NextResponse.json({ note: { ...note, replies: [] } }, { status: 201 });
}
