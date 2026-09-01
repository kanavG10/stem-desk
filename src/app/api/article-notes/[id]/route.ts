import { NextResponse } from "next/server";
import { one, run } from "@/lib/db";
import type { ArticleNote } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { resolved?: boolean; body?: string };
  if (b.resolved !== undefined)
    await run("UPDATE article_notes SET resolved = ? WHERE id = ?", b.resolved ? 1 : 0, Number(id));
  if (typeof b.body === "string")
    await run("UPDATE article_notes SET body = ? WHERE id = ?", b.body, Number(id));
  return NextResponse.json({
    note: await one<ArticleNote>("SELECT * FROM article_notes WHERE id = ?", Number(id)),
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await run("DELETE FROM article_notes WHERE id = ?", Number(id));
  return NextResponse.json({ ok: true });
}
