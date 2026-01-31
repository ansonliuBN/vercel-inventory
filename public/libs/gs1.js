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

// ===== 日期 =====
export function isValidYYMMDD(yymmdd) {
  const v = (yymmdd || "").replace(/\D/g, "");
  if (v.length !== 6) return false;
  const mm = parseInt(v.slice(2, 4), 10);
  const dd = parseInt(v.slice(4, 6), 10);
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}

export function yymmddToISO(yymmdd) {
  if (!isValidYYMMDD(yymmdd)) return "";
  const yy = yymmdd.slice(0, 2);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  return `20${yy}-${mm}-${dd}`;
}

// ===== 判定 =====
export function hasGS1Complete(text) {
  const s = compact(text);
  return !!(findGTIN(s) && findEXP(s));
}

export function hasGS1Hope(text) {
  const d = extractGS1(text);
  return !!(d.gtin || d.gtin_raw || d.exp || d.exp_raw || d.lot);
}

// ===== 抽取 =====
function findGTIN(s) {
  const m = s.match(/\(?01\)?(\d{14})/);
  return m ? m[1] : "";
}

function findGTINRaw(s) {
  const m = s.match(/\(?01\)?(\d{8,14})/);
  return m ? m[1] : "";
}

function findEXP(s) {
  const m = s.match(/\(?17\)?(\d{6})/);
  return m && isValidYYMMDD(m[1]) ? m[1] : "";
}

function findEXPRaw(s) {
  const m = s.match(/\(?17\)?(\d{3,6})/);
  return m ? m[1] : "";
}

// ===== LOT =====
function cleanupLotRaw(v) {
  return (v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9\-]/g, "")
    .split("(")[0]
    .slice(0, 80);
}

function normalizeLot8Dash3(v) {
  const s = cleanupLotRaw(v);
  const m = s.match(/([A-Z0-9]{8}-[A-Z0-9]{3})/);
  return m ? m[1] : "";
}

function findLotAfterExp(s, expEnd) {
  const tail = expEnd >= 0 ? s.slice(expEnd) : s;
  const m = tail.match(/\(?21\)?([A-Z0-9\-]{1,80})/);
  if (!m) return { norm: "", raw: "" };
  const raw = cleanupLotRaw(m[1]);
  return { raw, norm: normalizeLot8Dash3(raw) };
}

function findLotAnywhere(s) {
  const m = s.match(/([A-Z0-9]{8}-[A-Z0-9]{1,20})/);
  if (!m) return { raw: "", norm: "" };
  const raw = cleanupLotRaw(m[1]);
  return { raw, norm: normalizeLot8Dash3(raw) };
}

export function extractGS1(text) {
  const s = compact(text);

  const gtin = findGTIN(s);
  const expYYMMDD = findEXP(s);

  const gtin_raw = gtin ? "" : findGTINRaw(s);
  const exp_raw = expYYMMDD ? "" : findEXPRaw(s);

  let expEnd = -1;
  const expM = s.match(/\(?17\)?\d{3,6}/);
  if (expM && expM.index != null) expEnd = expM.index + expM[0].length;

  let lot_raw = "", lot_norm = "";
  const a = findLotAfterExp(s, expEnd);
  lot_raw = a.raw;
  lot_norm = a.norm;

  if (!lot_raw) {
    const b = findLotAnywhere(s);
    lot_raw = b.raw;
    lot_norm = b.norm;
  }

  return {
    gtin,
    gtin_raw,
    exp: expYYMMDD ? yymmddToISO(expYYMMDD) : "",
    exp_raw,
    lot: lot_norm || lot_raw || "",
    lot_raw,
    lot_norm
  };
}
