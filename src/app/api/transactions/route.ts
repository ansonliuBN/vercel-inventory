import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApiKey } from "@/lib/requireApiKey";

export const runtime = "nodejs";

const CLEAN_PURPOSE = ["入庫", "出庫", "使用", "領用", "調撥", "盤點", "報廢"];

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

  // clean mode: 只要我們認得的 purpose
  if (mode === "clean") {
    // 1) 先把明顯錯的 place 排掉（你現在看到 place="IN" 就是這種）
    q = q.not("place", "in", '("IN","OUT","TRANSFER")');

    // 2) 只保留：purpose_code 有值 或 purpose 在白名單
    // Supabase v2: 用 or() 做 OR 條件
    q = q.or(
      [
        "purpose_code.not.is.null",
        `purpose.in.(${CLEAN_PURPOSES.map((x) => `"${x}"`).join(",")})`,
      ].join(",")
    );
  }

  // keyword search
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
