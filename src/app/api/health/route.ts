import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("inventory_stock")
    .select("gs1_key, barcode, product_name, expiry, location, qty, note, updated_at")
    .order("product_name", { ascending: true })
    .order("location", { ascending: true })
    .order("expiry", { ascending: true, nullsFirst: true });

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}
