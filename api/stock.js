// api/stock.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    // 解決跨域問題 (CORS)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action, item_uuid, from_loc, to_loc, operator } = req.body;

    try {
        if (req.method === 'GET') {
            // 功能：讀取目前的總表 (View)
            const { data } = await supabase.from('inventory_summary').select('*');
            return res.status(200).json(data);
        }

        if (req.method === 'POST') {
            const { raw_text, operator } = req.body;
            // 利用 Regex (正規表示式) 拆解你那串 GS1-128 格式
            // 抓取 (01)產品代碼, (17)有效日期, (21)UUID
            const productCode = raw_text.match(/\(01\)(\d+)/)?.[1];
            const expiryDate = raw_text.match(/\(17\)(\d+)/)?.[1];
            const fullUuid = raw_text.match(/\(21\)([\w-]+)/)?.[1];
            
            // 你要的 UUID 前 12 碼 (包含 -)
            const shortUuid = fullUuid ? fullUuid.substring(0, 12) : null;

            if (!shortUuid) return res.status(400).json({ error: "辨識失敗，找不到序號" });

            const { error } = await supabase.from('transactions').insert([
                { 
                    item_uuid: shortUuid, 
                    product_code: productCode,
                    expiry_date: expiryDate,
                    from_loc: 'FACTORY', 
                    to_loc: 'MAIN', 
                    operator_name: operator 
                }
            ]);
            
            return res.status(200).json({ message: '成功入庫', shortUuid });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}