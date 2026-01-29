import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApiKey } from "@/lib/requireApiKey";
import { inferTxType } from "@/lib/txType";

export const runtime = "nodejs";

type BulkItem = {
  type?: string;           // IN|OUT (optional if purpose provided)
  purpose?: string;        // 入庫/出庫/領用...
  record_date?: string;    // YYYY-MM-DD
  location: string;
  product_name: string;
  barcode?: string;
  expiry?: string;         // YYYY-MM-DD
  qty: number;
  handler?: string;
  gs1_key?: string;
  note?: string;
};

export async function POST(req: Request) {
  const deny = requireApiKey(req);
  if (deny) return deny;

  const body = await req.json().catch(() => null) as null | { items?: BulkItem[] };
  if (!body?.items || !Array.isArray(body.items)) {
    return NextResponse.json({ ok: false, message: "body.items must be an array" }, { status: 400 });
  }

  // normalize + infer type
  const normalized = body.items.map((it, idx) => {
    const explicit = String(it.type ?? "").trim().toUpperCase();
    const inferred = inferTxType(it.purpose);
    const type = (["IN", "OUT"].includes(explicit) ? explicit : inferred);

    if (type !== "IN" && type !== "OUT") {
      return { __error: `Row ${idx}: type must be IN/OUT (or purpose must infer to IN/OUT)`, row: it };
    }

    if (!it.location || !it.product_name) {
      return { __error: `Row ${idx}: location and product_name are required`, row: it };
    }

    const qty = Number.parseInt(String(it.qty ?? 0), 10) || 0;
    if (qty <= 0) {
      return { __error: `Row ${idx}: qty must be > 0`, row: it };
    }

    return {
      type,
      purpose: (it.purpose ?? type),
      record_date: it.record_date ?? null,
      location: it.location,
      product_name: it.product_name,
      barcode: it.barcode ?? null,
      expiry: it.expiry ?? null,
      qty,
      handler: it.handler ?? null,
      gs1_key: it.gs1_key ?? null,
      note: it.note ?? null,
    };
  });

  const firstErr = normalized.find((x: any) => x.__error);
  if (firstErr) {
    return NextResponse.json({ ok: false, message: firstErr.__error, detail: firstErr }, { status: 400 });
  }

  const payload = { items: normalized };

  // call RPC (DB transaction in one shot)
  const { data, error } = await supabaseAdmin.rpc("apply_transactions_bulk", { payload });

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, result: data });
}
