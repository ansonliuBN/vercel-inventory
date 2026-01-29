// api/stock.js 完整加強版
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'GET') {
        // 抓取總表，並按效期排序
        const { data } = await supabase.from('inventory_summary').select('*').order('expiry_date', { ascending: true });
        return res.json(data);
    }

    if (req.method === 'POST') {
        const { item_uuid, from_loc, to_loc, operator, expiry_date, product_code } = req.body;

        // 寫入交易紀錄
        const { error } = await supabase.from('transactions').insert([{
            item_uuid,
            from_loc,
            to_loc,
            operator_name: operator,
            expiry_date,    // 存入圖片中的 (17) 日期
            product_code    // 存入圖片中的 (01) 代碼
        }]);

        if (error) return res.status(500).json(error);
        return res.json({ success: true });
    }
}