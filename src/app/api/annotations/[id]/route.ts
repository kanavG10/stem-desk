import { NextResponse } from "next/server";
import { one, run } from "@/lib/db";
import type { Annotation } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { resolved?: boolean | number; body?: string };
  if (b.resolved !== undefined)
    run("UPDATE annotations SET resolved = ? WHERE id = ?", b.resolved ? 1 : 0, Number(id));
  if (typeof b.body === "string")
    run("UPDATE annotations SET body = ? WHERE id = ?", b.body, Number(id));
  return NextResponse.json({
    annotation: one<Annotation>("SELECT * FROM annotations WHERE id = ?", Number(id)),
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  run("DELETE FROM annotations WHERE id = ?", Number(id));
  return NextResponse.json({ ok: true });
}
