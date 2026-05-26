/**
 * Persistent device identity.
 * Generates a UUID once on first launch and stores it permanently.
 * Used as userId fallback when no account session exists.
 */
import { getItem, setItem } from '@/utils/storage';

const DEVICE_USER_KEY = 'device_user_id';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

let cached: string | null = null;

export const deviceUserService = {
  /** Returns the persistent device userId, creating it on first call. */
  async getUserId(): Promise<string> {
    if (cached) return cached;
    const stored = await getItem<string>(DEVICE_USER_KEY);
    if (stored) { cached = stored; return stored; }
    const id = generateUUID();
    await setItem(DEVICE_USER_KEY, id);
    cached = id;
    return id;
  },

  /** Call once at app start to warm the cache. */
  async init(): Promise<void> {
    await deviceUserService.getUserId();
  },
};
