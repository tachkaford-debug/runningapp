# App System Reference

## 1. App Overview
Offline-first running app. Black `#0D0D0D` + neon lime `#C8FF00`. No Supabase — all data in AsyncStorage.

## 2. Core Entities
- `Workout` — distance, duration, pace, calories, gps_track, day_of_week
- `GridCell` — lat_index, lng_index, owner, capture_count, cell_type
- `User` — stored via authService / AsyncStorage. Fields: id (UUID), numeric_id (1000+), email, full_name, created_at

## 3. Running Logic
Countdown 3→2→1→GO → GPS collected every 5s. Hold pause button 1.8s to end. Min distance 100m to save.
Start button: large centered button (paddingVertical 26, maxWidth 480, fontSize 22).

## 4. Territory System

**Grid cells**
The map is divided into a fixed grid. Each cell is `CELL_SIZE = 0.00045°` (~50m × 50m). A cell is identified by `lat_index = floor(lat / CELL_SIZE)` and `lng_index = floor(lng / CELL_SIZE)`. Stored in AsyncStorage under `grid_cells` as a flat key-value map (`"lat_lng" → GridCell`).

**Capture logic**
After a run ends, the full GPS track is batch-processed. Points closer than 10m to the previous point are dropped. Each remaining point is converted to a grid cell. Duplicate cells within the same workout are deduplicated. Each cell increments `capture_count` and records `last_captured_date`.

**Cell types** (assigned once on first capture, deterministic hash):
- `normal` — default
- `park` — appears in spatial clusters (8×8 cell blocks)
- `water` — sparse, ~8% of cells
- `rare` — higher probability near grid center; grants +5 XP bonus

**Merge logic**
For rendering, captured cells are merged to reduce polygon count. A BFS flood-fill groups adjacent cells (4-directional) into connected components. Each component is rendered as a single bounding-box polygon. New cells are always rendered; old cells are capped at 120, sorted by `capture_count` descending.

## 5. XP System

**XP rules** (per workout, computed in `territoryService.processWorkoutTerritory`):
- New cell captured: +3 XP
- Cell revisited (not today): +1 XP
- Rare cell bonus (on top of new/revisit): +5 XP
- Distance bonus (in `workoutService`): +10 XP per km

**Daily limit**
Each cell is tracked in `daily_cells` (resets at midnight). If a cell was already visited today: 0 XP, but district progress still counts.

**Milestone bonuses**
Thresholds: 5 → 10 → 20 → 50 → 100 → 200 → 500 → 1000. Each hit: +10 XP. Multiple milestones can trigger in one run.

## 6. District System
50×50 cell grid (~2.5km²) per district. Human-readable names (directional + terrain). Tracks % explored per user.

## 7. Post-Run UX
4 steps: loading → route draw → territory fade-in → stats. Hero element: `+N` new zones at fontSize 72.


## 8. GPS & Map

- Provider: Google Maps (react-native-maps)
- Accuracy: `Location.Accuracy.BestForNavigation`, timeInterval 2000ms, distanceInterval 5m
- GPS timeout: 8s — after timeout UI unblocks with `gpsWarning=true`
- GPS badges (start screen):
  - Loading: "⌖ Определяем местоположение... Xм"
  - Weak signal: "⚠ Слабый сигнал GPS · Xм" (orange border)
  - Good: "✓ Точность: Xм" (lime border `#C8FF00`)
- Last known location loaded from AsyncStorage on mount (`last_known_location`)
- iOS: checks `accuracyAuthorization`, alerts if reduced precision
- Auto-follow camera: disabled on map interaction, re-enabled after 5s idle
- "● следование отключено" badge shown when auto-follow is off

## 9. Route Visualization

- Shadow polyline: width 9, black
- Body polyline: width 5, `#C8FF00` at 55% opacity
- Tail (last 15 points): width 6, `#C8FF00` bright
- Position marker: glow ring r=12 + solid dot r=6
- Interpolation: 5 interpolated points per GPS fix, drained 2pts/50ms into coords
- Coords capped at 1000 points

## 10. Pause Screen

- Screen state: `'paused'`
- Shows stats grid (km, time, pace, kcal)
- "Продолжить" button (accent) + "Завершить" button (secondary)
- Wrapped in `pausedSheet` card with padding and rounded corners

## 11. Auth System

- Local only — no Supabase
- `authService` in `services/auth.service.ts`
- `LocalUser`: id (UUID), numeric_id (starts 1000, increments), email, full_name, created_at
- Guest fallback: numeric_id=0, uses deviceUserService UUID
- Storage keys: `local_users`, `local_session`, `numeric_id_counter`
- After signup → auto-login → redirect to `/(tabs)/profile`

## 12. Profile Screen

- File: `app/(tabs)/profile.tsx`
- Header: avatar initials + name row + FREE badge below name
- Name row: name on left, `ID: #1234` badge on right (tappable → copies to clipboard)
- ID display: numeric_id for registered users, first 8 chars of UUID for guests
- Uses `expo-clipboard` (`setStringAsync`)
- Sections: Профиль бегуна, Подписка, Устройства, Конфиденциальность, Поддержка

## 13. Workout Storage

- File: `services/workout.service.ts`
- Fields: id, user_id, distance_km, duration_seconds, calories, avg_pace, created_at, day_of_week, gps_track
- `day_of_week`: 0=Sun … 6=Sat, set from `new Date().getDay()` on save
- user_id fallback: `deviceUserService.getUserId()` (never `'anonymous'`)
- Calories formula: `distance_km × weight_kg × 1.036` (weight loaded from `user_profile` in AsyncStorage, default 70kg)

## 14. Achievements System

- File: `services/achievements.service.ts`
- 25 achievements across 5 series: distance, single, count, streak, territory
- Each series has 5 levels (series gate: prev level must unlock first)
- Rarities: common / rare / epic / legendary
- Storage key: `user_achievements_v2`
- UI groups by rarity with Russian section headers: Обычные / Редкие / Эпические / Легендарные
- Rarity colors exported as `RARITY_COLOR`

## 15. Achievements Screen ("Витрина достижений")

- File: `app/(tabs)/achievements.tsx`
- Header: page title + level block (pentagon with run count + XP bar)
- 2×2 grid cards: Пробежки, Мои медали, Лидерборд, Ачивки
- Лидерборд card → navigates to `/(tabs)/leaderboard`
- Bottom sheets: runs list, medals form+list, achievements grouped by rarity
- No opacity dimming on achievement rows

## 16. Navigation

- Tab navigator: `swipeEnabled: false` (prevents accidental screen switches during map interaction)
- Tabs: profile (settings icon), run (play button), achievements (trophy icon)
- Leaderboard tab hidden (`href: null`) — accessible via achievements screen
- Panel and segments screens open via HUD buttons (⚙ and 📊), not swipe
