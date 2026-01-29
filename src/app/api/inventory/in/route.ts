import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApiKey } from "@/lib/requireApiKey";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const deny = requireApiKey(req);
  if (deny) return deny;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const {
    record_date,
    location,
    product_name,
    barcode,
    expiry,
    qty,
    gs1_key,
    handler,
    note,
  } = body;

  if (!location || !product_name || !qty || qty <= 0) {
    return NextResponse.json(
      { ok: false, message: "location, product_name and qty (>0) are required" },
      { status: 400 }
    );
  }

  const payload = {
    type: "IN",
    record_date,
    location,
    product_name,
    barcode,
    expiry,
    qty,
    gs1_key,
    handler,
    purpose: "入庫",
    note,
  };

  const { data, error } = await supabaseAdmin.rpc(
    "apply_inventory_operation",
    { payload }
  );

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data });
}
