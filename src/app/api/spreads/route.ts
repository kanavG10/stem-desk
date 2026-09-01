import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { all, one, run, UPLOAD_DIR } from "@/lib/db";
import type { Spread } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_BYTES = 60 * 1024 * 1024;

export async function GET() {
  return NextResponse.json({
    spreads: all<Spread>(
      `SELECT s.*,
              (SELECT COUNT(*) FROM annotations a WHERE a.spread_id = s.id AND a.resolved = 0) AS open_notes,
              (SELECT COUNT(*) FROM annotations a WHERE a.spread_id = s.id) AS total_notes
         FROM spreads s ORDER BY s.created_at DESC, s.id DESC`
    ),
  });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "only PDF spreads are accepted" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "PDF is larger than 60 MB" }, { status: 413 });
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const storedName = `${crypto.randomUUID()}.pdf`;
  await fs.writeFile(path.join(UPLOAD_DIR, storedName), Buffer.from(await file.arrayBuffer()));

  const res = run(
    `INSERT INTO spreads (title, issue, page_label, filename, stored_name, size_bytes, uploaded_by)
     VALUES (?,?,?,?,?,?,?)`,
    String(form.get("title") || file.name.replace(/\.pdf$/i, "")),
    String(form.get("issue") || ""),
    String(form.get("page_label") || ""),
    file.name,
    storedName,
    file.size,
    Number(form.get("actorId")) || null
  );

  return NextResponse.json(
    { spread: one<Spread>("SELECT * FROM spreads WHERE id = ?", Number(res.lastInsertRowid)) },
    { status: 201 }
  );
}
