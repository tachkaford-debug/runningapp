-- Supabase Database Schema для FitnessApp

-- Таблица профилей пользователей (расширяет auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  level INTEGER DEFAULT 1,
  total_xp INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица тренировок
CREATE TABLE workouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  distance_km FLOAT NOT NULL,        -- kilometres
  duration_seconds INTEGER NOT NULL, -- seconds
  calories INTEGER NOT NULL DEFAULT 0,
  avg_pace FLOAT NOT NULL DEFAULT 0, -- min/km
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- GET /leaderboard — top 100 users by total distance
-- Rebuilt as a materialized snapshot after every workout insert.
CREATE TABLE leaderboard_snapshot (
  rank          INTEGER NOT NULL,
  user_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  username      TEXT NOT NULL,
  distance      FLOAT NOT NULL,   -- km, rounded to 1 decimal
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id)
);

CREATE INDEX idx_leaderboard_rank ON leaderboard_snapshot(rank);

-- Function: rebuild leaderboard (called by trigger after workout insert)
CREATE OR REPLACE FUNCTION rebuild_leaderboard()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM leaderboard_snapshot;
  INSERT INTO leaderboard_snapshot (rank, user_id, username, distance, updated_at)
  SELECT
    ROW_NUMBER() OVER (ORDER BY SUM(w.distance_km) DESC) AS rank,
    p.id AS user_id,
    COALESCE(p.full_name, p.username, p.id::text) AS username,
    ROUND(SUM(w.distance_km)::numeric, 1) AS distance,
    NOW()
  FROM workouts w
  JOIN profiles p ON p.id = w.user_id
  GROUP BY p.id, p.full_name, p.username
  ORDER BY distance DESC
  LIMIT 100;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_rebuild_leaderboard
AFTER INSERT ON workouts
FOR EACH STATEMENT
EXECUTE FUNCTION rebuild_leaderboard();

-- Таблица медалей с реальных соревнований
-- POST /medals/add  →  INSERT INTO medals
-- GET  /user/medals →  SELECT * FROM medals WHERE user_id = $1
CREATE TABLE medals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  place TEXT NOT NULL,                -- '1st', 'Top 10', 'Finisher', etc.
  event_date DATE NOT NULL,
  proof_image_url TEXT,               -- uploaded photo of the medal/bib
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_medals_user_id ON medals(user_id);
CREATE INDEX idx_medals_status  ON medals(verification_status);

-- RLS
ALTER TABLE medals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own medals"   ON medals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own medals" ON medals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own medals" ON medals FOR DELETE USING (auth.uid() = user_id);
-- Admins approve/reject via service role key (bypasses RLS)

-- Таблица достижений
CREATE TABLE achievements (
  id TEXT PRIMARY KEY,               -- matches ACHIEVEMENTS[].id in code
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,                -- emoji
  xp_reward INTEGER NOT NULL DEFAULT 0
);

-- Таблица полученных достижений пользователей
CREATE TABLE user_achievements (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id TEXT REFERENCES achievements(id),
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

-- GET /user/achievements — join view
CREATE OR REPLACE VIEW user_achievements_view AS
SELECT
  ua.user_id,
  a.id,
  a.title,
  a.description,
  a.icon,
  a.xp_reward,
  ua.unlocked_at
FROM user_achievements ua
JOIN achievements a ON a.id = ua.achievement_id;

-- Seed achievements catalogue
INSERT INTO achievements (id, title, description, icon, xp_reward) VALUES
('first_run',   'Первый шаг',          'Завершите первую тренировку',              '🏃', 50),
('run_10km',    '10 км суммарно',       'Пробегите 10 км суммарно',                '🎯', 100),
('run_50km',    '50 км суммарно',       'Пробегите 50 км суммарно',                '⭐', 250),
('run_100km',   '100 км суммарно',      'Пробегите 100 км суммарно',               '🌍', 500),
('run_500km',   '500 км суммарно',      'Пробегите 500 км суммарно',               '🚀', 1000),
('runs_5',      '5 тренировок',         'Завершите 5 тренировок',                  '💪', 75),
('runs_10',     '10 тренировок',        'Завершите 10 тренировок',                 '🏅', 150),
('runs_50',     '50 тренировок',        'Завершите 50 тренировок',                 '🏆', 500),
('runs_100',    'Ветеран',              'Завершите 100 тренировок',                '💯', 1000),
('streak_3',    '3 дня подряд',         'Бегайте 3 дня подряд',                    '🔥', 100),
('streak_7',    'Воин недели',          'Бегайте 7 дней подряд',                   '⚡', 200),
('streak_30',   'Месяц без остановки',  'Бегайте 30 дней подряд',                  '🌟', 1000),
('single_5km',  '5K Runner',            'Пробегите 5 км за одну тренировку',       '🎽', 100),
('single_10km', '10K Runner',           'Пробегите 10 км за одну тренировку',      '🏁', 200),
('single_21km', 'Полумарафон',          'Пробегите 21.1 км за одну тренировку',    '🥈', 500),
('single_42km', 'Марафонец',            'Пробегите 42.2 км за одну тренировку',    '🥇', 1000)
ON CONFLICT (id) DO NOTHING;

-- Таблица достижений (шаблоны) — legacy, kept for reference
CREATE TABLE achievement_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  category TEXT NOT NULL, -- 'distance', 'time', 'streak', 'speed'
  requirement JSONB NOT NULL, -- {type: 'total_distance', value: 5000}
  xp_reward INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Таблица полученных достижений пользователей
CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id UUID REFERENCES achievement_templates(id),
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, achievement_id)
);

