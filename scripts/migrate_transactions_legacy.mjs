import { createClient } from "@supabase/supabase-js";

const CLEAN_PURPOSE = new Set(["入庫", "出庫", "使用", "領用", "調撥", "盤點", "報廢"]);

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function hasToFromNote(note) {
  const s = String(note ?? "");
  return s.includes("(to ") || s.includes("(from ");
}

function norm(s) {
  return String(s ?? "").trim();
}

function appendNote(oldNote, extra) {
  const base = norm(oldNote);
  return base ? `${base} ${extra}` : extra;
}

async function main() {
  const args = process.argv.slice(2);
  const DRY = args.includes("--dry-run");
  const APPLY = args.includes("--apply");

  if (!DRY && !APPLY) {
    console.log("Usage:");
    console.log("  node -r dotenv/config scripts/migrate_transactions_legacy.mjs --dry-run");
    console.log("  node -r dotenv/config scripts/migrate_transactions_legacy.mjs --apply");
    process.exit(1);
  }

  const supabase = createClient(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );

  const { data: rows, error } = await supabase
    .from("transaction_log")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const candidates = (rows ?? []).filter((r) => {
    const purpose = norm(r.purpose);
    if (!purpose) return false;
    if (CLEAN_PURPOSE.has(purpose)) return false;
    if (hasToFromNote(r.note)) return false;

    const src = norm(r.place);
    const dest = purpose;

    if (!src || !dest) return false;
    if (src === dest) return false;

    const qty = Math.abs(Number(r.qty ?? 0));
    if (!qty) return false;

    return true;
  });

  console.log(`Found candidates: ${candidates.length}`);
  console.log("Preview first 10:");
  console.log(
    candidates.slice(0, 10).map((r) => ({
      id: r.id,
      record_date: r.record_date ?? null,
      from: norm(r.place),
      to: norm(r.purpose),
      qty: Math.abs(Number(r.qty ?? 0)),
      product_name: r.product_name,
      note: r.note ?? null,
      created_at: r.created_at,
    }))
  );

  if (DRY) {
    console.log("✅ Dry-run done. No changes applied.");
    return;
  }

  let updated = 0;
  let inserted = 0;
  let skippedAlready = 0;

  for (const r of candidates) {
    const src = norm(r.place);
    const dest = norm(r.purpose);
    const qtyAbs = Math.abs(Number(r.qty ?? 0));

    // ---- 去重：找是否已經有目的地那筆（要處理 record_date=null）----
    let q = supabase
      .from("transaction_log")
      .select("id")
      .eq("place", dest)
      .eq("purpose", "調撥")
      .eq("product_name", r.product_name)
      .eq("barcode", r.barcode)
      .eq("expiry", r.expiry)
      .eq("gs1_key", r.gs1_key)
      .eq("qty", qtyAbs)
      .limit(1);

    if (r.record_date == null) {
      q = q.is("record_date", null);
    } else {
      q = q.eq("record_date", r.record_date);
    }

    const { data: exists, error: exErr } = await q;
    if (exErr) throw exErr;

    if ((exists ?? []).length > 0) {
      skippedAlready++;
      continue;
    }

    // 1) update 原本那筆：變成 from 端（qty 負數）
    const upd = {
      purpose: "調撥",
      qty: -qtyAbs,
      note: appendNote(r.note, `(to ${dest})`),
    };

    const { error: upErr } = await supabase
      .from("transaction_log")
      .update(upd)
      .eq("id", r.id);

    if (upErr) throw upErr;
    updated++;

    // 2) insert 目的地那筆：qty 正數
    const ins = {
      record_date: r.record_date ?? null,
      place: dest,
      purpose: "調撥",
      product_name: r.product_name,
      barcode: r.barcode,
      expiry: r.expiry,
      qty: qtyAbs,
      handler: r.handler,
      gs1_key: r.gs1_key,
      note: appendNote(r.note, `(from ${src})`),
    };

    const { error: inErr } = await supabase
      .from("transaction_log")
      .insert(ins);

    if (inErr) throw inErr;
    inserted++;
  }

  console.log("✅ Migration done:");
  console.log({ updated, inserted, skippedAlready });
}

main().catch((e) => {
  console.error("❌ Migration failed:", e);
  process.exit(1);
});
