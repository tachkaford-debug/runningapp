/**
 * Achievements Service — gamified progression system
 * All data stored locally in AsyncStorage.
 */
import { getItem, setItem } from '@/utils/storage';
import { authService } from './auth.service';
import { statsService } from './stats.service';
import { territoryService } from './territory.service';

// ── Types ────────────────────────────────────────────────────────────────────

export type AchievementCategory = 'distance' | 'consistency' | 'exploration' | 'speed';
export type AchievementRarity   = 'common' | 'rare' | 'epic' | 'legendary';

export interface Achievement {
  id: string;
  series: string;          // groups achievements into a progression chain
  level: number;           // 1–5 within the series
  title: string;
  description: string;
  icon: string;
  xp_reward: number;
  category: AchievementCategory;
  rarity: AchievementRarity;
  progress_target: number; // numeric goal
}

export interface UserAchievement {
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
}

export interface AchievementWithStatus extends Achievement {
  unlocked: boolean;
  unlocked_at: string | null;
  progress_current: number;
  progress_pct: number;    // 0–1
  locked: boolean;         // true if previous level not yet unlocked
}

// ── Catalogue ────────────────────────────────────────────────────────────────

export const ACHIEVEMENTS: Achievement[] = [
  // ── Distance series ──────────────────────────────────────────────────────
  { id: 'dist_1', series: 'distance', level: 1, title: 'Первый километр',   description: 'Пробегите 1 км суммарно',    icon: '👟', xp_reward: 30,   category: 'distance',    rarity: 'common'    , progress_target: 1    },
  { id: 'dist_2', series: 'distance', level: 2, title: '10 км суммарно',    description: 'Пробегите 10 км суммарно',   icon: '🎯', xp_reward: 75,   category: 'distance',    rarity: 'common'    , progress_target: 10   },
  { id: 'dist_3', series: 'distance', level: 3, title: '50 км суммарно',    description: 'Пробегите 50 км суммарно',   icon: '⭐', xp_reward: 200,  category: 'distance',    rarity: 'rare'      , progress_target: 50   },
  { id: 'dist_4', series: 'distance', level: 4, title: '200 км суммарно',   description: 'Пробегите 200 км суммарно',  icon: '🌍', xp_reward: 500,  category: 'distance',    rarity: 'epic'      , progress_target: 200  },
  { id: 'dist_5', series: 'distance', level: 5, title: '500 км суммарно',   description: 'Пробегите 500 км суммарно',  icon: '🚀', xp_reward: 1500, category: 'distance',    rarity: 'legendary' , progress_target: 500  },

  // ── Single run series ─────────────────────────────────────────────────────
  { id: 'run_1',  series: 'single',   level: 1, title: 'Первая пробежка',   description: 'Завершите первую тренировку',        icon: '🏃', xp_reward: 50,   category: 'distance',    rarity: 'common'    , progress_target: 1    },
  { id: 'run_2',  series: 'single',   level: 2, title: '5K Runner',         description: 'Пробегите 5 км за одну тренировку',  icon: '🎽', xp_reward: 100,  category: 'distance',    rarity: 'common'    , progress_target: 5    },
  { id: 'run_3',  series: 'single',   level: 3, title: '10K Runner',        description: 'Пробегите 10 км за одну тренировку', icon: '🏁', xp_reward: 200,  category: 'distance',    rarity: 'rare'      , progress_target: 10   },
  { id: 'run_4',  series: 'single',   level: 4, title: 'Полумарафон',       description: 'Пробегите 21.1 км за одну тренировку', icon: '🥈', xp_reward: 500, category: 'distance',   rarity: 'epic'      , progress_target: 21.1 },
  { id: 'run_5',  series: 'single',   level: 5, title: 'Марафонец',         description: 'Пробегите 42.2 км за одну тренировку', icon: '🥇', xp_reward: 1000, category: 'distance',  rarity: 'legendary' , progress_target: 42.2 },

  // ── Consistency (runs count) series ──────────────────────────────────────
  { id: 'cnt_1',  series: 'count',    level: 1, title: '5 тренировок',      description: 'Завершите 5 тренировок',    icon: '💪', xp_reward: 50,   category: 'consistency', rarity: 'common'    , progress_target: 5    },
  { id: 'cnt_2',  series: 'count',    level: 2, title: '10 тренировок',     description: 'Завершите 10 тренировок',   icon: '🏅', xp_reward: 100,  category: 'consistency', rarity: 'common'    , progress_target: 10   },
  { id: 'cnt_3',  series: 'count',    level: 3, title: '25 тренировок',     description: 'Завершите 25 тренировок',   icon: '🔑', xp_reward: 200,  category: 'consistency', rarity: 'rare'      , progress_target: 25   },
  { id: 'cnt_4',  series: 'count',    level: 4, title: '50 тренировок',     description: 'Завершите 50 тренировок',   icon: '🏆', xp_reward: 400,  category: 'consistency', rarity: 'epic'      , progress_target: 50   },
  { id: 'cnt_5',  series: 'count',    level: 5, title: 'Ветеран',           description: 'Завершите 100 тренировок',  icon: '💯', xp_reward: 1000, category: 'consistency', rarity: 'legendary' , progress_target: 100  },

  // ── Streak series ─────────────────────────────────────────────────────────
  { id: 'str_1',  series: 'streak',   level: 1, title: '3 дня подряд',      description: 'Бегайте 3 дня подряд',      icon: '🔥', xp_reward: 75,   category: 'consistency', rarity: 'common'    , progress_target: 3    },
  { id: 'str_2',  series: 'streak',   level: 2, title: 'Воин недели',       description: 'Бегайте 7 дней подряд',     icon: '⚡', xp_reward: 150,  category: 'consistency', rarity: 'rare'      , progress_target: 7    },
  { id: 'str_3',  series: 'streak',   level: 3, title: '2 недели подряд',   description: 'Бегайте 14 дней подряд',    icon: '🌊', xp_reward: 300,  category: 'consistency', rarity: 'rare'      , progress_target: 14   },
  { id: 'str_4',  series: 'streak',   level: 4, title: 'Месяц без остановки', description: 'Бегайте 30 дней подряд', icon: '🌟', xp_reward: 750,  category: 'consistency', rarity: 'epic'      , progress_target: 30   },
  { id: 'str_5',  series: 'streak',   level: 5, title: 'Легенда',           description: 'Бегайте 100 дней подряд',   icon: '👑', xp_reward: 2000, category: 'consistency', rarity: 'legendary' , progress_target: 100  },

  // ── Territory (cells) series ──────────────────────────────────────────────
  { id: 'ter_1',  series: 'territory', level: 1, title: 'Первая зона',      description: 'Захватите 1 зону',          icon: '📍', xp_reward: 30,   category: 'exploration', rarity: 'common'    , progress_target: 1    },
  { id: 'ter_2',  series: 'territory', level: 2, title: 'Исследователь',    description: 'Захватите 50 зон',          icon: '🗺️', xp_reward: 100,  category: 'exploration', rarity: 'common'    , progress_target: 50   },
  { id: 'ter_3',  series: 'territory', level: 3, title: 'Картограф',        description: 'Захватите 200 зон',         icon: '🧭', xp_reward: 300,  category: 'exploration', rarity: 'rare'      , progress_target: 200  },
  { id: 'ter_4',  series: 'territory', level: 4, title: 'Завоеватель',      description: 'Захватите 500 зон',         icon: '⚔️', xp_reward: 700,  category: 'exploration', rarity: 'epic'      , progress_target: 500  },
  { id: 'ter_5',  series: 'territory', level: 5, title: 'Властелин города', description: 'Захватите 2000 зон',        icon: '🏰', xp_reward: 2000, category: 'exploration', rarity: 'legendary' , progress_target: 2000 },
];

