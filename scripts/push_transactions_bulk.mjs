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

async function postBulk(items) {
  const res = await fetch(`${API_BASE}/api/transactions/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({ items }),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  if (!res.ok) {
    return { ok: false, status: res.status, body: json ?? text };
  }
  return { ok: true, body: json ?? text };
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

  // 重要：你的「目的」欄不是 IN/OUT，而是「對方地點」
  // 規則：有目的 = OUT（從 location 出庫到 目的）；目的空 = IN（進到 location）
  const items = rows
    .map((r) => {
      const dest = String(r["目的"] ?? "").trim();
      const location = String(r["地點"] ?? "").trim();
      const product_name = String(r["產品名稱"] ?? "").trim();
      const qty = toInt(r["數量"]);

      if (dest) {
        return {
          type: "TRANSFER",
          purpose: "調撥",
          record_date: toISODate(r["紀錄日期"]) || null,
          from_location: location,
          to_location: dest,
          product_name,
          barcode: String(r["UDI/批號"] ?? "").trim() || null,
          expiry: toISODate(r["效期"]) || null,
          qty,
          handler: String(r["經手人"] ?? "").trim() || null,
          gs1_key: String(r["GS1Key"] ?? "").trim() || null,
          note: String(r["備註"] ?? "").trim() || null,
        };
      }

      return {
        type: "IN",
        purpose: "入庫",
        record_date: toISODate(r["紀錄日期"]) || null,
        location,
        product_name,
        barcode: String(r["UDI/批號"] ?? "").trim() || null,
        expiry: toISODate(r["效期"]) || null,
        qty,
        handler: String(r["經手人"] ?? "").trim() || null,
        gs1_key: String(r["GS1Key"] ?? "").trim() || null,
        note: String(r["備註"] ?? "").trim() || null,
      };
    })
    .filter((it) => {
      const hasLoc =
        (it.type === "TRANSFER" && it.from_location && it.to_location) ||
        (it.type !== "TRANSFER" && it.location);

      return hasLoc && it.product_name && it.qty > 0;
    });


  console.log(`Prepared items: ${items.length}`);

  if (items.length === 0) {
    console.log("Nothing to send.");
    return;
  }

  // 分批送
  const chunkSize = 50;
  let sent = 0;

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    // 額外輸出前 1 筆，讓你確認目的判斷是否合理
    if (i === 0) {
      console.log("Sample first item:", chunk[0]);
    }

    const result = await postBulk(chunk);
    if (!result.ok) {
      console.error("❌ Bulk failed at chunk starting", i);
      console.error("Status:", result.status);
      console.error("Response:", result.body);
      process.exit(1);
    }

    sent += chunk.length;
    console.log(`✅ Sent ${sent}/${items.length}`, result.body);
  }

  console.log("🎉 Done pushing Transactions to /api/transactions/bulk");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
