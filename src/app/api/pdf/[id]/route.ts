import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { one, UPLOAD_DIR } from "@/lib/db";
import type { Spread } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Streams the stored PDF. Filenames are UUIDs from the DB, never user input. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const spread = one<Spread>("SELECT * FROM spreads WHERE id = ?", Number(id));
  if (!spread) return new NextResponse("not found", { status: 404 });

  try {
    const bytes = await fs.readFile(path.join(UPLOAD_DIR, spread.stored_name));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(spread.filename)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("file missing on disk", { status: 410 });
  }
}
