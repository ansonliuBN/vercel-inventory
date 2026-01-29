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
            // 功能：寫入一筆新的異動 (補貨或銷帳)
            const { error } = await supabase.from('transactions').insert([
                { item_uuid, from_loc, to_loc, operator_name: operator }
            ]);
            
            if (error) throw error;
            return res.status(200).json({ message: 'Success' });
        }
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}