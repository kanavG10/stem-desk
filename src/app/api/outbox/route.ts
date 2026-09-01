import { NextResponse } from "next/server";
import { all } from "@/lib/db";
import { mailIsLive } from "@/lib/mail";
import type { OutboxItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    mailIsLive: mailIsLive(),
    messages: await all<OutboxItem>("SELECT * FROM outbox ORDER BY id DESC LIMIT 60"),
  });
}
