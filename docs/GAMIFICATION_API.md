# Gamification System — API & Architecture

## Overview

The gamification system adds **XP**, **levels**, **achievements**, **medals**, and a **leaderboard** to the running tracker. The backend is implemented in PostgreSQL (Supabase) with triggers and RPCs.

---

## 1. User XP System

- **Rule:** 1 km = 1 XP (base).
- **Bonuses:**
  - First run of the day: **+5 XP**
  - Run > 5 km: **+5 XP**
  - Run > 10 km: **+10 XP**
- **Level formula:** `level = floor(sqrt(xp_total / 10))`
- **Table:** `user_xp` — `user_id`, `xp_total`, `level`, `updated_at`

XP is calculated and applied automatically when a workout is inserted (trigger `on_workout_insert_xp`).

---

## 2. Workouts

**Table:** `workouts`

| Column             | Type      |
|--------------------|-----------|
| id                 | UUID (PK) |
| user_id            | UUID (FK → profiles) |
| distance_km        | NUMERIC   |
| duration_seconds   | INTEGER   |
| calories           | INTEGER   |
| avg_pace           | NUMERIC   |
| created_at         | TIMESTAMPTZ |

On insert:
1. Trigger calculates XP and updates `user_xp`.
2. Trigger runs achievement checks and inserts into `user_achievements` when conditions are met.

---

## 3. User Statistics

**Endpoint:** `GET /user/stats` → RPC **`get_user_stats(p_user_id?)`**

**Response:**
```json
{
  "total_distance": 532,
  "total_calories": 18837,
  "total_runs": 46,
  "level": 7,
  "xp": 1240
}
```

- `p_user_id` defaults to `auth.uid()`.
- Aggregates from `workouts` + `user_xp`.

---

## 4. Achievements

**Table:** `achievements` — `id`, `title`, `description`, `icon`

**Seeded IDs:** `FIRST_RUN`, `RUN_10_KM_TOTAL`, `RUN_100_KM_TOTAL`, `RUN_7_DAYS_STREAK`, `RUN_50_WORKOUTS`

**Table:** `user_achievements` — `user_id`, `achievement_id`, `unlocked_at`

Conditions are evaluated in the trigger `check_achievements_after_workout()` after each workout insert.

---

## 5. Medals

**Table:** `medals`

| Column              | Type   |
|---------------------|--------|
| id                  | UUID (PK) |
| user_id             | UUID (FK) |
| event_name          | TEXT   |
| place               | TEXT   |
| event_date          | DATE   |
| proof_image         | TEXT   |
| verification_status | `pending` \| `approved` \| `rejected` |
| created_at          | TIMESTAMPTZ |

---

## 6. Leaderboard

**Endpoint:** `GET /leaderboard` → RPC **`get_leaderboard()`**

**Response:** Array of up to 100 entries, ordered by `total_distance` descending:

```json
[
  {
    "rank": 1,
    "user_id": "uuid",
    "username": "Runner One",
    "distance": 120.5,
    "is_current_user": false
  }
]
```

---

## 7. Dashboard (Achievements Screen)

**Endpoint:** `GET /dashboard` → RPC **`get_dashboard(p_user_id?)`**

**Response:**
```json
{
  "level": 7,
  "xp": 1240,
  "xp_next_level": 2000,
  "stats": {
    "total_distance": 532,
    "total_runs": 46,
    "total_calories": 18837
  },
  "medals": [...],
  "achievements": [...],
  "leaderboard": [...]
}
```

- `xp_next_level` = `(level + 1)² * 10` (XP required to reach next level).
- Powers the achievements tab in the app.

---

## Client Usage

When Supabase is configured, use the typed API in `services/api/gamification.api.ts`:

- `fetchUserStats(userId?)` → GET /user/stats
- `fetchLeaderboard()` → GET /leaderboard
- `fetchDashboard(userId?)` → GET /dashboard
- `insertWorkout(workout)` → INSERT workout (triggers XP + achievements)

If Supabase is not configured, these return `null`/`[]` and the app continues to use local storage services.

---

## Applying the Schema

Run the migration in your Supabase project:

```bash
supabase db push
# or paste contents of supabase/migrations/20250317000000_gamification.sql
# into Supabase SQL Editor and run.
```

Ensure `profiles` and `auth.users` exist; the migration creates `user_xp`, `workouts`, `achievements`, `user_achievements`, `medals`, triggers, RLS, and RPCs.
