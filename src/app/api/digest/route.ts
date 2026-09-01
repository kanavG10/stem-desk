import { NextResponse } from "next/server";
import { buildDigest, renderDigestHtml, sendDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";

/** Preview: returns the digest data plus the exact HTML that would be emailed. */
export async function GET() {
  const data = buildDigest();
  return NextResponse.json({ data, html: renderDigestHtml(data) });
}

/** Send it. Called by the "Send now" button and by scripts/digest.mjs on a cron. */
export async function POST(req: Request) {
  const secret = process.env.DIGEST_SECRET;
  if (secret && req.headers.get("x-digest-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { recipients, results } = await sendDigest();
  return NextResponse.json({ recipients, results: results.map((r) => r.status) });
}
