import fs from "fs";
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const filePath = process.argv[2] || "./Inventory.xlsx";
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);

  if (typeof v === "number") {
    const d = xlsx.SSF.parse_date_code(v);
    if (!d) return null;
    const dt = new Date(Date.UTC(d.y, d.m - 1, d.d));
    return dt.toISOString().slice(0, 10);
  }

  const s = String(v).trim();
  const m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (m) {
    const y = m[1], mo = String(m[2]).padStart(2, "0"), da = String(m[3]).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }
  return null;
}

function toInt(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const wb = xlsx.readFile(filePath);
  const sheetName = "Transactions";
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.error(`Sheet not found: ${sheetName}`);
    console.error("Available sheets:", wb.SheetNames);
    process.exit(1);
  }

  const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });
  console.log(`Using sheet: ${sheetName}, rows: ${rows.length}`);

  const payload = [];
  for (const r of rows) {
    const record_date = toDate(r["紀錄日期"]);
    const place = String(r["地點"] ?? "").trim();
    const purpose = String(r["目的"] ?? "").trim() || null;
    const product_name = String(r["產品名稱"] ?? "").trim();
    const barcode = String(r["UDI/批號"] ?? "").trim() || null;
    const expiry = toDate(r["效期"]);
    const qty = toInt(r["數量"]);
    const handler = String(r["經手人"] ?? "").trim() || null;
    const gs1_key = String(r["GS1Key"] ?? "").trim() || null;
    const note = String(r["備註"] ?? "").trim() || null;

    // skip empty-ish rows
    if (!place && !product_name && !qty && !barcode && !gs1_key) continue;

    payload.push({
      record_date,
      place: place || "(未指定地點)",
      purpose,
      product_name: product_name || "(未命名產品)",
      barcode,
      expiry,
      qty,
      handler,
      gs1_key,
      note,
    });
  }

  console.log(`Prepared rows: ${payload.length}`);

  // 清空再灌，避免重複
  const { error: delErr } = await supabase
    .from("transaction_log")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) {
    console.error("Delete existing transaction_log failed:", delErr);
    process.exit(1);
  }

  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < payload.length; i += batchSize) {
    const batch = payload.slice(i, i + batchSize);
    const { error } = await supabase.from("transaction_log").insert(batch);
    if (error) {
      console.error("Insert error at batch starting", i, error);
      process.exit(1);
    }
    inserted += batch.length;
    console.log(`Inserted ${inserted}/${payload.length}`);
  }

  console.log("✅ Done importing transaction_log.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
