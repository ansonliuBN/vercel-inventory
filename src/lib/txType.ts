export type TxType = "IN" | "OUT" | "TRANSFER";

const normalize = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, "");

const IN_WORDS = [
  "入庫", "入仓", "收貨", "收货", "補貨", "补货", "回補", "回补", "新增", "增加", "in",
];
const OUT_WORDS = [
  "出庫", "出仓", "領用", "领用", "使用", "耗用", "消耗", "報廢", "报废", "退回供應商", "退回供应商", "out", "use",
];
const TRANSFER_WORDS = [
  "調撥", "调拨", "轉倉", "转仓", "移轉", "移转", "庫間調撥", "仓间调拨", "transfer",
];

export function inferTxType(input: unknown): TxType | null {
  if (input == null) return null;
  const raw = normalize(String(input));
  if (!raw) return null;

  if (IN_WORDS.includes(raw)) return "IN";
  if (OUT_WORDS.includes(raw)) return "OUT";
  if (TRANSFER_WORDS.includes(raw)) return "TRANSFER";

  for (const w of TRANSFER_WORDS) if (raw.includes(w)) return "TRANSFER";
  for (const w of OUT_WORDS) if (raw.includes(w)) return "OUT";
  for (const w of IN_WORDS) if (raw.includes(w)) return "IN";

  return null;
}
