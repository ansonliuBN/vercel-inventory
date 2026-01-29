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
    from_location,
    to_location,
    product_name,
    barcode,
    expiry,
    qty,
    gs1_key,
    handler,
    note,
  } = body;

  if (!from_location || !to_location || !product_name) {
    return NextResponse.json(
      { ok: false, message: "from_location, to_location, product_name are required" },
      { status: 400 }
    );
  }

  const nQty = Number.parseInt(String(qty ?? 0), 10) || 0;
  if (nQty <= 0) {
    return NextResponse.json({ ok: false, message: "qty must be > 0" }, { status: 400 });
  }

  const payload = {
    type: "TRANSFER",
    purpose: "調撥",
    record_date,
    from_location,
    to_location,
    product_name,
    barcode,
    expiry,
    qty: nQty,
    gs1_key,
    handler,
    note,
  };

  const { data, error } = await supabaseAdmin.rpc("apply_inventory_operation", { payload });

  if (error) {
    // 不夠就 rollback，回 400 讓前端顯示
    return NextResponse.json({ ok: false, message: error.message, error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, result: data });
}
