// public/libs/scanEngine.js
import { extractGS1, hasGS1Complete, hasGS1Hope, compact, normalizeTextKeepParens } from "./gs1.js";

let _zxingReady = false;
let _ocrWorker = null;

function ensureZXingLoaded() {
  if (!window.ZXingWASM || typeof window.ZXingWASM.readBarcodes !== "function") {
    throw new Error("zxing-wasm 未載入成功");
  }
}

export async function initZXing({ wasmUrl = "/zxing_reader.wasm" } = {}) {
  ensureZXingLoaded();
  if (_zxingReady) return;

  window.ZXingWASM.prepareZXingModule({
    overrides: {
      locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmUrl : (prefix + path))
    },
    fireImmediately: true
  });

  _zxingReady = true;
}

function ensureTesseractLoaded() {
  if (!window.Tesseract || typeof window.Tesseract.createWorker !== "function") {
    throw new Error("Tesseract.js 未載入成功");
  }
}

export async function getOcrWorker() {
  ensureTesseractLoaded();
  if (_ocrWorker) return _ocrWorker;
  _ocrWorker = await window.Tesseract.createWorker("eng");
  return _ocrWorker;
}

export function rotateCanvas(src, deg) {
  const rad = deg * Math.PI / 180;
  const w = src.width, h = src.height;

  const c = document.createElement("canvas");
  const g = c.getContext("2d", { willReadFrequently: true });

  if (deg % 180 !== 0) { c.width = h; c.height = w; }
  else { c.width = w; c.height = h; }

  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2);
  g.rotate(rad);
  g.drawImage(src, -w / 2, -h / 2);
  return c;
}

export function cropSub(canvas, x, y, w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  const g = c.getContext("2d", { willReadFrequently: true });

  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, x, y, w, h, 0, 0, c.width, c.height);
  return c;
}

