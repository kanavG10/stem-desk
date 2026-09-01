import { NextResponse } from "next/server";
import { sendDigest } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron only issues GET requests, so the scheduled send lives here rather than
 * on POST /api/digest. Vercel signs its calls with CRON_SECRET; anything else has to
 * present it as a bearer token.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const { recipients, results } = await sendDigest();
  return NextResponse.json({
    ok: true,
    recipients,
    results: results.map((r) => r.status),
  });
}
