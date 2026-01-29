// 負責：新增流水帳、讀取總表
export default async function handler(req, res) {
    if (req.method === 'GET') {
        const { data } = await supabase.from('inventory_summary').select('*');
        return res.json(data);
    }
    if (req.method === 'POST') {
        const { item_uuid, from_loc, to_loc, operator } = req.body;
        await supabase.from('transactions').insert([{ item_uuid, from_loc, to_loc, operator_name: operator }]);
        return res.json({ success: true });
    }
}