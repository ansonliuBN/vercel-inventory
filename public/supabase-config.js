// public/supabase-config.js
const SUPABASE_URL = 'https://jedmwxnemgqeoulddksk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_K2XFBwc6wy3LElaUU3g0vQ_Q6maHhLX';

// 初始化並掛載到全域 window 物件
window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);