/**
 * Gamification API — backend RPC client
 *
 * When Supabase is configured, use these methods instead of local storage.
 * All endpoints are implemented as Supabase RPCs in supabase/migrations/20250317000000_gamification.sql
 */

import { supabase } from '@/utils/supabase';

// ── Types (match backend) ───────────────────────────────────────────────────

export interface UserStatsResponse {
  total_distance: number;
  total_calories: number;
  total_runs: number;
  level: number;
  xp: number;
}

export interface LeaderboardEntryResponse {
  rank: number;
  user_id: string;
  username: string;
  distance: number;
  is_current_user: boolean;
}

export interface DashboardStats {
  total_distance: number;
  total_runs: number;
  total_calories: number;
}

export interface DashboardMedal {
  id: string;
  event_name: string;
  place: string;
  event_date: string;
  proof_image: string | null;
  verification_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface DashboardAchievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked_at: string | null;
  unlocked: boolean;
}

export interface DashboardResponse {
  level: number;
  xp: number;
  xp_next_level: number;
  stats: DashboardStats;
  medals: DashboardMedal[];
  achievements: DashboardAchievement[];
  leaderboard: LeaderboardEntryResponse[];
}

// ── API helpers (check if supabase is real client) ───────────────────────────

function hasRpc(
  s: typeof supabase
): s is typeof supabase & { rpc: (fn: string, args?: object) => Promise<{ data: unknown; error: unknown }> } {
  return typeof (s as any).rpc === 'function';
}

// ── GET /user/stats ───────────────────────────────────────────────────────────

/**
 * Returns aggregated user stats + level + XP.
 * RPC: get_user_stats(p_user_id UUID DEFAULT auth.uid())
 */
export async function fetchUserStats(userId?: string): Promise<UserStatsResponse | null> {
  if (!hasRpc(supabase)) return null;
  const { data, error } = await supabase.rpc('get_user_stats', userId ? { p_user_id: userId } : {});
  if (error) {
    console.error('[gamification.api] get_user_stats', error);
    return null;
  }
  return data as UserStatsResponse;
}

// ── GET /leaderboard ─────────────────────────────────────────────────────────

/**
 * Returns top 100 users by total_distance.
 * RPC: get_leaderboard()
 */
export async function fetchLeaderboard(): Promise<LeaderboardEntryResponse[]> {
  if (!hasRpc(supabase)) return [];
  const { data, error } = await supabase.rpc('get_leaderboard');
  if (error) {
    console.error('[gamification.api] get_leaderboard', error);
    return [];
  }
  return (data as LeaderboardEntryResponse[]) ?? [];
}

// ── GET /dashboard ───────────────────────────────────────────────────────────

/**
 * Full achievements screen payload: level, xp, stats, medals, achievements, leaderboard.
 * RPC: get_dashboard(p_user_id UUID DEFAULT auth.uid())
 */
export async function fetchDashboard(userId?: string): Promise<DashboardResponse | null> {
  if (!hasRpc(supabase)) return null;
  const { data, error } = await supabase.rpc('get_dashboard', userId ? { p_user_id: userId } : {});
  if (error) {
    console.error('[gamification.api] get_dashboard', error);
    return null;
  }
  return data as DashboardResponse;
}

// ── Workout insert (updates XP + achievements via triggers) ──────────────────

/**
 * Insert workout. Backend triggers will:
 * - Calculate XP (1 km = 1 XP, first run of day +5, >5 km +5, >10 km +10)
 * - Update user_xp (level = floor(sqrt(xp_total/10)))
 * - Check and unlock achievements
 */
export async function insertWorkout(workout: {
  distance_km: number;
  duration_seconds: number;
  calories: number;
  avg_pace: number;
}): Promise<{ id: string } | null> {
  try {
    const chain = (supabase as any).from?.('workouts')?.insert(workout)?.select?.('id')?.single?.();
    if (!chain) return null;
    const { data, error } = await chain;
    if (error || !data) return null;
    return data as { id: string };
  } catch {
    return null;
  }
}
