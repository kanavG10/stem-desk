import { NextResponse } from "next/server";
import { all, one, run } from "@/lib/db";
import { processMentions } from "@/lib/mentions";
import type { Todo } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    todos: all<Todo>(
      "SELECT * FROM todos ORDER BY done, (due_date IS NULL), due_date, id DESC"
    ),
  });
}

export async function POST(req: Request) {
  const b = (await req.json()) as Partial<Todo> & { actorId?: number };
  const text = (b.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

  const res = run(
    "INSERT INTO todos (text, assignee_id, article_id, due_date, created_by) VALUES (?,?,?,?,?)",
    text,
    b.assignee_id ?? null,
    b.article_id ?? null,
    b.due_date ?? null,
    b.actorId ?? null
  );
  const todo = one<Todo>("SELECT * FROM todos WHERE id = ?", Number(res.lastInsertRowid))!;

  const tagged = await processMentions({
    text,
    actorId: b.actorId ?? null,
    contextType: "todo",
    contextId: todo.id,
    contextLabel: text.slice(0, 60),
    url: "/todos",
  });

  return NextResponse.json({ todo, notified: tagged.map((e) => e.name) }, { status: 201 });
}
