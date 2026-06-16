// Initialize Supabase Client
const SUPABASE_URL = 'https://nimgsgnkcvddomrgkawb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-lsEclVqaNPAlO4h7z3vtw_Q8xZY3cN';

// Create a single supabase client for interacting with your database
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
