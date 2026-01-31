// public/supabase-config.js
const SUPABASE_URL = 'https://jedmwxnemgqeoulddksk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_K2XFBwc6wy3LElaUU3g0vQ_Q6maHhLX';

// 初始化並掛載到全域 window 物件
window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 共享功能：自動定位找最近地點
async function findNearestLocation(lat, lng) {
    const { data: locs } = await window._supabase.from('locations').select('*');
    if (!locs) return null;
    return locs.map(l => {
        const dist = Math.sqrt(Math.pow(l.lat - lat, 2) + Math.pow(l.lng - lng, 2));
        return { ...l, dist };
    }).sort((a, b) => a.dist - b.dist)[0];
}