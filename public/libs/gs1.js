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
  const yy = parseInt(v.slice(0, 2), 10);
  const mm = parseInt(v.slice(2, 4), 10);
  const dd = parseInt(v.slice(4, 6), 10);
  if (!Number.isFinite(yy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return false;
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

export function hasGS1Core(text) {
  const s = compact(text);
  const gtin = findGTIN(s);
  const exp = findEXP(s);
  return !!(gtin && exp && isValidYYMMDD(exp));
}

function findGTIN(s) {
  // 容錯：有無括號都抓；(01) 或 01 後面 14 碼
  const m = s.match(/\(?01\)?(\d{14})/);
  return m ? m[1] : "";
}

function findEXP(s) {
  // 容錯：有無括號都抓；(17) 或 17 後面 6 碼
  const m = s.match(/\(?17\)?(\d{6})/);
  return m ? m[1] : "";
}

function findLotAfterExp(s, expEndIndex) {
  // 只在 EXP 後面找，避免像 ...6621E34LRH... 這種假 21
  const tail = expEndIndex >= 0 ? s.slice(expEndIndex) : s;

  // (21) 常見壞法："(21)XXX" / "(21 XXX" / "(21XXX" / "21)XXX" / "21XXX"
  // compact 後不會有空白，所以核心是：可有 "("，可無 ")"
  const m21 = tail.match(/\(?21\)?([A-Z0-9\-]{1,60})(?=\(|$)/i);
  if (m21 && m21[1]) return cleanupLot(m21[1]);

  return "";
}

function cleanupLot(v) {
  return (v || "")
    .replace(/[^A-Z0-9\-]/gi, "")
    .slice(0, 60);
}

function findLotByPatternAnywhere(s) {
  // 你說的強規則：四個英文 + 四個數字 + "-" + XXX
  const pStrict = s.match(/([A-Z]{4}\d{4}-[A-Z0-9]{1,30})/);
  if (pStrict) return cleanupLot(pStrict[1]);

  // 為了相容 FP1R0211-G01 這種（前四碼可能含數字）
  const pCompat = s.match(/([A-Z0-9]{4}\d{4}-[A-Z0-9]{1,30})/);
  if (pCompat) return cleanupLot(pCompat[1]);

  // 再放一個更寬鬆保底：3~6 前綴 + 4 digits + "-" + tail
  const pLoose = s.match(/([A-Z0-9]{3,6}\d{4}-[A-Z0-9]{1,30})/);
  if (pLoose) return cleanupLot(pLoose[1]);

  return "";
}

export function extractGS1(text) {
  const s = compact(text);

  const gtinMatch = s.match(/\(?01\)?(\d{14})/);
  const expMatch  = s.match(/\(?17\)?(\d{6})/);

  const gtin = gtinMatch ? gtinMatch[1] : "";
  const expYYMMDD = expMatch ? expMatch[1] : "";

  // EXP 結束位置：讓 LOT 從這裡之後找，避免誤抓
  let expEndIndex = -1;
  if (expMatch && expMatch.index != null) {
    expEndIndex = expMatch.index + expMatch[0].length;
  }

  let lot = findLotAfterExp(s, expEndIndex);

  // 如果 21 沒抓到，用 pattern 保底（你說 LOT 有固定格式）
  if (!lot) lot = findLotByPatternAnywhere(s);

  return {
    gtin,
    expYYMMDD,
    expDisplay: expYYMMDD ? yymmddToZhDate(expYYMMDD) : "",
    lot
  };
}
