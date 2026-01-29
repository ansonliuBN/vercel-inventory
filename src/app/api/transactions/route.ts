import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";

function toISODate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("transaction_log")
    .select("record_date, place, purpose, product_name, barcode, expiry, qty, handler, gs1_key, note, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });

  // 你 Transactions sheet 的欄位對齊
  const record_date = toISODate(body.record_date) || null;
  const place = String(body.place ?? "").trim();
  const purpose = String(body.purpose ?? "").trim() || null;
  const product_name = String(body.product_name ?? "").trim();
  const barcode = String(body.barcode ?? "").trim() || null;
  const expiry = toISODate(body.expiry);
  const qty = Number.parseInt(String(body.qty ?? "0"), 10) || 0;
  const handler = String(body.handler ?? "").trim() || null;
  const gs1_key = String(body.gs1_key ?? "").trim() || null;
  const note = String(body.note ?? "").trim() || null;

  if (!place || !product_name) {
    return NextResponse.json({ ok: false, message: "place and product_name are required" }, { status: 400 });
  }

  // ✅ 庫存增減規則（先給最小版）
  // - 若目的/類型 是「領用/出庫/使用」→ 庫存減少
  // - 否則（入庫/補貨/收貨）→ 庫存增加
  // 你之後可以把目的字串改成你的 GAS 規則
  const purposeLower = (purpose ?? "").toLowerCase();
  const isOut =
    purposeLower.includes("出") ||
    purposeLower.includes("領") ||
    purposeLower.includes("用") ||
    purposeLower.includes("use") ||
    purposeLower.includes("out");

  const delta = isOut ? -Math.abs(qty) : Math.abs(qty);

  // 1) 寫交易
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("transaction_log")
    .insert([
      {
        record_date,
        place,
        purpose,
        product_name,
        barcode,
        expiry,
        qty: delta, // 交易表也直接存正負，方便加總（你也可改成原 qty + 額外欄位）
        handler,
        gs1_key,
        note,
      },
    ])
    .select("*")
    .single();

  if (insErr) return NextResponse.json({ ok: false, error: insErr }, { status: 500 });

  // 2) 更新庫存：以 (GS1Key + UDI/批號 + 庫存位置 + 效期) 當一筆庫存
  // 你 inventory_stock 現在欄位：gs1_key, barcode, product_name, expiry, location, qty, note
  const invKey = {
    gs1_key: gs1_key || "(missing-gs1)",
    barcode: barcode || "(missing-udi)",
    product_name,
    expiry,
    location: place, // 這裡暫時用 place 當庫存位置（如果你有「庫存位置」欄位要改這裡）
  };

  // 2-1) 找現有庫存
  const { data: invRows, error: invFindErr } = await supabaseAdmin
    .from("inventory_stock")
    .select("id, qty")
    .eq("gs1_key", invKey.gs1_key)
    .eq("barcode", invKey.barcode)
    .eq("product_name", invKey.product_name)
    .eq("location", invKey.location)
    .eq("expiry", invKey.expiry)
    .limit(1);

  if (invFindErr) return NextResponse.json({ ok: false, error: invFindErr, inserted }, { status: 500 });

  if (!invRows || invRows.length === 0) {
    // 沒有就新增
    const { error: invInsErr } = await supabaseAdmin.from("inventory_stock").insert([
      { ...invKey, qty: delta, note: null },
    ]);
    if (invInsErr) return NextResponse.json({ ok: false, error: invInsErr, inserted }, { status: 500 });
  } else {
    // 有就加總更新
    const current = invRows[0];
    const nextQty = (current.qty ?? 0) + delta;

    const { error: invUpdErr } = await supabaseAdmin
      .from("inventory_stock")
      .update({ qty: nextQty })
      .eq("id", current.id);

    if (invUpdErr) return NextResponse.json({ ok: false, error: invUpdErr, inserted }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted, delta });
}
