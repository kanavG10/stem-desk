import { NextResponse } from "next/server";
import { all, run } from "@/lib/db";
import type { Mention } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const editorId = Number(new URL(req.url).searchParams.get("editorId") ?? 1);
  return NextResponse.json({
    mentions: all<Mention & { actor_name: string | null }>(
      `SELECT m.*, e.name AS actor_name FROM mentions m
         LEFT JOIN editors e ON e.id = m.actor_id
        WHERE m.editor_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 100`,
      editorId
    ),
  });
}

export async function POST(req: Request) {
  const { editorId, id } = (await req.json()) as { editorId?: number; id?: number };
  if (id) run("UPDATE mentions SET seen = 1 WHERE id = ?", id);
  else if (editorId) run("UPDATE mentions SET seen = 1 WHERE editor_id = ?", editorId);
  return NextResponse.json({ ok: true });
}
