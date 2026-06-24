// Initialize Supabase Client
const SUPABASE_URL = 'https://nimgsgnkcvddomrgkawb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-lsEclVqaNPAlO4h7z3vtw_Q8xZY3cN';

(() => {
  const supabaseSdk = window.supabase;

  if (!supabaseSdk || typeof supabaseSdk.createClient !== 'function') {
    throw new Error('Supabase SDK failed to load.');
  }

  if (!window.gcSupabase) {
    window.gcSupabase = supabaseSdk.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      },
    );
  }
})();
