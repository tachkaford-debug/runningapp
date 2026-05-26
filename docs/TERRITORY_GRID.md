# Grid-Based Territory Capture System

## Overview

Territory is represented by **50m × 50m grid cells** (similar to Pokémon GO). Each cell has integer indexes derived from latitude/longitude. Users capture cells by running through them.

---

## 1. Database Tables

### grid_cells

| Column           | Type      | Description                    |
|------------------|-----------|--------------------------------|
| id               | UUID (PK) |                                |
| lat_index        | INTEGER   | Grid row                       |
| lng_index        | INTEGER   | Grid column                    |
| owner_user_id     | UUID (FK) | First user to capture (nullable) |
| capture_count    | INTEGER   | Total visits (default 1)       |
| captured_at      | TIMESTAMPTZ | Last capture time            |

**Unique:** `(lat_index, lng_index)`

### user_cell_visits

| Column     | Type      |
|------------|-----------|
| user_id    | UUID (FK) |
| cell_id    | UUID (FK) |
| visited_at | TIMESTAMPTZ |

**Unique:** `(user_id, cell_id)`

---

## 2. Grid Calculation

**Function:** `get_grid_cell(lat, lng)`

- `cell_size = 0.00045` (~50 m at equator)
- `lat_index = floor(lat / cell_size)`
- `lng_index = floor(lng / cell_size)`

Returns `(lat_index, lng_index)`.

Client-side mirror: `getGridCellIndexes(lat, lng)` in `services/api/territory.api.ts`.

---

## 3. Cell Capture Logic

When a workout GPS point is processed (e.g. from the app or a batch job):

1. Compute `(lat_index, lng_index)` via `get_grid_cell(lat, lng)`.
2. **Upsert** `grid_cells`: insert if new; if exists increment `capture_count`, set `owner_user_id` only if currently NULL.
3. **Upsert** `user_cell_visits`: record or update `visited_at` for the user.

This is implemented in the **`capture_cell(lat, lng, user_id)`** RPC. The app can call it for each GPS point when syncing a workout.

---

## 4. User Territory Stats

**View:** `user_territory_stats`

| Column             | Description          |
|--------------------|----------------------|
| user_id            | profiles.id          |
| total_cells_owned   | COUNT where owner_user_id = user_id |
| total_cells_visited| COUNT in user_cell_visits |

---

## 5. GET /territory-leaderboard

**RPC:** `get_territory_leaderboard(p_limit)`  
Returns top users by `total_cells_owned` (then `total_cells_visited`), with rank and `is_current_user`.

---

## 6. Territory API (RPCs)

| RPC                 | Arguments              | Returns |
|---------------------|------------------------|--------|
| **capture_cell**    | p_lat, p_lng, p_user_id? (default auth.uid()) | cell UUID |
| **get_user_cells**  | p_user_id?             | JSON array of cells with visit/owner info |
| **get_map_cells**   | p_north, p_south, p_east, p_west | JSON array of cells in viewport |

**get_map_cells** converts the lat/lng bounds to index ranges and returns all `grid_cells` in that rectangle (for map overlay).

---

## 7. Indexes

- `grid_cells`: `lat_index`, `lng_index`, `owner_user_id`, `(lat_index, lng_index)`
- `user_cell_visits`: `user_id`, `cell_id`

---

## Client Usage

```ts
import {
  captureCell,
  getUserCells,
  getMapCells,
  getTerritoryLeaderboard,
  getGridCellIndexes,
} from '@/services/api/territory.api';

// After each GPS point during/after a run
await captureCell(lat, lng);

// Achievements / profile screen
const cells = await getUserCells();
const leaderboard = await getTerritoryLeaderboard(100);

// Map overlay
const cellsInView = await getMapCells({ north, south, east, west });
```

---

## Migration

Apply: `supabase/migrations/20250317010000_territory_grid.sql`  
Requires: `profiles` table (from gamification migration).
