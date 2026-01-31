import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const { item_uuid, from_loc, to_loc, operator, expiry_date, product_code } = req.body;
      
      if (!item_uuid) throw new Error("缺少序號 (UUID)");

      const { data, error } = await supabase.from('transactions').insert([{
        item_uuid,
        from_loc: from_loc || 'FACTORY',
        to_loc: to_loc,
        operator_name: operator,
        expiry_date,
        product_code
      }]);

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    }
  } catch (err) {
    // 確保這裡回傳的是 JSON，避免前端報錯
    return res.status(500).json({ success: false, message: err.message });
  }
}