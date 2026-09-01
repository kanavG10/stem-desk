import { NextResponse } from "next/server";
import { all, one, run, stamp } from "@/lib/db";
import { createUploadUrl, newStoredName } from "@/lib/storage";
import type { Spread } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    spreads: await all<Spread>(
      `SELECT s.*,
              (SELECT CAST(COUNT(*) AS INTEGER) FROM annotations a
                WHERE a.spread_id = s.id AND a.resolved = 0) AS open_notes,
              (SELECT CAST(COUNT(*) AS INTEGER) FROM annotations a
                WHERE a.spread_id = s.id) AS total_notes
         FROM spreads s ORDER BY s.created_at DESC, s.id DESC`
    ),
  });
}

/**
 * Step one of an upload: hand back a name and a URL to PUT the PDF to. The file
 * itself never passes through this app, so a 25 MB spread is fine even on a host
 * that caps request bodies at a few megabytes.
 */
export async function POST() {
  const storedName = newStoredName();
  try {
    return NextResponse.json({ storedName, uploadUrl: await createUploadUrl(storedName) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "could not start upload" },
      { status: 500 }
    );
  }
}

/** Step two: the PDF is in storage, record what it is. */
export async function PUT(req: Request) {
  const b = (await req.json()) as {
    storedName?: string;
    filename?: string;
    title?: string;
    issue?: string;
    page_label?: string;
    size_bytes?: number;
    actorId?: number;
  };
  if (!b.storedName || !/^[0-9a-f-]{36}\.pdf$/i.test(b.storedName)) {
    return NextResponse.json({ error: "storedName required" }, { status: 400 });
  }

  const res = await run(
    `INSERT INTO spreads (title, issue, page_label, filename, stored_name, size_bytes, uploaded_by, created_at)
     VALUES (?,?,?,?,?,?,?,?) RETURNING id`,
    (b.title || b.filename?.replace(/\.pdf$/i, "") || "Untitled spread").slice(0, 200),
    b.issue ?? "",
    b.page_label ?? "",
    b.filename ?? b.storedName,
    b.storedName,
    b.size_bytes ?? 0,
    b.actorId ?? null,
    stamp()
  );

  return NextResponse.json(
    { spread: await one<Spread>("SELECT * FROM spreads WHERE id = ?", res.id) },
    { status: 201 }
  );
}
