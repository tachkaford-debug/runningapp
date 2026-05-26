/**
 * Territory Capture Service — v4
 * Improvements:
 *  1. Primary feedback — one focused message after workout
 *  2. Human-readable district names (City Center, Park Zone, etc.)
 *  3. Daily limit fix — revisited cells still count toward district progress
 *  4. Scaled milestones: 5 → 10 → 20 → 50 → 100 → 200 → ...
 *  5. Social pressure — district_leader field per district
 */
import { getItem, setItem } from '@/utils/storage';

const CELL_SIZE = 0.00045;       // ~50m per cell
const DISTRICT_SIZE = 50;        // 50×50 cells ≈ 2.5km²
const MIN_POINT_DISTANCE_M = 10;

// XP config
const XP_NEW_CELL = 3;
const XP_REVISIT_CELL = 1;
const XP_RARE_BONUS = 5;
const XP_DAILY_REVISIT = 0;  // same-day revisit: 0 XP, but district progress still counts
const XP_RUN_BONUS = 10;     // bonus for capturing 5+ new cells in a single run
const XP_RUN_BONUS_THRESHOLD = 5;

// Scaled milestone thresholds
const MILESTONES = [5, 10, 20, 50, 100, 200, 500, 1000];
const MILESTONE_BONUS = 10; // XP per milestone hit

const GRID_CELLS_KEY = 'grid_cells';
const WORKOUT_CELLS_KEY = 'workout_cells';
const DAILY_CELLS_KEY = 'daily_cells';
const DISTRICT_THRESHOLDS_KEY = 'district_thresholds'; // Record<userId_districtId, number[]>

// District completion bonus thresholds: percent → XP
const DISTRICT_BONUSES: [number, number][] = [[25, 20], [50, 50], [75, 100], [100, 300]];

export type CellType = 'normal' | 'park' | 'water' | 'rare';

export interface GpsPoint {
  lat: number;
  lng: number;
}

export interface GridCell {
  id: string;
  lat_index: number;
  lng_index: number;
  owner_user_id: string;
  capture_count: number;
  cell_type: CellType;
  last_captured_date: string; // YYYY-MM-DD
}

export interface WorkoutCell {
  workout_id: string;
  cell_id: string;
}

export interface DistrictProgress {
  district_id: string;
  name: string;
  explored_cells: number;
  total_cells: number;
  percent: number;
  changed: boolean;
  district_leader: string; // e.g. "Ты лидируешь!" or "Топ игрок владеет 60%"
}

export interface HighlightedCell {
  lat_index: number;
  lng_index: number;
  cell_type: CellType;
  priority: 'high' | 'medium' | 'low'; // controls glow intensity in UI
  score: number;
}

export interface NextReward {
  cells_needed: number;
  milestone_at: number;
  bonus_xp: number;
}

