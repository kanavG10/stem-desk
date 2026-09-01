import { NextResponse } from "next/server";
import { one, run, stamp } from "@/lib/db";
import { processMentions } from "@/lib/mentions";
import type { Annotation, Reply, Spread } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { body: string; actorId?: number };
  const body = (b.body ?? "").trim();
  if (!body) return NextResponse.json({ error: "body required" }, { status: 400 });

  const annotation = await one<Annotation>("SELECT * FROM annotations WHERE id = ?", Number(id));
  if (!annotation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const res = await run(
    "INSERT INTO annotation_replies (annotation_id, author_id, body, created_at) VALUES (?,?,?,?) RETURNING id",
    annotation.id,
    b.actorId ?? null,
    body,
    stamp()
  );
  const reply = (await one<Reply>(
    "SELECT * FROM annotation_replies WHERE id = ?",
    res.id
  ))!;

  const spread = await one<Spread>("SELECT * FROM spreads WHERE id = ?", annotation.spread_id);

  // Tag anyone named in the reply, and always loop in the thread's author.
  const mentioned = await processMentions({
    text: body,
    actorId: b.actorId ?? null,
    contextType: "reply",
    contextId: annotation.id,
    contextLabel: `${spread?.title ?? "Spread"} · p.${annotation.page}`,
    url: `/spreads/${annotation.spread_id}?note=${annotation.id}`,
  });

  if (annotation.author_id && annotation.author_id !== (b.actorId ?? null)) {
    const alreadyTagged = mentioned.some((e) => e.id === annotation.author_id);
    if (!alreadyTagged) {
      const author = await one<{ handle: string }>(
        "SELECT handle FROM editors WHERE id = ?",
        annotation.author_id
      );
      if (author) {
        await processMentions({
          text: `@${author.handle} ${body}`,
          actorId: b.actorId ?? null,
          contextType: "reply",
          contextId: annotation.id,
          contextLabel: `${spread?.title ?? "Spread"} · p.${annotation.page}`,
          url: `/spreads/${annotation.spread_id}?note=${annotation.id}`,
        });
      }
    }
  }

  return NextResponse.json({ reply }, { status: 201 });
}
