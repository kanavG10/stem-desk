import { NextResponse } from "next/server";
import { all } from "@/lib/db";
import { mailIsLive } from "@/lib/mail";
import type { Editor } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    editors: all<Editor>("SELECT * FROM editors ORDER BY id"),
    mailIsLive: mailIsLive(),
  });
}