// ── Rarity colors (for UI) ────────────────────────────────────────────────────
export const RARITY_COLOR: Record<AchievementRarity, string> = {
  common:    '#888888',
  rare:      '#3B82F6',
  epic:      '#9333EA',
  legendary: '#F59E0B',
};

// ── Storage ───────────────────────────────────────────────────────────────────
const UA_KEY = 'user_achievements_v2';
const getUnlocked = async (): Promise<UserAchievement[]> =>
  (await getItem<UserAchievement[]>(UA_KEY)) ?? [];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the set of unlocked achievement ids for a user */
const unlockedSet = (all: UserAchievement[], userId: string): Set<string> =>
  new Set(all.filter(u => u.user_id === userId).map(u => u.achievement_id));

/** Group achievements by series, sorted by level */
const bySeries = (): Map<string, Achievement[]> => {
  const m = new Map<string, Achievement[]>();
  for (const a of ACHIEVEMENTS) {
    if (!m.has(a.series)) m.set(a.series, []);
    m.get(a.series)!.push(a);
  }
  for (const arr of m.values()) arr.sort((a, b) => a.level - b.level);
  return m;
};

// ── Service ───────────────────────────────────────────────────────────────────
export const achievementsService = {

  async getUserAchievements(): Promise<AchievementWithStatus[]> {
    const user   = await authService.getCurrentUser();
    const userId = user?.id ?? 'anonymous';
    const [unlocked, stats] = await Promise.all([getUnlocked(), statsService.getUserStats()]);
    const ids = unlockedSet(unlocked, userId);

    // territory cells count
    let totalCells = 0;
    try {
      const cells = await territoryService.getUserCells(userId);
      totalCells = cells.length;
    } catch {}

    const getValue = (a: Achievement): number => {
      switch (a.series) {
        case 'distance':  return stats.total_distance;
        case 'single':    return a.level === 1 ? stats.total_runs : stats.best_distance;
        case 'count':     return stats.total_runs;
        case 'streak':    return stats.current_streak;
        case 'territory': return totalCells;
        default:          return 0;
      }
    };

    const seriesMap = bySeries();
    const result: AchievementWithStatus[] = [];

    for (const [, chain] of seriesMap) {
      for (let i = 0; i < chain.length; i++) {
        const a = chain[i];
        const ua = unlocked.find(u => u.user_id === userId && u.achievement_id === a.id);
        const prevUnlocked = i === 0 || ids.has(chain[i - 1].id);
        const current = getValue(a);
        result.push({
          ...a,
          unlocked: ids.has(a.id),
          unlocked_at: ua?.unlocked_at ?? null,
          progress_current: Math.min(current, a.progress_target),
          progress_pct: Math.min(current / a.progress_target, 1),
          locked: !prevUnlocked,
        });
      }
    }

    return result;
  },

  async checkAndUnlock(): Promise<Achievement[]> {
    const user   = await authService.getCurrentUser();
    const userId = user?.id ?? 'anonymous';
    const [allUnlocked, stats] = await Promise.all([getUnlocked(), statsService.getUserStats()]);
    const ids = unlockedSet(allUnlocked, userId);

    let totalCells = 0;
    try {
      const cells = await territoryService.getUserCells(userId);
      totalCells = cells.length;
    } catch {}

    const getValue = (a: Achievement): number => {
      switch (a.series) {
        case 'distance':  return stats.total_distance;
        case 'single':    return a.level === 1 ? stats.total_runs : stats.best_distance;
        case 'count':     return stats.total_runs;
        case 'streak':    return stats.current_streak;
        case 'territory': return totalCells;
        default:          return 0;
      }
    };

    const seriesMap = bySeries();
    const newlyUnlocked: Achievement[] = [];

    for (const [, chain] of seriesMap) {
      for (let i = 0; i < chain.length; i++) {
        const a = chain[i];
        if (ids.has(a.id)) continue;
        // series gate: previous level must be unlocked first
        if (i > 0 && !ids.has(chain[i - 1].id)) break;
        if (getValue(a) >= a.progress_target) {
          allUnlocked.push({ user_id: userId, achievement_id: a.id, unlocked_at: new Date().toISOString() });
          ids.add(a.id);
          newlyUnlocked.push(a);
        }
      }
    }

    if (newlyUnlocked.length > 0) await setItem(UA_KEY, allUnlocked);
    return newlyUnlocked;
  },
};
