import PocketBase from 'pocketbase';
import { isPocketBaseProvider } from './dataProvider';

const pocketbaseUrl = import.meta.env.VITE_POCKETBASE_URL;

if (isPocketBaseProvider && !pocketbaseUrl) {
  console.error('PocketBase URL is missing in .env file (VITE_POCKETBASE_URL)');
}

const fallbackUrl = 'http://127.0.0.1:8090';

export const pocketbase = new PocketBase(pocketbaseUrl || fallbackUrl);
pocketbase.autoCancellation(false);
