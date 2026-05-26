/**
 * Territory API — grid-based capture (50m x 50m cells)
 *
 * RPCs: capture_cell, get_user_cells, get_map_cells, get_territory_leaderboard
 * See supabase/migrations/20250317010000_territory_grid.sql
 */

import { supabase } from '@/utils/supabase';

// ── Types ───────────────────────────────────────────────────────────────────

export interface GridCell {
  id: string;
  lat_index: number;
  lng_index: number;
  owner_user_id: string | null;
  capture_count: number;
  captured_at: string;
}

export interface UserCellWithVisit extends GridCell {
  visited_at: string;
  is_owner: boolean;
}

export interface TerritoryLeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  total_cells_owned: number;
  total_cells_visited: number;
  is_current_user: boolean;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Territory level from capture_count: 1→1, 3→2, 10+→3 */
export function getCellLevel(captureCount: number): 1 | 2 | 3 {
  if (captureCount >= 10) return 3;
  if (captureCount >= 3) return 2;
  return 1;
}

/** Fill color for map polygon by level (green / blue / purple) */
export const TERRITORY_LEVEL_COLORS: Record<1 | 2 | 3, string> = {
  1: '#22c55e',
  2: '#3b82f6',
  3: '#a855f7',
};

/** Convert grid cell to 50m×50m polygon coordinates (SW, SE, NE, NW, close). Uses same cell_size as backend. */
export function cellToPolygonCoordinates(
  latIndex: number,
  lngIndex: number
): { latitude: number; longitude: number }[] {
  const size = CELL_SIZE;
  const sw = { latitude: latIndex * size, longitude: lngIndex * size };
  const se = { latitude: latIndex * size, longitude: (lngIndex + 1) * size };
  const ne = { latitude: (latIndex + 1) * size, longitude: (lngIndex + 1) * size };
  const nw = { latitude: (latIndex + 1) * size, longitude: lngIndex * size };
  return [sw, se, ne, nw, sw];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function hasRpc(s: typeof supabase): boolean {
  return typeof (s as any).rpc === 'function';
}

// ── Grid calculation (client-side mirror of get_grid_cell) ──────────────────

const CELL_SIZE = 0.00045;

export function getGridCellIndexes(lat: number, lng: number): { lat_index: number; lng_index: number } {
  return {
    lat_index: Math.floor(lat / CELL_SIZE),
    lng_index: Math.floor(lng / CELL_SIZE),
  };
}

// ── capture_cell(lat, lng, user_id?) ────────────────────────────────────────

/**
 * Capture a grid cell for the current user at (lat, lng).
 * Creates cell if needed, assigns owner if empty, bumps capture_count on revisit.
 * Returns cell id or null.
 */
export async function captureCell(
  lat: number,
  lng: number,
  userId?: string
): Promise<string | null> {
  if (!hasRpc(supabase)) return null;
  const args = userId ? { p_lat: lat, p_lng: lng, p_user_id: userId } : { p_lat: lat, p_lng: lng };
  const { data, error } = await supabase.rpc('capture_cell', args);
  if (error) {
    console.error('[territory.api] capture_cell', error);
    return null;
  }
  return data as string;
}

// ── get_user_cells(user_id?) ────────────────────────────────────────────────

/**
 * All cells the user has visited (with owner and visit info).
 */
export async function getUserCells(userId?: string): Promise<UserCellWithVisit[]> {
  if (!hasRpc(supabase)) return [];
  const { data, error } = await supabase.rpc('get_user_cells', userId ? { p_user_id: userId } : {});
  if (error) {
    console.error('[territory.api] get_user_cells', error);
    return [];
  }
  return (data as UserCellWithVisit[]) ?? [];
}

// ── get_map_cells(bounds) ────────────────────────────────────────────────────

/**
 * All grid cells inside the map viewport (for map overlay).
 */
export async function getMapCells(bounds: MapBounds): Promise<GridCell[]> {
  if (!hasRpc(supabase)) return [];
  const { data, error } = await supabase.rpc('get_map_cells', {
    p_north: bounds.north,
    p_south: bounds.south,
    p_east: bounds.east,
    p_west: bounds.west,
  });
  if (error) {
    console.error('[territory.api] get_map_cells', error);
    return [];
  }
  return (data as GridCell[]) ?? [];
}

// ── get_territory_leaderboard(limit?) ────────────────────────────────────────

/**
 * GET /territory-leaderboard — top users by total_cells_owned.
 */
export async function getTerritoryLeaderboard(
  limit: number = 100
): Promise<TerritoryLeaderboardEntry[]> {
  if (!hasRpc(supabase)) return [];
  const { data, error } = await supabase.rpc('get_territory_leaderboard', { p_limit: limit });
  if (error) {
    console.error('[territory.api] get_territory_leaderboard', error);
    return [];
  }
  return (data as TerritoryLeaderboardEntry[]) ?? [];
}