export function cropCanvas(workCanvas, rect, scale = 1.8) {
  const c = document.createElement("canvas");
  c.width = Math.max(10, Math.floor(rect.w * scale));
  c.height = Math.max(10, Math.floor(rect.h * scale));
  const g = c.getContext("2d", { willReadFrequently: true });

  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);

  const sx = Math.max(0, Math.min(workCanvas.width - 1, rect.x));
  const sy = Math.max(0, Math.min(workCanvas.height - 1, rect.y));
  const sw = Math.max(1, Math.min(workCanvas.width - sx, rect.w));
  const sh = Math.max(1, Math.min(workCanvas.height - sy, rect.h));

  g.imageSmoothingEnabled = false;
  g.drawImage(workCanvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

export function getBigRoiRect(workCanvas, centerRatioY = 0.52) {
  const cw = workCanvas.width, ch = workCanvas.height;
  const boxW = cw * 0.94;
  const boxH = ch * 0.46;
  const cx = cw * 0.5;
  const cy = ch * centerRatioY;
  const x = Math.max(0, Math.floor(cx - boxW / 2));
  const y = Math.max(0, Math.floor(cy - boxH / 2));
  return { x, y, w: Math.floor(boxW), h: Math.floor(boxH) };
}

// ===== ZXing =====
export async function zxingDecodeFromCanvas(canvasForZXing) {
  await initZXing();
  const g = canvasForZXing.getContext("2d", { willReadFrequently: true });
  const imgData = g.getImageData(0, 0, canvasForZXing.width, canvasForZXing.height);
  const results = await window.ZXingWASM.readBarcodes(imgData, { tryHarder: true, maxNumberOfSymbols: 2 });
  if (!results || !results.length) return "";

  // 先找完整，再找有希望
  for (const r of results) {
    const t = r?.text || "";
    if (t && hasGS1Complete(t)) return t;
  }
  for (const r of results) {
    const t = r?.text || "";
    if (t && hasGS1Hope(t)) return t;
  }
  return results[0]?.text || "";
}

export async function zxingScanBigRoi(workCanvas, debug = []) {
  const rect = getBigRoiRect(workCanvas, 0.52);
  const bigCrop = cropCanvas(workCanvas, rect, 2.0);

  const W = bigCrop.width, H = bigCrop.height;
  const roiW = Math.floor(W * 0.96);
  const roiH = Math.floor(H * 0.78);
  const left = Math.floor((W - roiW) / 2);
  const stepY = Math.max(1, Math.floor(H * 0.10));

  const candidates = [{ name: "FULL_BIG", canvas: bigCrop }];
  for (let y = 0; y <= Math.max(0, H - roiH); y += stepY) {
    candidates.push({ name: `WIN_Y${y}`, canvas: cropSub(bigCrop, left, y, roiW, roiH) });
  }

  const angles = [0, 90, 270, 180];

  for (const item of candidates) {
    for (const deg of angles) {
      const feed = deg === 0 ? item.canvas : rotateCanvas(item.canvas, deg);
      let t = "";
      try { t = await zxingDecodeFromCanvas(feed); } catch (e) { t = ""; }

      debug.push(`[ZXING][${item.name}][${deg}] ${t ? compact(t).slice(0, 120) : "(empty)"}`);

      if (t && hasGS1Complete(t)) {
        debug.push(`[ZXING][BEST] COMPLETE ${item.name} @ ${deg}`);
        return { text: t, source: `ZXING_${item.name}_${deg}`, bigCrop, feed, level: "complete" };
      }
      if (t && hasGS1Hope(t)) {
        debug.push(`[ZXING][BEST] HOPE ${item.name} @ ${deg}`);
        return { text: t, source: `ZXING_${item.name}_${deg}`, bigCrop, feed, level: "hope" };
      }
    }
  }

  debug.push(`[ZXING][BEST] -`);
  return { text: "", source: "ZXING_NONE", bigCrop, feed: null, level: "none" };
}

// ===== OCR =====
function canvasToJpegURL(canvas, q = 0.95) {
  return canvas.toDataURL("image/jpeg", q);
}

function enhanceForOcr(baseCanvas, contrast = 1.35, threshold = 175) {
  // 注意：拍螢幕不要太兇，避免把摩爾紋變成硬噪點
  const c = document.createElement("canvas");
  c.width = baseCanvas.width;
  c.height = baseCanvas.height;
  const g = c.getContext("2d", { willReadFrequently: true });

  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(baseCanvas, 0, 0);

  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    let y = 0.299 * r + 0.587 * gg + 0.114 * b;
    y = (y - 128) * contrast + 128;
    y = Math.max(0, Math.min(255, y));
    const v = (y > threshold) ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function downscaleToMaxSide(src, maxSide) {
  const w = src.width, h = src.height;
  const max = Math.max(w, h);
  if (max <= maxSide) return src;
  const scale = maxSide / max;

  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(w * scale));
  c.height = Math.max(1, Math.floor(h * scale));
  const g = c.getContext("2d", { willReadFrequently: true });

  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = true;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export async function ocrFullRotate(workCanvas, debug = [], onFeedCanvas = null, onEnhCanvas = null) {
  const worker = await getOcrWorker();
  const opts = {
    tessedit_char_whitelist: "0123456789()ABCDEFGHIJKLMNOPQRSTUVWXYZ-",
    tessedit_pageseg_mode: "6"
  };

  // 對付拍螢幕：多個 downscale 變體（20cm 常見有效）
  const maxSides = [2200, 1600, 1200, 900];
  const angles = [0, 90, 180, 270];

  for (const ms of maxSides) {
    const base = downscaleToMaxSide(workCanvas, ms);
    const enh = enhanceForOcr(base, 1.35, 175);

    debug.push(`[OCR][SCALE] maxSide=${ms}, base=${base.width}x${base.height}`);

    for (const deg of angles) {
      // RAW
      const feedRaw = deg === 0 ? base : rotateCanvas(base, deg);
      if (onFeedCanvas) onFeedCanvas(feedRaw);

      let rawText = "";
      try {
        const ret = await worker.recognize(canvasToJpegURL(feedRaw, 0.95), opts);
        rawText = normalizeTextKeepParens(ret?.data?.text || "");
      } catch (e) { rawText = ""; }

      debug.push(`[OCR][RAW][${deg}] ${compact(rawText).slice(0, 220)}${compact(rawText).length > 220 ? "..." : ""}`);

      if (rawText && hasGS1Complete(rawText)) {
        debug.push(`[OCR][BEST] COMPLETE RAW @ ${deg} scale=${ms}`);
        return { text: rawText, source: `OCR_FULL_RAW_${deg}_S${ms}`, feed: feedRaw, enh: null, level: "complete" };
      }
      if (rawText && hasGS1Hope(rawText)) {
        debug.push(`[OCR][BEST] HOPE RAW @ ${deg} scale=${ms}`);
        return { text: rawText, source: `OCR_FULL_RAW_${deg}_S${ms}`, feed: feedRaw, enh: null, level: "hope" };
      }

      // ENH
      const feedEnh = deg === 0 ? enh : rotateCanvas(enh, deg);
      if (onEnhCanvas) onEnhCanvas(feedEnh);

      let enhText = "";
      try {
        const ret = await worker.recognize(canvasToJpegURL(feedEnh, 0.95), opts);
        enhText = normalizeTextKeepParens(ret?.data?.text || "");
      } catch (e) { enhText = ""; }

      debug.push(`[OCR][ENH][${deg}] ${compact(enhText).slice(0, 220)}${compact(enhText).length > 220 ? "..." : ""}`);

      if (enhText && hasGS1Complete(enhText)) {
        debug.push(`[OCR][BEST] COMPLETE ENH @ ${deg} scale=${ms}`);
        return { text: enhText, source: `OCR_FULL_ENH_${deg}_S${ms}`, feed: null, enh: feedEnh, level: "complete" };
      }
      if (enhText && hasGS1Hope(enhText)) {
        debug.push(`[OCR][BEST] HOPE ENH @ ${deg} scale=${ms}`);
        return { text: enhText, source: `OCR_FULL_ENH_${deg}_S${ms}`, feed: null, enh: feedEnh, level: "hope" };
      }
    }
  }

  debug.push(`[OCR][BEST] -`);
  return { text: "", source: "OCR_NONE", feed: null, enh: null, level: "none" };
}

// ===== Orchestration =====
export async function analyzeWorkCanvas(workCanvas, {
  forceOcr = false,
  ocrAfterZxingFails = true,
  debug = [],
  onBigCrop = null,
  onZxingFeed = null,
  onOcrFeed = null,
  onOcrEnh = null
} = {}) {
  // 1) ZXing first
  if (!forceOcr) {
    const z = await zxingScanBigRoi(workCanvas, debug);
    if (onBigCrop) onBigCrop(z.bigCrop);
    if (onZxingFeed && z.feed) onZxingFeed(z.feed);

    if (z.text && (z.level === "complete" || z.level === "hope")) {
      const data = extractGS1(z.text);
      return { source: z.source, raw: z.text, data, debug_text: debug.join("\n"), level: z.level };
    }

    if (!ocrAfterZxingFails) {
      const data = extractGS1(z.text || "");
      return { source: z.source, raw: z.text || "", data, debug_text: debug.join("\n"), level: z.level };
    }
  }

  // 2) OCR fallback
  const o = await ocrFullRotate(workCanvas, debug, onOcrFeed, onOcrEnh);
  const data = extractGS1(o.text || "");
  return { source: o.source, raw: o.text || "", data, debug_text: debug.join("\n"), level: o.level };
}
