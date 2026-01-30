// public/libs/gs1.js

export function normalizeTextKeepParens(raw) {
  return (raw || "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t\r]+/g, " ")
    .replace(/\n+/g, "\n")
    .replace(/[Il|]/g, "1")
    .replace(/O/g, "0");
}

export function compact(raw) {
  return normalizeTextKeepParens(raw).replace(/\s+/g, "");
}

export function isValidYYMMDD(yymmdd) {
  const v = (yymmdd || "").replace(/\D/g, "");
  if (v.length !== 6) return false;
  const mm = parseInt(v.slice(2, 4), 10);
  const dd = parseInt(v.slice(4, 6), 10);
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;
  return true;
}

export function yymmddToZhDate(yymmdd) {
  const v = (yymmdd || "").replace(/\D/g, "");
  if (!isValidYYMMDD(v)) return "";
  const yy = v.slice(0, 2);
  const mm = v.slice(2, 4);
  const dd = v.slice(4, 6);
  const year = 2000 + parseInt(yy, 10);
  return `${year}年${mm}月${dd}日`;
}

// ===== 兩階段判定 =====

// 完整：GTIN(14) + EXP(6且合理)
export function hasGS1Complete(text) {
  const s = compact(text);
  const gtin = findGTIN(s);
  const exp = findEXP(s);
  return !!(gtin && exp && isValidYYMMDD(exp));
}

// 有希望：GTIN 或 EXP 或 LOT 任一抓到就算
export function hasGS1Hope(text) {
  const data = extractGS1(text);
  return !!(data.gtin || data.expYYMMDD || data.lot);
}

// ===== 抽取 =====

function findGTIN(s) {
  // 容錯：括號可缺
  const m = s.match(/\(?01\)?(\d{14})/);
  return m ? m[1] : "";
}

function findEXP(s) {
  const m = s.match(/\(?17\)?(\d{6})/);
  return m ? m[1] : "";
}

// LOT 規則：- 前 8 碼 + - + (字母)(兩位數字)
// 例：FPSD0101-G02EHEE -> FPSD0101-G02
function normalizeLotFixed(v) {
  const s = (v || "").toUpperCase().replace(/[^A-Z0-9\-]/g, "");

  // 最嚴格：AAAA9999-G02...
  let m = s.match(/^([A-Z]{4}\d{4})-([A-Z])(\d{2})/);
  if (m) return `${m[1]}-${m[2]}${m[3]}`;

  // 寬鬆：前 8 碼不一定全字母，但就是取 8 碼 + - + Xdd
  m = s.match(/^([A-Z0-9]{8})-([A-Z])(\d{2})/);
  if (m) return `${m[1]}-${m[2]}${m[3]}`;

  // 再保底：在字串中找到 8碼-Xdd
  m = s.match(/([A-Z0-9]{8})-([A-Z])(\d{2})/);
  if (m) return `${m[1]}-${m[2]}${m[3]}`;

  return "";
}

// 從 EXP 後面找 21，避免 ...6621E34LRH... 這種假 21
function findLotAfterExp(s, expEndIndex) {
  const tail = expEndIndex >= 0 ? s.slice(expEndIndex) : s;

  // 21 容錯："(21)XXX" / "(21XXX" / "(21 XXX" / "21)XXX" / "21XXX"
  const m21 = tail.match(/\(?21\)?([A-Z0-9\-]{1,80})(?=\(|$)/i);
  if (m21 && m21[1]) return normalizeLotFixed(m21[1]);

  return "";
}

// 你說 LOT 固定 pattern，抓不到 21 就用 pattern anywhere 補
function findLotByPatternAnywhere(s) {
  // 嚴格：AAAA9999-G02...
  let m = s.match(/([A-Z]{4}\d{4}-[A-Z]\d{2})/);
  if (m) return normalizeLotFixed(m[1]);

  // 寬鬆：任意 8 碼 - Xdd
  m = s.match(/([A-Z0-9]{8}-[A-Z]\d{2})/);
  if (m) return normalizeLotFixed(m[1]);

  // 更寬鬆：完整含雜訊也行，normalizeLotFixed 會自己截斷
  m = s.match(/([A-Z0-9]{8}-[A-Z]\d{2}[A-Z0-9]{0,20})/);
  if (m) return normalizeLotFixed(m[1]);

  return "";
}

export function extractGS1(text) {
  const s = compact(text);

  const gtinMatch = s.match(/\(?01\)?(\d{14})/);
  const expMatch  = s.match(/\(?17\)?(\d{6})/);

  const gtin = gtinMatch ? gtinMatch[1] : "";
  const expYYMMDD = expMatch ? expMatch[1] : "";

  let expEndIndex = -1;
  if (expMatch && expMatch.index != null) {
    expEndIndex = expMatch.index + expMatch[0].length;
  }

  let lot = findLotAfterExp(s, expEndIndex);
  if (!lot) lot = findLotByPatternAnywhere(s);

  return {
    gtin,
    expYYMMDD,
    expDisplay: expYYMMDD ? yymmddToZhDate(expYYMMDD) : "",
    lot
  };
}
