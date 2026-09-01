import { NextResponse } from "next/server";
import { readLocal, safeName, writeLocal } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The local stand-in for a storage bucket. Only used when SUPABASE_URL is unset —
 * deployed, the browser PUTs to Supabase directly and never touches this route.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  try {
    const bytes = Buffer.from(await req.arrayBuffer());
    await writeLocal(safeName(name), bytes);
    return NextResponse.json({ ok: true, size: bytes.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "upload failed" },
      { status: 400 }
    );
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  try {
    const bytes = await readLocal(safeName(name));
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
