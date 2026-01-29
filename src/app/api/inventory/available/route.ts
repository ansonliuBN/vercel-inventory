import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApiKey } from "@/lib/requireApiKey";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const deny = requireApiKey(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);

  const location = searchParams.get("location");
  const product_name = searchParams.get("product_name");
  const gs1_key = searchParams.get("gs1_key");
  const barcode = searchParams.get("barcode");
  const expiry = searchParams.get("expiry");

  if (!location || !product_name) {
    return NextResponse.json(
      { ok: false, message: "location and product_name are required" },
      { status: 400 }
    );
  }

  let query = supabaseAdmin
    .from("inventory_stock")
    .select("qty")
    .eq("location", location)
    .eq("product_name", product_name);

  if (gs1_key) query = query.eq("gs1_key", gs1_key);
  if (barcode) query = query.eq("barcode", barcode);
  if (expiry) query = query.eq("expiry", expiry);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  const available =
    (data ?? []).reduce((sum, row) => sum + (row.qty ?? 0), 0) || 0;

  return NextResponse.json({ ok: true, available });
}