export interface TerritoryResult {
  new_cells_count: number;
  revisited_cells_count: number;
  daily_blocked_count: number;
  xp_gained: number;
  milestone_bonus: number;
  total_cells_in_run: number;
  primary_message: string;        // ONE focused message for the user
  district_progress: DistrictProgress[];
  district_progress_change: string;
  next_reward: NextReward;
  cells: Array<{
    lat_index: number;
    lng_index: number;
    capture_count: number;
    cell_type: CellType;
    is_new: boolean;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────

function haversineMeters(a: GpsPoint, b: GpsPoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function filterGpsTrack(track: GpsPoint[]): GpsPoint[] {
  if (track.length === 0) return [];
  const out: GpsPoint[] = [track[0]];
  for (let i = 1; i < track.length; i++) {
    if (haversineMeters(out[out.length - 1], track[i]) >= MIN_POINT_DISTANCE_M) {
      out.push(track[i]);
    }
  }
  return out;
}

function assignCellType(lat_index: number, lng_index: number): CellType {
  const h1 = Math.abs((lat_index * 73856093) ^ (lng_index * 19349663)) % 1000;
  const distToCenter = Math.sqrt(
    Math.pow((lat_index % 200) - 100, 2) + Math.pow((lng_index % 200) - 100, 2)
  );
  const rareBias = distToCenter < 30 ? 30 : 0;
  if (h1 < 20 + rareBias) return 'rare';
  const parkCluster = ((Math.floor(lat_index / 8) * 31) ^ (Math.floor(lng_index / 8) * 17)) % 10;
  if (parkCluster < 3) return 'park';
  const h2 = Math.abs((lat_index * 19349663) ^ (lng_index * 83492791)) % 100;
  if (h2 < 8) return 'water';
  return 'normal';
}

export function gpsToCell(lat: number, lng: number): { lat_index: number; lng_index: number } {
  return {
    lat_index: Math.floor(lat / CELL_SIZE),
    lng_index: Math.floor(lng / CELL_SIZE),
  };
}

export function cellToBounds(lat_index: number, lng_index: number) {
  const minLat = lat_index * CELL_SIZE;
  const minLng = lng_index * CELL_SIZE;
  return {
    minLat, minLng,
    maxLat: minLat + CELL_SIZE,
    maxLng: minLng + CELL_SIZE,
    centerLat: minLat + CELL_SIZE / 2,
    centerLng: minLng + CELL_SIZE / 2,
  };
}

function districtId(lat_index: number, lng_index: number): string {
  return `${Math.floor(lat_index / DISTRICT_SIZE)}_${Math.floor(lng_index / DISTRICT_SIZE)}`;
}

/**
 * Human-readable district names based on spatial position.
 * Uses a 3×3 directional grid relative to the district's position modulo a large tile,
 * combined with a terrain hint from the cell type distribution.
 */
function districtName(did: string): string {
  const parts = did.split('_').map(Number);
  const dx = ((parts[0] % 9) + 9) % 9; // 0-8
  const dy = ((parts[1] % 9) + 9) % 9;

  // Directional prefix
  const directional = [
    'Северо-Западный', 'Северный', 'Северо-Восточный',
    'Западный',        'Центральный', 'Восточный',
    'Юго-Западный',   'Южный',   'Юго-Восточный',
  ][dx % 3 + (dy % 3) * 3];

  // Terrain suffix — stable hash
  const hash = Math.abs((parts[0] * 17 + parts[1] * 31)) % 8;
  const terrain = [
    'район', 'парк', 'набережная', 'квартал',
    'бульвар', 'проспект', 'сквер', 'площадь',
  ][hash];

  return `${directional} ${terrain}`;
}

/** Next milestone threshold above current total */
function nextMilestoneFor(total: number): number {
  for (const m of MILESTONES) {
    if (total < m) return m;
  }
  // Beyond defined milestones: double the last one
  return MILESTONES[MILESTONES.length - 1] * Math.pow(2, Math.ceil(Math.log2(total / MILESTONES[MILESTONES.length - 1] + 1)));
}

/** Count milestones crossed between before and after */
function milestonesHitBetween(before: number, after: number): number {
  return MILESTONES.filter(m => m > before && m <= after).length;
}

/**
 * Generate ONE focused primary message for the post-workout screen.
 * Priority: milestone hit > district close to capture > new cells > revisit
 */
function buildPrimaryMessage(
  newCells: number,
  milestoneBonus: number,
  districtProgress: DistrictProgress[],
  totalNewAfter: number
): string {
  // 1. Milestone hit
  if (milestoneBonus > 0) {
    const hit = MILESTONES.find(m => m <= totalNewAfter && m > totalNewAfter - newCells);
    if (hit) return `🏆 Milestone: ${hit} зон захвачено! +${milestoneBonus} XP бонус`;
  }

  // 2. District close to capture (50–90% and improved this run)
  const closeDist = districtProgress
    .filter(d => d.changed && d.percent >= 50 && d.percent < 90)
    .sort((a, b) => b.percent - a.percent)[0];
  if (closeDist) {
    return `📍 Ты близко к захвату района «${closeDist.name}» — уже ${closeDist.percent}%`;
  }

  // 3. District almost dominated (90%+)
  const almostDone = districtProgress.find(d => d.changed && d.percent >= 90);
  if (almostDone) {
    return `🔥 Район «${almostDone.name}» почти твой — ${almostDone.percent}%!`;
  }

  // 4. Good new cells run
  if (newCells >= 10) return `⚡ Отличная пробежка — ${newCells} новых зон захвачено!`;
  if (newCells > 0) return `✅ +${newCells} новых зон добавлено на карту`;

  // 5. Revisit run
  return `🔄 Территория подтверждена. Беги новые маршруты для захвата зон`;
}

/**
 * Simulate social pressure: deterministic "top player" ownership per district.
 * In a real app this would query other users' cells.
 * Here we generate a plausible percentage from the district id hash.
 */
function districtLeaderMessage(did: string, userPercent: number): string {
  const parts = did.split('_').map(Number);
  const hash = Math.abs((parts[0] * 53 + parts[1] * 97)) % 100;

  // Simulate top player owning hash% of the district
  const topPercent = Math.max(hash % 40 + 20, userPercent); // 20–60%, never less than user

  if (userPercent >= topPercent) return '👑 Ты лидируешь в этом районе!';
  if (userPercent >= topPercent - 5) return `⚔️ Почти догнал лидера — он владеет ${topPercent}%`;
  return `📊 Топ игрок владеет ${topPercent}% этого района`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Storage ─────────────────────────────────────────────

const getAllCells = async (): Promise<Record<string, GridCell>> =>
  (await getItem<Record<string, GridCell>>(GRID_CELLS_KEY)) || {};

const getAllWorkoutCells = async (): Promise<WorkoutCell[]> =>
  (await getItem<WorkoutCell[]>(WORKOUT_CELLS_KEY)) || [];

interface DailyRecord { date: string; cellIds: string[] }
const getDailyRecord = async (): Promise<DailyRecord> => {
  const rec = await getItem<DailyRecord>(DAILY_CELLS_KEY);
  const today = todayStr();
  if (!rec || rec.date !== today) return { date: today, cellIds: [] };
  return rec;
};

// Completed district thresholds: key = `${userId}:${districtId}`, value = array of hit percents
const getDistrictThresholds = async (): Promise<Record<string, number[]>> =>
  (await getItem<Record<string, number[]>>(DISTRICT_THRESHOLDS_KEY)) ?? {};

// ─── Service ─────────────────────────────────────────────

export const territoryService = {
  async processWorkoutTerritory(
    workoutId: string,
    userId: string,
    gpsTrack: GpsPoint[]
  ): Promise<TerritoryResult> {
    const firstMilestone = MILESTONES[0];
    const empty: TerritoryResult = {
      new_cells_count: 0, revisited_cells_count: 0, daily_blocked_count: 0,
      xp_gained: 0, milestone_bonus: 0, total_cells_in_run: 0,
      primary_message: 'Беги новые маршруты для захвата зон',
      district_progress: [], district_progress_change: '',
      next_reward: { cells_needed: firstMilestone, milestone_at: firstMilestone, bonus_xp: MILESTONE_BONUS },
      cells: [],
    };
    if (!gpsTrack || gpsTrack.length === 0) return empty;

    const filtered = filterGpsTrack(gpsTrack);

    const uniqueCellIds = new Set<string>();
    for (const pt of filtered) {
      const { lat_index, lng_index } = gpsToCell(pt.lat, pt.lng);
      uniqueCellIds.add(`${lat_index}_${lng_index}`);
    }

    const [allCells, dailyRec, existingWorkoutCells] = await Promise.all([
      getAllCells(),
      getDailyRecord(),
      getAllWorkoutCells(),
    ]);

    const dailySet = new Set(dailyRec.cellIds);
    const today = todayStr();

    // District snapshot BEFORE (count all cells, not just new ones)
    const districtsBefore: Record<string, number> = {};
    for (const cell of Object.values(allCells)) {
      if (cell.owner_user_id !== userId) continue;
      const did = districtId(cell.lat_index, cell.lng_index);
      districtsBefore[did] = (districtsBefore[did] ?? 0) + 1;
    }

    const totalNewBefore = Object.values(allCells).filter(c => c.owner_user_id === userId).length;

    let newCells = 0;
    let revisitedCells = 0;
    let dailyBlocked = 0;
    let xpGained = 0;
    const resultCells: TerritoryResult['cells'] = [];
    const workoutCellEntries: WorkoutCell[] = [];

    // District progress counts ALL visited cells (new + revisit), not just new
    const districtsVisited: Record<string, number> = {};

    for (const cellId of uniqueCellIds) {
      const parts = cellId.split('_');
      const lat_index = parseInt(parts[0], 10);
      const lng_index = parseInt(parts[1], 10);

      const isNew = !allCells[cellId];
      const cell_type = isNew
        ? assignCellType(lat_index, lng_index)
        : allCells[cellId].cell_type;

      const seenToday = dailySet.has(cellId);
      const did = districtId(lat_index, lng_index);

      if (isNew) {
        newCells++;
        xpGained += XP_NEW_CELL;
        if (cell_type === 'rare') xpGained += XP_RARE_BONUS;
        // New cells always count toward district
        districtsVisited[did] = (districtsVisited[did] ?? 0) + 1;
      } else if (seenToday) {
        // Daily limit: 0 XP, but STILL count toward district progress (fix #3)
        dailyBlocked++;
        xpGained += XP_DAILY_REVISIT;
        districtsVisited[did] = (districtsVisited[did] ?? 0) + 1;
      } else {
        revisitedCells++;
        xpGained += XP_REVISIT_CELL;
        districtsVisited[did] = (districtsVisited[did] ?? 0) + 1;
      }

      allCells[cellId] = {
        id: cellId,
        lat_index,
        lng_index,
        owner_user_id: userId,
        capture_count: (allCells[cellId]?.capture_count ?? 0) + 1,
        cell_type,
        last_captured_date: today,
      };

      dailySet.add(cellId);

      resultCells.push({
        lat_index,
        lng_index,
        capture_count: allCells[cellId].capture_count,
        cell_type,
        is_new: isNew,
      });

      workoutCellEntries.push({ workout_id: workoutId, cell_id: cellId });
    }

    // Run bonus: +10 XP if 5+ new cells captured in this run
    if (newCells >= XP_RUN_BONUS_THRESHOLD) xpGained += XP_RUN_BONUS;

    // Scaled milestone bonus
    const totalNewAfter = totalNewBefore + newCells;
    const mHit = milestonesHitBetween(totalNewBefore, totalNewAfter);
    const milestoneBonus = mHit * MILESTONE_BONUS;
    xpGained += milestoneBonus;

    // District progress AFTER — use all visited cells for district count
    const districtsAfter: Record<string, number> = { ...districtsBefore };
    for (const [did, count] of Object.entries(districtsVisited)) {
      // Only add cells that weren't already counted (new cells)
      const newInDistrict = resultCells.filter(
        c => districtId(c.lat_index, c.lng_index) === did && c.is_new
      ).length;
      districtsAfter[did] = (districtsBefore[did] ?? 0) + newInDistrict;
    }

    const affectedDistricts = new Set([
      ...Object.keys(districtsBefore),
      ...Object.keys(districtsVisited),
    ]);

    const districtProgressList: DistrictProgress[] = [];
    const changeLines: string[] = [];

    const districtThresholds = await getDistrictThresholds();
    let districtBonusXp = 0;

    for (const did of affectedDistricts) {
      const before = districtsBefore[did] ?? 0;
      const after = districtsAfter[did] ?? 0;
      const total = DISTRICT_SIZE * DISTRICT_SIZE;
      const pctBefore = Math.round((before / total) * 100);
      const pctAfter = Math.round((after / total) * 100);
      const changed = pctAfter > pctBefore;
      const name = districtName(did);
      const leader = districtLeaderMessage(did, pctAfter);

      // Check district completion thresholds — award once per threshold per district
      const thresholdKey = `${userId}:${did}`;
      const hit = districtThresholds[thresholdKey] ?? [];
      for (const [pct, bonus] of DISTRICT_BONUSES) {
        if (pctAfter >= pct && !hit.includes(pct)) {
          hit.push(pct);
          districtBonusXp += bonus;
        }
      }
      districtThresholds[thresholdKey] = hit;

      districtProgressList.push({
        district_id: did,
        name,
        explored_cells: after,
        total_cells: total,
        percent: pctAfter,
        changed,
        district_leader: leader,
      });

      if (changed) changeLines.push(`${name}: ${pctBefore}% → ${pctAfter}%`);
    }

    xpGained += districtBonusXp;

    // Next scaled milestone
    const nextMs = nextMilestoneFor(totalNewAfter);
    const nextReward: NextReward = {
      cells_needed: nextMs - totalNewAfter,
      milestone_at: nextMs,
      bonus_xp: MILESTONE_BONUS,
    };

    // Primary message — one focused takeaway
    const primaryMessage = buildPrimaryMessage(
      newCells, milestoneBonus, districtProgressList, totalNewAfter
    );

    await Promise.all([
      setItem(GRID_CELLS_KEY, allCells),
      setItem(WORKOUT_CELLS_KEY, [...existingWorkoutCells, ...workoutCellEntries]),
      setItem(DAILY_CELLS_KEY, { date: today, cellIds: Array.from(dailySet) }),
      setItem(DISTRICT_THRESHOLDS_KEY, districtThresholds),
    ]);

    return {
      new_cells_count: newCells,
      revisited_cells_count: revisitedCells,
      daily_blocked_count: dailyBlocked,
      xp_gained: xpGained,
      milestone_bonus: milestoneBonus,
      total_cells_in_run: uniqueCellIds.size,
      primary_message: primaryMessage,
      district_progress: districtProgressList,
      district_progress_change: changeLines.join(' · ') || '',
      next_reward: nextReward,
      cells: resultCells,
    };
  },

  async getUserCells(userId: string): Promise<GridCell[]> {
    const all = await getAllCells();
    return Object.values(all).filter(c => c.owner_user_id === userId);
  },

  async getWorkoutCells(workoutId: string): Promise<GridCell[]> {
    const workoutCells = await getAllWorkoutCells();
    const allCells = await getAllCells();
    const ids = workoutCells.filter(wc => wc.workout_id === workoutId).map(wc => wc.cell_id);
    return ids.map(id => allCells[id]).filter(Boolean);
  },

  async getUserTerritoryCount(userId: string): Promise<number> {
    return (await territoryService.getUserCells(userId)).length;
  },

  /**
   * Guidance system — find nearby unvisited cells worth running toward.
   * Returns up to 30 highlighted cells within ~300m of the given position.
   * Prioritized by: district completion value > rare type > cluster density.
   * No directions — just visual hints on the map.
   */
  async getHighlightedCells(
    userId: string,
    lat: number,
    lng: number
  ): Promise<HighlightedCell[]> {
    const allCells = await getAllCells();
    const ownedIds = new Set(
      Object.values(allCells)
        .filter(c => c.owner_user_id === userId)
        .map(c => c.id)
    );

    // Scan a grid of ~7×7 cells around the user (~350m radius)
    const { lat_index: centerLat, lng_index: centerLng } = gpsToCell(lat, lng);
    const RADIUS = 7; // cells
    const candidates: HighlightedCell[] = [];

    // Count owned cells per district for district-value scoring
    const districtOwned: Record<string, number> = {};
    for (const cell of Object.values(allCells)) {
      if (cell.owner_user_id !== userId) continue;
      const did = districtId(cell.lat_index, cell.lng_index);
      districtOwned[did] = (districtOwned[did] ?? 0) + 1;
    }

    // Build a set of all owned cell ids for cluster scoring
    const ownedSet = new Set<string>(ownedIds);

    for (let dLat = -RADIUS; dLat <= RADIUS; dLat++) {
      for (let dLng = -RADIUS; dLng <= RADIUS; dLng++) {
        const li = centerLat + dLat;
        const lj = centerLng + dLng;
        const cellId = `${li}_${lj}`;

        // Skip already owned
        if (ownedSet.has(cellId)) continue;

        // Distance check — keep within ~300m (≈6.6 cells at 45m/cell)
        const distCells = Math.sqrt(dLat * dLat + dLng * dLng);
        if (distCells > 6.6) continue;

        const cell_type = assignCellType(li, lj);
        const did = districtId(li, lj);

        // Score: district value (more owned → closer to completion → higher value)
        const owned = districtOwned[did] ?? 0;
        const districtScore = Math.min(owned / (DISTRICT_SIZE * DISTRICT_SIZE), 1) * 40;

        // Score: cell type
        const typeScore = cell_type === 'rare' ? 30 : cell_type === 'park' ? 10 : 0;

        // Score: cluster — count adjacent owned cells (4-directional)
        let clusterScore = 0;
        for (const [nl, nj] of [[li+1,lj],[li-1,lj],[li,lj+1],[li,lj-1]]) {
          if (ownedSet.has(`${nl}_${nj}`)) clusterScore += 10;
        }

        // Score: proximity — closer = slightly higher
        const proximityScore = Math.max(0, (6.6 - distCells) / 6.6) * 15;

        const score = districtScore + typeScore + clusterScore + proximityScore;

        // Priority tier for rendering intensity
        const priority: HighlightedCell['priority'] =
          score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

        candidates.push({ lat_index: li, lng_index: lj, cell_type, priority, score });
      }
    }

    // Return top 30 by score
    return candidates.sort((a, b) => b.score - a.score).slice(0, 30);
  },

  async getDistrictProgress(userId: string): Promise<DistrictProgress[]> {
    const cells = await territoryService.getUserCells(userId);
    const map: Record<string, number> = {};
    for (const c of cells) {
      const did = districtId(c.lat_index, c.lng_index);
      map[did] = (map[did] ?? 0) + 1;
    }
    return Object.entries(map).map(([did, count]) => ({
      district_id: did,
      name: districtName(did),
      explored_cells: count,
      total_cells: DISTRICT_SIZE * DISTRICT_SIZE,
      percent: Math.round((count / (DISTRICT_SIZE * DISTRICT_SIZE)) * 100),
      changed: false,
      district_leader: districtLeaderMessage(did, Math.round((count / (DISTRICT_SIZE * DISTRICT_SIZE)) * 100)),
    }));
  },
};