-- Таблица статистики пользователя (кэш для быстрого доступа)
CREATE TABLE user_stats (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_distance FLOAT DEFAULT 0, -- в метрах
  total_duration INTEGER DEFAULT 0, -- в секундах
  total_workouts INTEGER DEFAULT 0,
  best_pace FLOAT, -- минут на км
  best_distance FLOAT, -- в метрах
  longest_duration INTEGER, -- в секундах
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_workout_date DATE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- GET /user/stats — aggregated view
-- Equivalent to: SELECT SUM(distance_km), SUM(calories), COUNT(*) FROM workouts WHERE user_id = $1
CREATE OR REPLACE VIEW user_stats_view AS
SELECT
  user_id,
  ROUND(SUM(distance_km)::numeric, 1)   AS total_distance,
  SUM(calories)                          AS total_calories,
  COUNT(*)                               AS total_runs,
  SUM(duration_seconds)                  AS total_duration,
  MIN(NULLIF(avg_pace, 0))               AS best_pace,
  MAX(distance_km)                       AS best_distance
FROM workouts
GROUP BY user_id;

-- Индексы для производительности
CREATE INDEX idx_workouts_user_id ON workouts(user_id);
CREATE INDEX idx_workouts_started_at ON workouts(started_at DESC);
CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_stats_user_id ON user_stats(user_id);

-- Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Политики доступа
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own workouts" ON workouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own workouts" ON workouts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own achievements" ON user_achievements FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view own stats" ON user_stats FOR SELECT USING (auth.uid() = user_id);

-- Функция для обновления статистики после добавления тренировки
CREATE OR REPLACE FUNCTION update_user_stats_after_workout()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_stats (user_id, total_distance, total_duration, total_workouts, last_workout_date)
  VALUES (NEW.user_id, NEW.distance, NEW.duration, 1, DATE(NEW.started_at))
  ON CONFLICT (user_id) DO UPDATE SET
    total_distance = user_stats.total_distance + NEW.distance,
    total_duration = user_stats.total_duration + NEW.duration,
    total_workouts = user_stats.total_workouts + 1,
    best_pace = CASE 
      WHEN user_stats.best_pace IS NULL OR NEW.avg_pace < user_stats.best_pace 
      THEN NEW.avg_pace 
      ELSE user_stats.best_pace 
    END,
    best_distance = CASE 
      WHEN user_stats.best_distance IS NULL OR NEW.distance > user_stats.best_distance 
      THEN NEW.distance 
      ELSE user_stats.best_distance 
    END,
    longest_duration = CASE 
      WHEN user_stats.longest_duration IS NULL OR NEW.duration > user_stats.longest_duration 
      THEN NEW.duration 
      ELSE user_stats.longest_duration 
    END,
    last_workout_date = DATE(NEW.started_at),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stats_after_workout
AFTER INSERT ON workouts
FOR EACH ROW
EXECUTE FUNCTION update_user_stats_after_workout();

-- Функция для создания профиля при регистрации
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  
  INSERT INTO user_stats (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION handle_new_user();

-- Начальные достижения
INSERT INTO achievement_templates (code, title, description, icon, category, requirement, xp_reward) VALUES
('first_run', 'Первый шаг', 'Завершите первую тренировку', '🏃', 'milestone', '{"type": "workouts_count", "value": 1}', 50),
('5k_runner', '5K Runner', 'Пробегите 5 километров', '🎯', 'distance', '{"type": "single_distance", "value": 5000}', 100),
('10k_runner', '10K Runner', 'Пробегите 10 километров', '⭐', 'distance', '{"type": "single_distance", "value": 10000}', 200),
('marathoner', 'Марафонец', 'Пробегите 42.2 километра', '🏆', 'distance', '{"type": "single_distance", "value": 42195}', 1000),
('speed_demon', 'Демон скорости', 'Достигните темпа 4:00 мин/км', '⚡', 'speed', '{"type": "best_pace", "value": 4.0}', 300),
('nature_runner', 'Бегун природы', 'Пробегите 100 км', '🌲', 'distance', '{"type": "total_distance", "value": 100000}', 500),
('week_warrior', 'Воин недели', 'Бегайте 7 дней подряд', '🔥', 'streak', '{"type": "streak", "value": 7}', 200),
('century', 'Сотня', 'Завершите 100 тренировок', '💯', 'milestone', '{"type": "workouts_count", "value": 100}', 1000);

-- ─────────────────────────────────────────────────────────
-- TERRITORY CAPTURE SYSTEM
-- ─────────────────────────────────────────────────────────

-- Grid cells: each cell is ~50×50m (cell_size = 0.00045 degrees)
-- lat_index = floor(lat / 0.00045), lng_index = floor(lng / 0.00045)
CREATE TABLE grid_cells (
  id            TEXT PRIMARY KEY,          -- '{lat_index}_{lng_index}'
  lat_index     INTEGER NOT NULL,
  lng_index     INTEGER NOT NULL,
  owner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  capture_count INTEGER NOT NULL DEFAULT 1,
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (lat_index, lng_index)
);

CREATE INDEX idx_grid_cells_owner ON grid_cells(owner_user_id);

-- Maps workouts to the cells they captured
CREATE TABLE workout_cells (
  workout_id TEXT NOT NULL,
  cell_id    TEXT NOT NULL REFERENCES grid_cells(id) ON DELETE CASCADE,
  PRIMARY KEY (workout_id, cell_id)
);

CREATE INDEX idx_workout_cells_workout ON workout_cells(workout_id);

-- RLS
ALTER TABLE grid_cells   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view grid cells"       ON grid_cells   FOR SELECT USING (true);
CREATE POLICY "Users can insert/update cells"    ON grid_cells   FOR ALL    USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can view workout cells"     ON workout_cells FOR SELECT USING (true);
CREATE POLICY "Users can insert workout cells"   ON workout_cells FOR INSERT WITH CHECK (true);
