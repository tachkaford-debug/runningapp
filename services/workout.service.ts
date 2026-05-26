/**
 * Workout Service — local storage implementation
 * Schema mirrors the workouts DB table:
 *   id, user_id, distance_km, duration_seconds, calories, avg_pace, created_at, gps_track
 */
import { getItem, setItem } from '@/utils/storage';
import { achievementsService } from './achievements.service';
import { authService } from './auth.service';
import { deviceUserService } from './device-user.service';
import { leaderboardService } from './leaderboard.service';
import { GpsPoint, TerritoryResult, territoryService } from './territory.service';

export interface Workout {
  id: string;
  user_id: string;
  distance_km: number;
  duration_seconds: number;
  calories: number;
  avg_pace: number;          // min/km
  created_at: string;        // ISO string
  day_of_week: number;       // 0=Sun … 6=Sat
  gps_track?: GpsPoint[];
}

export interface WorkoutSaveResult {
  workout: Workout;
  territory: TerritoryResult;
  xp_gained: number;  // territory.xp_gained only — no distance bonus
}

const WORKOUTS_KEY = 'workouts';

const getAllWorkouts = async (): Promise<Workout[]> =>
  (await getItem<Workout[]>(WORKOUTS_KEY)) || [];

export const workoutService = {
  /** Save a completed workout and process territory capture */
  async saveWorkout(
    data: Pick<Workout, 'distance_km' | 'duration_seconds' | 'calories' | 'avg_pace'> & {
      gps_track?: GpsPoint[];
    }
  ): Promise<WorkoutSaveResult> {
    const user = await authService.getCurrentUser();
    const userId = user?.id ?? await deviceUserService.getUserId();

    const now = new Date();
    const workout: Workout = {
      id: `workout_${Date.now()}`,
      user_id: userId,
      distance_km: data.distance_km,
      duration_seconds: data.duration_seconds,
      calories: data.calories,
      avg_pace: data.avg_pace,
      gps_track: data.gps_track,
      created_at: now.toISOString(),
      day_of_week: now.getDay(),
    };

    const all = await getAllWorkouts();
    all.unshift(workout);
    await setItem(WORKOUTS_KEY, all);

    // Process territory capture
    const territory = await territoryService.processWorkoutTerritory(
      workout.id,
      userId,
      data.gps_track ?? []
    );

    // XP comes entirely from territory (cells + run bonus + milestones)
    const xp_gained = territory.xp_gained;

    // Side effects
    achievementsService.checkAndUnlock().catch(() => {});
    leaderboardService.rebuildLeaderboard().catch(() => {});

    return { workout, territory, xp_gained };
  },

  /** Get all workouts for the current user, newest first */
  async getUserWorkouts(limit = 50): Promise<Workout[]> {
    const user = await authService.getCurrentUser();
    const userId = user?.id ?? await deviceUserService.getUserId();
    const all = await getAllWorkouts();
    return all.filter(w => w.user_id === userId).slice(0, limit);
  },

  /** Get the most recent workout */
  async getLastWorkout(): Promise<Workout | null> {
    const workouts = await workoutService.getUserWorkouts(1);
    return workouts[0] ?? null;
  },

  /** Delete a workout by id */
  async deleteWorkout(id: string): Promise<void> {
    const all = await getAllWorkouts();
    await setItem(WORKOUTS_KEY, all.filter(w => w.id !== id));
  },
};
