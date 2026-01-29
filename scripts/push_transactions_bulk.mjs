import fs from "fs";
import xlsx from "xlsx";

const API_BASE = process.env.API_BASE || "https://vercel-inventory-livid.vercel.app";
const API_KEY = process.env.INVENTORY_API_KEY;

if (!API_KEY) {
  console.error("Missing INVENTORY_API_KEY in env (.env).");
  process.exit(1);
}

const filePath = process.argv[2] || "./Inventory.xlsx";
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

function toISODate(v) {
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
  console.log(`Read Transactions rows: ${rows.length}`);

  // Excel columns we saw:
  // 紀錄日期, 地點, 目的, 產品名稱, UDI/批號, 效期, 數量, 經手人, GS1Key, 備註
  const items = rows
    .map((r) => ({
      const dest = String(r["目的"] ?? "").trim();

        return {
        // 如果有「目的」，代表從 location 出庫
        type: dest ? "OUT" : "IN",
        purpose: dest || "入庫",
        record_date: toISODate(r["紀錄日期"]) || null,
        location: String(r["地點"] ?? "").trim(),
        product_name: String(r["產品名稱"] ?? "").trim(),
        barcode: String(r["UDI/批號"] ?? "").trim() || null,
        expiry: toISODate(r["效期"]) || null,
        qty: toInt(r["數量"]),
        handler: String(r["經手人"] ?? "").trim() || null,
        gs1_key: String(r["GS1Key"] ?? "").trim() || null,
        note: dest ? `to ${dest}` : null,
        };
             // 中文目的（後端會 infer）
      record_date: toISODate(r["紀錄日期"]) || null,
      location: String(r["地點"] ?? "").trim(),
      product_name: String(r["產品名稱"] ?? "").trim(),
      barcode: String(r["UDI/批號"] ?? "").trim() || null,
      expiry: toISODate(r["效期"]) || null,
      qty: toInt(r["數量"]),
      handler: String(r["經手人"] ?? "").trim() || null,
      gs1_key: String(r["GS1Key"] ?? "").trim() || null,
      note: String(r["備註"] ?? "").trim() || null,
    }))
    .filter((it) => it.location && it.product_name && it.qty > 0);

  console.log(`Prepared items: ${items.length}`);

  // Send in chunks (safe)
  const chunkSize = 50;
  let sent = 0;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    const res = await fetch(`${API_BASE}/api/transactions/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify({ items: chunk }),
    });

    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}

    if (!res.ok) {
      console.error("❌ Bulk failed at chunk starting", i);
      console.error("Status:", res.status);
      console.error("Response:", json ?? text);
      process.exit(1);
    }

    sent += chunk.length;
    console.log(`✅ Sent ${sent}/${items.length}`, json ?? "");
  }

  console.log("🎉 Done pushing Transactions to /api/transactions/bulk");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
