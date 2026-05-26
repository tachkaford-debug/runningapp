/**
 * Medals Service — real running event medals
 *
 * Tables (local mirror):
 *   medals — id, user_id, event_name, place, event_date,
 *             proof_image_url, verification_status, created_at
 *
 * POST /medals/add   → addMedal()
 * GET  /user/medals  → getUserMedals()
 *
 * Admin actions: approveMedal() / rejectMedal()
 * Replace storage calls with fetch() when backend is ready.
 */
import { getItem, setItem } from '@/utils/storage';
import { authService } from './auth.service';

// ── Types ────────────────────────────────────────────────────────────────────

export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface Medal {
  id: string;
  user_id: string;
  event_name: string;
  place: string;           // e.g. "1st", "Top 10", "Finisher"
  event_date: string;      // ISO date string YYYY-MM-DD
  proof_image_url: string; // local URI or remote URL
  verification_status: VerificationStatus;
  created_at: string;
}

export type NewMedalInput = Pick<Medal, 'event_name' | 'place' | 'event_date' | 'proof_image_url'>;

// ── Storage key ──────────────────────────────────────────────────────────────

const MEDALS_KEY = 'medals';

const getAllMedals = async (): Promise<Medal[]> =>
  (await getItem<Medal[]>(MEDALS_KEY)) || [];

// ── Service ──────────────────────────────────────────────────────────────────

export const medalsService = {
  /**
   * POST /medals/add
   * Adds a new medal with status "pending".
   */
  async addMedal(input: NewMedalInput): Promise<Medal> {
    const user = await authService.getCurrentUser();
    const userId = user?.id ?? 'anonymous';

    const medal: Medal = {
      id: `medal_${Date.now()}`,
      user_id: userId,
      ...input,
      verification_status: 'pending',
      created_at: new Date().toISOString(),
    };

    const all = await getAllMedals();
    all.unshift(medal);
    await setItem(MEDALS_KEY, all);
    return medal;
  },

  /**
   * GET /user/medals
   * Returns all medals for the current user, newest first.
   */
  async getUserMedals(): Promise<Medal[]> {
    const user = await authService.getCurrentUser();
    const userId = user?.id ?? 'anonymous';
    const all = await getAllMedals();
    return all.filter(m => m.user_id === userId);
  },

  /**
   * Admin: approve a medal by id.
   * In production this would be a privileged API call.
   */
  async approveMedal(medalId: string): Promise<void> {
    const all = await getAllMedals();
    const idx = all.findIndex(m => m.id === medalId);
    if (idx !== -1) {
      all[idx].verification_status = 'approved';
      await setItem(MEDALS_KEY, all);
    }
  },

  /**
   * Admin: reject a medal by id.
   */
  async rejectMedal(medalId: string): Promise<void> {
    const all = await getAllMedals();
    const idx = all.findIndex(m => m.id === medalId);
    if (idx !== -1) {
      all[idx].verification_status = 'rejected';
      await setItem(MEDALS_KEY, all);
    }
  },

  /** Delete own medal */
  async deleteMedal(medalId: string): Promise<void> {
    const all = await getAllMedals();
    await setItem(MEDALS_KEY, all.filter(m => m.id !== medalId));
  },
};
