import { requireApiKey } from "@/lib/requireApiKey";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
  const deny = requireApiKey(req);
    if (deny) return deny;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });

  // 必填
  const type = String(body.type ?? "").toUpperCase(); // IN | OUT | TRANSFER
  const product_name = String(body.product_name ?? "").trim();
  const qtyRaw = Number.parseInt(String(body.qty ?? "0"), 10) || 0;

  const gs1_key = String(body.gs1_key ?? "").trim() || "(missing-gs1)";
  const barcode = String(body.barcode ?? "").trim() || "(missing-udi)";
  const expiry = toISODate(body.expiry);
  const record_date = toISODate(body.record_date) || null;

  const handler = String(body.handler ?? "").trim() || null;
  const note = String(body.note ?? "").trim() || null;

  if (!["IN", "OUT", "TRANSFER"].includes(type)) {
    return NextResponse.json({ ok: false, message: "type must be IN|OUT|TRANSFER" }, { status: 400 });
  }
  if (!product_name) return NextResponse.json({ ok: false, message: "product_name is required" }, { status: 400 });
  if (qtyRaw <= 0) return NextResponse.json({ ok: false, message: "qty must be > 0" }, { status: 400 });

  // location rules
  const location = String(body.location ?? "").trim(); // for IN/OUT
  const from_location = String(body.from_location ?? "").trim(); // for TRANSFER
  const to_location = String(body.to_location ?? "").trim(); // for TRANSFER

  if ((type === "IN" || type === "OUT") && !location) {
    return NextResponse.json({ ok: false, message: "location is required for IN/OUT" }, { status: 400 });
  }
  if (type === "TRANSFER" && (!from_location || !to_location)) {
    return NextResponse.json({ ok: false, message: "from_location and to_location are required for TRANSFER" }, { status: 400 });
  }
  if (type === "TRANSFER" && from_location === to_location) {
    return NextResponse.json({ ok: false, message: "from_location and to_location must be different" }, { status: 400 });
  }

  async function upsertInventory(loc: string, delta: number) {
    const invKey = { gs1_key, barcode, product_name, expiry, location: loc };

    const { data: invRows, error: findErr } = await supabaseAdmin
      .from("inventory_stock")
      .select("id, qty")
      .eq("gs1_key", invKey.gs1_key)
      .eq("barcode", invKey.barcode)
      .eq("product_name", invKey.product_name)
      .eq("location", invKey.location)
      .eq("expiry", invKey.expiry)
      .limit(1);

    if (findErr) return { ok: false, error: findErr };

    if (!invRows || invRows.length === 0) {
      // 新增：只有 delta >= 0 才允許自動新增（避免 OUT/TRANSFER 直接產生負庫存）
      if (delta < 0) {
        return { ok: false, error: { message: "Insufficient stock (no inventory row found)" }, status: 409 };
      }
      const { error: insErr } = await supabaseAdmin.from("inventory_stock").insert([{ ...invKey, qty: delta, note: null }]);
      if (insErr) return { ok: false, error: insErr };
      return { ok: true, nextQty: delta };
    }

    const current = invRows[0];
    const currentQty = current.qty ?? 0;
    const nextQty = currentQty + delta;

    if (nextQty < 0) {
      return { ok: false, error: { message: "Insufficient stock", currentQty }, status: 409 };
    }

    const { error: updErr } = await supabaseAdmin.from("inventory_stock").update({ qty: nextQty }).eq("id", current.id);
    if (updErr) return { ok: false, error: updErr };

    return { ok: true, nextQty };
  }

  // 寫交易（最小：1 or 2 rows）
  if (type === "IN") {
    const delta = qtyRaw;

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("transaction_log")
      .insert([{
        record_date,
        place: location,
        purpose: "IN",
        product_name,
        barcode,
        expiry,
        qty: delta,
        handler,
        gs1_key,
        note
      }])
      .select("*")
      .single();

    if (insErr) return NextResponse.json({ ok: false, error: insErr }, { status: 500 });

    const invRes = await upsertInventory(location, delta);
    if (!invRes.ok) return NextResponse.json({ ok: false, error: invRes.error }, { status: invRes.status ?? 500 });

    return NextResponse.json({ ok: true, inserted, inventory: { location, delta, nextQty: invRes.nextQty } });
  }

  if (type === "OUT") {
    const delta = -qtyRaw;

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("transaction_log")
      .insert([{
        record_date,
        place: location,
        purpose: "OUT",
        product_name,
        barcode,
        expiry,
        qty: delta,
        handler,
        gs1_key,
        note
      }])
      .select("*")
      .single();

    if (insErr) return NextResponse.json({ ok: false, error: insErr }, { status: 500 });

    const invRes = await upsertInventory(location, delta);
    if (!invRes.ok) return NextResponse.json({ ok: false, error: invRes.error }, { status: invRes.status ?? 500 });

    return NextResponse.json({ ok: true, inserted, inventory: { location, delta, nextQty: invRes.nextQty } });
  }

  // TRANSFER
  const outDelta = -qtyRaw;
  const inDelta = qtyRaw;

  // 先扣來源（避免扣不到還加到目的）
  const outRes = await upsertInventory(from_location, outDelta);
  if (!outRes.ok) return NextResponse.json({ ok: false, error: outRes.error }, { status: outRes.status ?? 500 });

  // 再加目的
  const inRes = await upsertInventory(to_location, inDelta);
  if (!inRes.ok) return NextResponse.json({ ok: false, error: inRes.error }, { status: inRes.status ?? 500 });

  const { data, error } = await supabaseAdmin
    .from("transaction_log")
    .insert([
      {
        record_date,
        place: from_location,
        purpose: "TRANSFER_OUT",
        product_name,
        barcode,
        expiry,
        qty: outDelta,
        handler,
        gs1_key,
        note: note ? `${note} (to ${to_location})` : `(to ${to_location})`,
      },
      {
        record_date,
        place: to_location,
        purpose: "TRANSFER_IN",
        product_name,
        barcode,
        expiry,
        qty: inDelta,
        handler,
        gs1_key,
        note: note ? `${note} (from ${from_location})` : `(from ${from_location})`,
      },
    ])
    .select("*");

  if (error) return NextResponse.json({ ok: false, error }, { status: 500 });

  return NextResponse.json({
    ok: true,
    inserted: data ?? [],
    inventory: [
      { location: from_location, delta: outDelta, nextQty: outRes.nextQty },
      { location: to_location, delta: inDelta, nextQty: inRes.nextQty },
    ],
  });
}
