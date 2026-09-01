import { NextResponse } from "next/server";
import { one, run } from "@/lib/db";
import type { Editor } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = (await req.json()) as { email?: string; name?: string };

  if (typeof b.email === "string") {
    const email = b.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "that is not an email address" }, { status: 400 });
    }
    run("UPDATE editors SET email = ? WHERE id = ?", email, Number(id));
  }
  if (typeof b.name === "string" && b.name.trim()) {
    run("UPDATE editors SET name = ? WHERE id = ?", b.name.trim(), Number(id));
  }

  const editor = one<Editor>("SELECT * FROM editors WHERE id = ?", Number(id));
  if (!editor) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ editor });
}
