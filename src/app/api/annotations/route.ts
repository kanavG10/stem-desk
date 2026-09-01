import { NextResponse } from "next/server";
import { one, run } from "@/lib/db";
import { processMentions } from "@/lib/mentions";
import type { Annotation, Spread } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json()) as {
    spread_id: number;
    page: number;
    x: number;
    y: number;
    w?: number;
    h?: number;
    body: string;
    actorId?: number;
  };
  const body = (b.body ?? "").trim();
  if (!b.spread_id || !body) {
    return NextResponse.json({ error: "spread_id and body required" }, { status: 400 });
  }

  const x = clamp(b.x);
  const y = clamp(b.y);
  const res = run(
    "INSERT INTO annotations (spread_id, page, x, y, w, h, body, author_id) VALUES (?,?,?,?,?,?,?,?)",
    b.spread_id,
    b.page ?? 1,
    x,
    y,
    clamp(b.w ?? 0, 1 - x),
    clamp(b.h ?? 0, 1 - y),
    body,
    b.actorId ?? null
  );
  const annotation = one<Annotation>(
    "SELECT * FROM annotations WHERE id = ?",
    Number(res.lastInsertRowid)
  )!;

  const spread = one<Spread>("SELECT * FROM spreads WHERE id = ?", b.spread_id);
  const tagged = await processMentions({
    text: body,
    actorId: b.actorId ?? null,
    contextType: "annotation",
    contextId: annotation.id,
    contextLabel: `${spread?.title ?? "Spread"} · p.${annotation.page}`,
    url: `/spreads/${b.spread_id}?note=${annotation.id}`,
  });

  return NextResponse.json(
    { annotation: { ...annotation, replies: [] }, notified: tagged.map((e) => e.name) },
    { status: 201 }
  );
}

const clamp = (n: number, max = 1) => Math.min(max, Math.max(0, Number(n) || 0));
