import { NextResponse } from "next/server";
import { one, run, stamp, todayStamp } from "@/lib/db";
import { flagsFor } from "@/lib/digest";
import { STAGES, type Article } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGE_KEYS = STAGES.map((s) => s.key) as string[];

const EDITABLE = new Set([
  "title", "writers", "week", "editor_id", "huang_needed", "spiked", "published",
  "note", "last_contact", "archived",
  ...STAGE_KEYS,
]);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Record<string, unknown> & { actorId?: number };

  const fields = Object.keys(body).filter((k) => EDITABLE.has(k));
  if (fields.length === 0) return NextResponse.json({ error: "no editable fields" }, { status: 400 });

  // Moving through the editing chain resets the stall clock; renaming a story doesn't.
  const touchedStage = fields.some((f) => STAGE_KEYS.includes(f));
  const extra = touchedStage ? ", stage_moved_at = ?" : "";

  await run(
    `UPDATE articles SET ${fields.map((f) => `${f} = ?`).join(", ")}${extra}, updated_at = ? WHERE id = ?`,
    ...fields.map((f) => body[f] as never),
    ...(touchedStage ? [todayStamp()] : []),
    stamp(),
    Number(id)
  );

  const article = await one<Article>("SELECT * FROM articles WHERE id = ?", Number(id));
  if (!article) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ article: { ...article, flags: flagsFor(article) } });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await run("UPDATE articles SET archived = 1 WHERE id = ?", Number(id));
  return NextResponse.json({ ok: true });
}
