import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { createReadUrl } from "@/lib/storage";
import type { Spread } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Redirects to wherever the PDF actually lives — a signed bucket URL in production,
 * the local blob route in development. Streaming 25 MB through a function on every
 * page view would be slow and, on metered hosts, expensive.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const spread = await one<Spread>("SELECT * FROM spreads WHERE id = ?", Number(id));
  if (!spread) return new NextResponse("not found", { status: 404 });

  try {
    return NextResponse.redirect(
      new URL(await createReadUrl(spread.stored_name), _req.url),
      { status: 307 }
    );
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "unavailable", { status: 502 });
  }
}
