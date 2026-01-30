const sharp = require('sharp');
const { createWorker } = require('tesseract.js');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  let worker = null;
  console.log(">>> API 開始處理請求");

  try {
    const { image } = req.body;
    const buffer = Buffer.from(image.split(',')[1], 'base64');

    // 步驟 1: Sharp 預處理 (只做最精簡的動作)
    console.log(">>> Sharp 正在處理圖片...");
    const imgBase = await sharp(buffer)
      .grayscale()
      .normalize() // 自動調整對比
      .sharpen()
      .toBuffer();

    // 步驟 2: 初始化 Tesseract (這是最耗時的一步)
    console.log(">>> Tesseract 正在初始化...");
    worker = await createWorker('eng');
    
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789()ABCDEFGHIJKLMNOPQRSTUVWXYZ-',
      tessedit_pageseg_mode: '7',
    });

    // 步驟 3: 辨識
    console.log(">>> 正在辨識...");
    const { data: { text } } = await worker.recognize(imgBase);
    
    console.log(">>> 辨識成功:", text);

    await worker.terminate();

    return res.status(200).json({
      rawText: text.replace(/\s+/g, ''),
      debugImages: {
        base: imgBase.toString('base64'),
        threshold: imgBase.toString('base64'), // 暫時回傳同一張
        sharp: imgBase.toString('base64')
      }
    });

  } catch (err) {
    console.error("!!! API 發生錯誤:", err.message);
    if (worker) await worker.terminate();
    return res.status(500).json({ error: err.message });
  }
}