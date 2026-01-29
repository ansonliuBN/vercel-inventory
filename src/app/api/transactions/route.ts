import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApiKey } from "@/lib/requireApiKey";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const deny = requireApiKey(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);

  const place = searchParams.get("place");
  const product_name = searchParams.get("product_name");
  const date_from = searchParams.get("date_from");
  const date_to = searchParams.get("date_to");
  const limitRaw = searchParams.get("limit");

  const limit = Math.min(
    Math.max(Number.parseInt(String(limitRaw ?? "200"), 10) || 200, 1),
    1000
  );

  let query = supabaseAdmin
    .from("transaction_log")
    .select("*")
    .order("record_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (place) query = query.eq("place", place);
  if (product_name) query = query.eq("product_name", product_name);

  if (date_from) query = query.gte("record_date", date_from);
  if (date_to) query = query.lte("record_date", date_to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 });

  return NextResponse.json({ ok: true, items: data ?? [] });
}
