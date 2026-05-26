/**
 * Stats Service — aggregated user statistics
 *
 * Equivalent to: GET /user/stats
 * Response: { total_distance, total_calories, total_runs, ... }
 *
 * All data is computed from local workouts (AsyncStorage).
 * Replace getUserStats() body with a real fetch() call when backend is ready.
 */
import { workoutService } from './workout.service';

export interface UserStats {
  total_distance: number;   // km
  total_calories: number;
  total_runs: number;
  total_duration: number;   // seconds
  best_pace: number;        // min/km  (0 = no data)
  best_distance: number;    // km
  current_streak: number;   // days
}

export const statsService = {
  /**
   * GET /user/stats
   * Returns aggregated stats for the current user.
   */
  async getUserStats(): Promise<UserStats> {
    const workouts = await workoutService.getUserWorkouts(1000);

    if (workouts.length === 0) {
      return {
        total_distance: 0,
        total_calories: 0,
        total_runs: 0,
        total_duration: 0,
        best_pace: 0,
        best_distance: 0,
        current_streak: 0,
      };
    }

    const total_distance = workouts.reduce((s, w) => s + w.distance_km, 0);
    const total_calories = workouts.reduce((s, w) => s + w.calories, 0);
    const total_runs = workouts.length;
    const total_duration = workouts.reduce((s, w) => s + w.duration_seconds, 0);

    const paces = workouts.map(w => w.avg_pace).filter(p => p > 0);
    const best_pace = paces.length ? Math.min(...paces) : 0;
    const best_distance = Math.max(...workouts.map(w => w.distance_km));

    const current_streak = calcStreak(workouts.map(w => w.created_at));

    return {
      total_distance: Math.round(total_distance * 10) / 10,
      total_calories: Math.round(total_calories),
      total_runs,
      total_duration,
      best_pace: Math.round(best_pace * 100) / 100,
      best_distance: Math.round(best_distance * 10) / 10,
      current_streak,
    };
  },

  /** Weekly breakdown — distance per day for the last 7 days */
  async getWeeklyStats(): Promise<{ date: string; distance_km: number; duration_seconds: number }[]> {
    const workouts = await workoutService.getUserWorkouts(1000);
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = workouts.filter(w => new Date(w.created_at).getTime() >= cutoff);

    const map = new Map<string, { distance_km: number; duration_seconds: number }>();
    for (const w of recent) {
      const day = w.created_at.slice(0, 10);
      const prev = map.get(day) ?? { distance_km: 0, duration_seconds: 0 };
      map.set(day, {
        distance_km: prev.distance_km + w.distance_km,
        duration_seconds: prev.duration_seconds + w.duration_seconds,
      });
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, s]) => ({ date, ...s }));
  },
};

// ── helpers ──────────────────────────────────────────────────────────────────

function calcStreak(isoDates: string[]): number {
  if (!isoDates.length) return 0;

  const days = [...new Set(isoDates.map(d => d.slice(0, 10)))].sort().reverse();
  const today = new Date().toISOString().slice(0, 10);

  let streak = 0;
  let cursor = today;

  for (const day of days) {
    if (day === cursor) {
      streak++;
      cursor = prevDay(cursor);
    } else if (day < cursor) {
      break;
    }
  }

  return streak;
}

function prevDay(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
