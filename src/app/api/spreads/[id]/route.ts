import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { all, one, run, UPLOAD_DIR } from "@/lib/db";
import type { Annotation, Reply, Spread } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const spread = one<Spread>("SELECT * FROM spreads WHERE id = ?", Number(id));
  if (!spread) return NextResponse.json({ error: "not found" }, { status: 404 });

  const annotations = all<Annotation>(
    "SELECT * FROM annotations WHERE spread_id = ? ORDER BY page, created_at",
    spread.id
  );
  const replies = all<Reply>(
    `SELECT r.* FROM annotation_replies r
       JOIN annotations a ON a.id = r.annotation_id
      WHERE a.spread_id = ? ORDER BY r.created_at`,
    spread.id
  );

  return NextResponse.json({
    spread,
    annotations: annotations.map((a) => ({
      ...a,
      replies: replies.filter((r) => r.annotation_id === a.id),
    })),
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as Partial<Spread>;
  for (const f of ["title", "issue", "page_label"] as const) {
    if (f in b) run(`UPDATE spreads SET ${f} = ? WHERE id = ?`, b[f] as never, Number(id));
  }
  return NextResponse.json({ spread: one<Spread>("SELECT * FROM spreads WHERE id = ?", Number(id)) });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const spread = one<Spread>("SELECT * FROM spreads WHERE id = ?", Number(id));
  if (!spread) return NextResponse.json({ error: "not found" }, { status: 404 });
  run("DELETE FROM spreads WHERE id = ?", spread.id);
  await fs.rm(path.join(UPLOAD_DIR, spread.stored_name), { force: true });
  return NextResponse.json({ ok: true });
}
