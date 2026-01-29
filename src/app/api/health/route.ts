import { NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  return NextResponse.json({
    hasUrl: url.length > 0,
    hasKey: key.length > 0,
    urlLength: url.length,
    keyLength: key.length
  });
}
