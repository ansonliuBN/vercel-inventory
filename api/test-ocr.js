// api/test-ocr.js (極簡除錯版)
const sharp = require('sharp');

export default async function handler(req, res) {
  // 增加這行：讓 Vercel 日誌能看到收到了請求
  console.log("API 收到請求了！");

  if (req.method !== 'POST') return res.status(405).send('只支援 POST');

  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: "沒收到圖片" });

    const buffer = Buffer.from(image.split(',')[1], 'base64');

    // 只做最簡單的 Sharp 處理
    const processed = await sharp(buffer)
      .grayscale()
      .toBuffer();

    console.log("Sharp 處理成功！");

    return res.status(200).json({
      rawText: "API 測試連線成功",
      debugImages: {
        base: processed.toString('base64'),
        threshold: processed.toString('base64'),
        sharp: processed.toString('base64')
      }
    });
  } catch (err) {
    console.error("API 發生錯誤:", err.message);
    return res.status(500).json({ error: err.message });
  }
}