export type DataProvider = 'supabase' | 'pocketbase';

const rawProvider = String(import.meta.env.VITE_DATA_PROVIDER || 'supabase').toLowerCase();

export const DATA_PROVIDER: DataProvider = rawProvider === 'pocketbase' ? 'pocketbase' : 'supabase';

export const DATA_PROVIDER_LABEL = DATA_PROVIDER === 'pocketbase' ? 'PocketBase' : 'Supabase';

export const isPocketBaseProvider = DATA_PROVIDER === 'pocketbase';
