const sharp = require('sharp');
const { createWorker } = require('tesseract.js');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // 1. 建立 Tesseract Worker (後端建議每次建立或使用全域 worker)
  const worker = await createWorker('eng');

  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: "沒收到圖片" });
    const buffer = Buffer.from(image.split(',')[1], 'base64');

    // --- 第二步：Sharp 多重預處理 ---
    // 我們選用效果最強的一組：放大 + 灰階 + 銳利化 + 適度對比
    const sharpInstance = sharp(buffer);
    const metadata = await sharpInstance.metadata();

    // 自動裁切掉邊緣 (只留中間 60% 區域)，減少背景雜訊干擾
    const extractHeight = Math.floor(metadata.height * 0.6);
    const extractTop = Math.floor((metadata.height - extractHeight) / 2);

    const imgBase = await sharpInstance
      .extract({ left: 0, top: extractTop, width: metadata.width, height: extractHeight })
      .resize(1200) // 放大圖片讓文字更好認
      .grayscale()
      .toBuffer();

    const imgThreshold = await sharp(imgBase)
      .threshold(145) // 二值化：讓黑白分明
      .toBuffer();

    const imgSharp = await sharp(imgBase)
      .sharpen() // 銳化邊緣
      .toBuffer();

    // --- 第三步：設定 Tesseract 參數並辨識 ---
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789()ABCDEFGHIJKLMNOPQRSTUVWXYZ-', // 只准認這些字
      tessedit_pageseg_mode: '7', // 視為單一文字行 (PSM 7)
      classify_bln_numeric_mode: '1', // 強化數字辨識
    });

    // 我們拿「銳化版」或「二值化版」來辨識，這裡建議用 imgSharp 綜合效果較好
    const { data: { text } } = await worker.recognize(imgSharp);
    
    // --- 第四步：自動校正 GS1 常見錯誤 ---
    let cleanText = text
      .replace(/\s+/g, '')       // 去除所有空格
      .replace(/\(O1\)/g, '(01)') // 修正常見 OCR 錯誤
      .replace(/\(l7\)/g, '(17)')
      .replace(/\(I7\)/g, '(17)')
      .replace(/O/g, '0');        // 如果是 GS1 數字區，通常 O 都是 0

    await worker.terminate();

    // 回傳結果與 Debug 圖
    return res.status(200).json({
      rawText: cleanText,
      debugImages: {
        base: imgBase.toString('base64'),
        threshold: imgThreshold.toString('base64'),
        sharp: imgSharp.toString('base64')
      }
    });

  } catch (err) {
    if (worker) await worker.terminate();
    console.error("API Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}