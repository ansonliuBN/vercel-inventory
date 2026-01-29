import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApiKey } from "@/lib/requireApiKey";
import { inferTxType } from "@/lib/txType";

export const runtime = "nodejs";

type BulkItem = {
  type?: string;            // IN | OUT | TRANSFER
  purpose?: string;         // 入庫/出庫/調撥/領用...
  record_date?: string;     // YYYY-MM-DD

  // IN/OUT 用
  location?: string;

  // TRANSFER 用
  from_location?: string;
  to_location?: string;

  product_name?: string;
  barcode?: string;
  expiry?: string;          // YYYY-MM-DD
  qty?: number;

  handler?: string;
  gs1_key?: string;
  note?: string;
};

export async function POST(req: Request) {
  const deny = requireApiKey(req);
  if (deny) return deny;

  const body = (await req.json().catch(() => null)) as null | { items?: BulkItem[] };
  if (!body?.items || !Array.isArray(body.items)) {
    return NextResponse.json({ ok: false, message: "body.items must be an array" }, { status: 400 });
  }

  const normalized = body.items.map((it: BulkItem, idx: number) => {
    const explicit = String(it.type ?? "").trim().toUpperCase();

    // --- TRANSFER: 直接放行（由前端/腳本提供 from/to） ---
    if (explicit === "TRANSFER") {
      const qty = Number.parseInt(String(it.qty ?? 0), 10) || 0;
      if (qty <= 0) return { __error: `Row ${idx}: qty must be > 0`, row: it };

      const from_location = String(it.from_location ?? "").trim();
      const to_location = String(it.to_location ?? "").trim();
      const product_name = String(it.product_name ?? "").trim();

      if (!from_location || !to_location) {
        return { __error: `Row ${idx}: TRANSFER requires from_location and to_location`, row: it };
      }
      if (!product_name) {
        return { __error: `Row ${idx}: product_name is required`, row: it };
      }

      return {
        ...it,
        type: "TRANSFER",
        qty,
        from_location,
        to_location,
        product_name,
        purpose: String(it.purpose ?? "調撥"),
      };
    }

    // --- IN/OUT: type 或 purpose 推導 ---
    const inferred = inferTxType(it.purpose);
    const type = (["IN", "OUT"].includes(explicit) ? explicit : inferred) as ("IN" | "OUT" | null);

    if (type !== "IN" && type !== "OUT") {
      return { __error: `Row ${idx}: type must be IN/OUT/TRANSFER (or purpose must infer to IN/OUT)`, row: it };
    }

    const qty = Number.parseInt(String(it.qty ?? 0), 10) || 0;
    if (qty <= 0) return { __error: `Row ${idx}: qty must be > 0`, row: it };

    const location = String(it.location ?? "").trim();
    const product_name = String(it.product_name ?? "").trim();
    if (!location || !product_name) {
      return { __error: `Row ${idx}: location and product_name are required for IN/OUT`, row: it };
    }

    return {
      ...it,
      type,
      qty,
      location,
      product_name,
      purpose: String(it.purpose ?? type),
    };
  });

  const firstErr = normalized.find((x: any) => x.__error);
  if (firstErr) {
    return NextResponse.json({ ok: false, message: firstErr.__error, detail: firstErr }, { status: 400 });
  }

  const payload = { items: normalized };

  const { data, error } = await supabaseAdmin.rpc("apply_transactions_bulk", {
    payload,
    apply_inventory: false,
  });


  return NextResponse.json({ ok: true, result: data });
}
