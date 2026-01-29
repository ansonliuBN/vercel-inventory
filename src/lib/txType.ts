export type TxType = "IN" | "OUT" | "TRANSFER";

const normalize = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ""); // 去空白

// 你可以在這裡把你公司真實用語都加進去（之後再慢慢補）
const IN_WORDS = new Set([
  "入庫", "入仓", "收貨", "收货", "補貨", "补货", "回補", "回补", "新增", "增加", "in",
]);
const OUT_WORDS = new Set([
  "出庫", "出仓", "領用", "领用", "使用", "耗用", "消耗", "報廢", "报废", "退回供應商", "退回供应商", "out", "use",
]);
const TRANSFER_WORDS = new Set([
  "調撥", "调拨", "轉倉", "转仓", "移轉", "移转", "庫間調撥", "仓间调拨", "transfer",
]);

export function inferTxType(input: unknown): TxType | null {
  if (input === null || input === undefined) return null;
  const raw = normalize(String(input));
  if (!raw) return null;

  // 完全命中
  if (IN_WORDS.has(raw)) return "IN";
  if (OUT_WORDS.has(raw)) return "OUT";
  if (TRANSFER_WORDS.has(raw)) return "TRANSFER";

  // 部分命中（容錯：例如 "調撥(倉庫→醫院)"）
  for (const w of TRANSFER_WORDS) if (raw.includes(w)) return "TRANSFER";
  for (const w of OUT_WORDS) if (raw.includes(w)) return "OUT";
  for (const w of IN_WORDS) if (raw.includes(w)) return "IN";

  return null;
}
