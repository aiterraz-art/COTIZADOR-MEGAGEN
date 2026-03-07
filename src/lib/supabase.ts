import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const dataProvider = String(import.meta.env.VITE_DATA_PROVIDER || 'supabase').toLowerCase();
const isSupabaseProvider = dataProvider === 'supabase';

if (isSupabaseProvider && (!supabaseUrl || !supabaseAnonKey)) {
    console.error('Supabase URL or Anon Key is missing in .env file');
}

// Keep a valid fallback to avoid runtime crash when provider is PocketBase.
const fallbackUrl = 'http://127.0.0.1:54321';
const fallbackKey = 'public-anon-key';

export const supabase = createClient(supabaseUrl || fallbackUrl, supabaseAnonKey || fallbackKey);
