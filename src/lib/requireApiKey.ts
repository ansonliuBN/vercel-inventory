import { NextResponse } from "next/server";

export function requireApiKey(req: Request) {
  const expected = process.env.INVENTORY_API_KEY || "";
  if (!expected) {
    // 沒設 key 的情況下，直接拒絕（避免你以為有保護但其實沒有）
    return NextResponse.json({ ok: false, message: "Server missing INVENTORY_API_KEY" }, { status: 500 });
  }

  const got = req.headers.get("x-api-key") || "";
  if (got !== expected) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  return null; // pass
}
