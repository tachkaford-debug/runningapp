/**
 * Leaderboard Service
 *
 * GET /leaderboard → getLeaderboard()
 * Returns top 100 users ranked by total_distance.
 *
 * The leaderboard snapshot is stored in AsyncStorage and rebuilt
 * every time a workout is saved (via rebuildLeaderboard()).
 * Replace with a real API fetch() when backend is ready.
 */
import { getItem, setItem } from '@/utils/storage';
import { authService } from './auth.service';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  distance: number;   // km, rounded to 1 decimal
  is_current_user: boolean;
}

// ── Storage keys ─────────────────────────────────────────────────────────────

const LB_KEY       = 'leaderboard_snapshot';
const WORKOUTS_KEY = 'workouts';

interface StoredWorkout {
  user_id: string;
  distance_km: number;
}

interface StoredUser {
  password: string;
  user: { id: string; full_name: string; email: string };
}

// ── Service ──────────────────────────────────────────────────────────────────

export const leaderboardService = {
  /**
   * GET /leaderboard
   * Returns cached top-100 snapshot, newest rebuild first.
   * Falls back to live computation if cache is empty.
   */
  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    const cached = await getItem<LeaderboardEntry[]>(LB_KEY);
    if (cached && cached.length > 0) return cached;
    return leaderboardService.rebuildLeaderboard();
  },

  /**
   * Rebuilds the leaderboard from all workouts across all users.
   * Called automatically after every workout save.
   */
  async rebuildLeaderboard(): Promise<LeaderboardEntry[]> {
    const currentUser = await authService.getCurrentUser();
    const currentUserId = currentUser?.id ?? '';

    // Aggregate distance per user_id
    const workouts = (await getItem<StoredWorkout[]>(WORKOUTS_KEY)) || [];
    const distMap = new Map<string, number>();
    for (const w of workouts) {
      distMap.set(w.user_id, (distMap.get(w.user_id) ?? 0) + w.distance_km);
    }

    // Resolve usernames from local_users store
    const usersStore = (await getItem<Record<string, StoredUser>>('local_users')) || {};
    const nameMap = new Map<string, string>();
    for (const record of Object.values(usersStore)) {
      nameMap.set(record.user.id, record.user.full_name || record.user.email);
    }
    // Make sure current user is always resolvable
    if (currentUser) {
      nameMap.set(currentUser.id, currentUser.full_name || currentUser.email);
    }

    // Sort descending by distance, take top 100
    const sorted = [...distMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100);

    const entries: LeaderboardEntry[] = sorted.map(([userId, dist], idx) => ({
      rank: idx + 1,
      user_id: userId,
      username: nameMap.get(userId) ?? 'Бегун',
      distance: Math.round(dist * 10) / 10,
      is_current_user: userId === currentUserId,
    }));

    await setItem(LB_KEY, entries);
    return entries;
  },

  /**
   * Returns the current user's position in the leaderboard.
   * Returns null if user has no workouts yet.
   */
  async getCurrentUserRank(): Promise<LeaderboardEntry | null> {
    const currentUser = await authService.getCurrentUser();
    if (!currentUser) return null;
    const lb = await leaderboardService.getLeaderboard();
    return lb.find(e => e.user_id === currentUser.id) ?? null;
  },
};
