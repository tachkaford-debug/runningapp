
// Временная заглушка для работы без Supabase
// Когда настроите Supabase, раскомментируйте код ниже

/*
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
*/

// Заглушка для работы без Supabase
export const supabase = {
  auth: {
    signUp: async () => ({ data: null, error: new Error('Supabase not configured') }),
    signInWithPassword: async () => ({ data: null, error: new Error('Supabase not configured') }),
    signOut: async () => ({ error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    resetPasswordForEmail: async () => ({ error: null }),
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            single: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
    insert: () => ({
      select: () => ({
        single: async () => ({ data: null, error: null }),
      }),
    }),
  }),
};

// Типы для базы данных
export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  level: number;
  total_xp: number;
  created_at: string;
  updated_at: string;
}

export interface Workout {
  id: string;
  user_id: string;
  distance: number;
  duration: number;
  avg_pace: number | null;
  avg_speed: number | null;
  calories: number | null;
  route: Array<{ lat: number; lng: number; timestamp: number }> | null;
  started_at: string;
  finished_at: string;
  created_at: string;
}

export interface UserStats {
  user_id: string;
  total_distance: number;
  total_duration: number;
  total_workouts: number;
  best_pace: number | null;
  best_distance: number | null;
  longest_duration: number | null;
  current_streak: number;
  longest_streak: number;
  last_workout_date: string | null;
  updated_at: string;
}

export interface AchievementTemplate {
  id: string;
  code: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  requirement: any;
  xp_reward: number;
  created_at: string;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
  achievement?: AchievementTemplate;
}
