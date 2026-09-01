import { NextResponse } from "next/server";
import { one, run } from "@/lib/db";
import type { Todo } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as Partial<Todo>;

  if (typeof b.done === "number" || typeof b.done === "boolean") {
    const done = b.done ? 1 : 0;
    run(
      "UPDATE todos SET done = ?, done_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END WHERE id = ?",
      done,
      done,
      Number(id)
    );
  }
  for (const f of ["text", "assignee_id", "article_id", "due_date"] as const) {
    if (f in b) run(`UPDATE todos SET ${f} = ? WHERE id = ?`, b[f] as never, Number(id));
  }
  return NextResponse.json({ todo: one<Todo>("SELECT * FROM todos WHERE id = ?", Number(id)) });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  run("DELETE FROM todos WHERE id = ?", Number(id));
  return NextResponse.json({ ok: true });
}
