const sharp = require('sharp');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  console.log(">>> 收到請求，僅測試 Sharp 處理");

  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: "沒收到圖片" });
    
    const buffer = Buffer.from(image.split(',')[1], 'base64');

    // 這裡只跑 Sharp，不跑 Tesseract
    const imgBase = await sharp(buffer)
      .grayscale()
      .resize(800) // 縮小一點跑更快
      .normalize()
      .toBuffer();

    console.log(">>> Sharp 處理完成，回傳結果");

    return res.status(200).json({
      rawText: "OCR 暫時關閉，測試 Sharp 是否成功",
      debugImages: {
        base: imgBase.toString('base64'),
        threshold: imgBase.toString('base64'),
        sharp: imgBase.toString('base64')
      }
    });

  } catch (err) {
    console.error("!!! API 錯誤:", err.message);
    return res.status(500).json({ error: err.message });
  }
}