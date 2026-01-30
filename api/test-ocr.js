// api/test-ocr.js
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { image } = req.body; // Base64 string
    const buffer = Buffer.from(image.split(',')[1], 'base64');

    // --- Sharp 預處理策略：產生三種測試版本 ---
    // 1. 基本增強 (灰階 + 適度對比)
    const imgBase = await sharp(buffer).grayscale().resize(1000).toBuffer();
    
    // 2. 極限對比 (二值化，專治反光)
    const imgThreshold = await sharp(buffer)
      .grayscale()
      .linear(1.5, -0.2) // 提高對比
      .threshold(140)    // 純黑白
      .toBuffer();

    // 3. 銳化版本 (專治模糊)
    const imgSharp = await sharp(buffer)
      .grayscale()
      .sharpen({ sigma: 2 })
      .toBuffer();

    // --- 進行 Tesseract OCR (以第二個版本為例) ---
    const worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789()ABCDEFGHIJKLMNOPQRSTUVWXYZ-',
      tessedit_pageseg_mode: '7',
    });

    const { data: { text } } = await worker.recognize(imgThreshold);
    await worker.terminate();

    // 將處理後的圖轉回 Base64 傳給前端 Debug
    res.status(200).json({
      rawText: text,
      debugImages: {
        base: imgBase.toString('base64'),
        threshold: imgThreshold.toString('base64'),
        sharp: imgSharp.toString('base64')
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}