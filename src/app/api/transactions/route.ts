import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApiKey } from "@/lib/requireApiKey";

export const runtime = "nodejs";

const CLEAN_PURPOSES = ["入庫", "出庫", "使用", "領用", "調撥", "盤點", "報廢"];

export async function GET(req: Request) {
  const deny = requireApiKey(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);

  const place = searchParams.get("place");
  const product_name = searchParams.get("product_name");
  const date_from = searchParams.get("date_from");
  const date_to = searchParams.get("date_to");
  const q = searchParams.get("q");
  const mode = (searchParams.get("mode") ?? "raw").toLowerCase(); // raw | clean

  const limitRaw = searchParams.get("limit");
  const limit = Math.min(
    Math.max(Number.parseInt(String(limitRaw ?? "200"), 10) || 200, 1),
    1000
  );

  // ✅ 用 let（你要的 A）
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

  // ✅ clean mode：排除 place=IN/OUT/TRANSFER + 只保留 purpose_code 或 purpose 白名單
  if (mode === "clean") {
    query = query.not("place", "in", '("IN","OUT","TRANSFER")');

    const purposeIn = `purpose.in.(${CLEAN_PURPOSES.map((x) => `"${x}"`).join(",")})`;
    query = query.or(`purpose_code.not.is.null,${purposeIn}`);
  }

  // keyword search（注意：這是另一個 or，會跟上面的條件一起疊加）
  if (q && q.trim()) {
    const s = q.trim();
    query = query.or(
      `product_name.ilike.%${s}%,barcode.ilike.%${s}%,gs1_key.ilike.%${s}%,place.ilike.%${s}%,purpose.ilike.%${s}%,note.ilike.%${s}%`
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error }, { status: 500 });

  return NextResponse.json({ ok: true, items: data ?? [] });
}
