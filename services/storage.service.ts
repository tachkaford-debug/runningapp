/**
 * Storage abstraction layer.
 * Centralises AsyncStorage keys and typed accessors.
 * Existing services continue to use utils/storage directly — migrate gradually.
 */
import { getItem, setItem } from '@/utils/storage';
import { GridCell } from './territory.service';
import { Workout } from './workout.service';

const KEYS = {
  GRID_CELLS: 'grid_cells',
  WORKOUTS:   'workouts',
} as const;

// ─── Grid Cells ───────────────────────────────────────────

export const getGridCells = async (): Promise<Record<string, GridCell>> =>
  (await getItem<Record<string, GridCell>>(KEYS.GRID_CELLS)) ?? {};

export const saveGridCells = async (cells: Record<string, GridCell>): Promise<void> => {
  await setItem(KEYS.GRID_CELLS, cells);
};

// ─── Workouts ─────────────────────────────────────────────

export const getWorkouts = async (): Promise<Workout[]> =>
  (await getItem<Workout[]>(KEYS.WORKOUTS)) ?? [];

export const saveWorkout = async (workout: Workout): Promise<void> => {
  const all = await getWorkouts();
  all.unshift(workout);
  await setItem(KEYS.WORKOUTS, all);
};
