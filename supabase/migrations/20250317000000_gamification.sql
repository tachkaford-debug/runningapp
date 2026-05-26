-- =============================================================================
-- GAMIFICATION SYSTEM — Running Tracker
-- Clean schema: user XP, workouts, achievements, medals, leaderboard, APIs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PROFILES (extends auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. USER XP SYSTEM
-- Level formula: level = floor(sqrt(xp_total / 10))
-- -----------------------------------------------------------------------------
CREATE TABLE user_xp (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  xp_total INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_xp_level ON user_xp(level DESC);

-- Helper: compute level from total XP
CREATE OR REPLACE FUNCTION level_from_xp(xp INTEGER)
RETURNS INTEGER AS $$
  SELECT GREATEST(1, FLOOR(SQRT(GREATEST(0, xp)::numeric / 10))::integer);
$$ LANGUAGE sql IMMUTABLE;

-- -----------------------------------------------------------------------------
-- 3. WORKOUTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  distance_km NUMERIC(10,2) NOT NULL,
  duration_seconds INTEGER NOT NULL,
  calories INTEGER NOT NULL DEFAULT 0,
  avg_pace NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workouts_user_id ON workouts(user_id);
CREATE INDEX IF NOT EXISTS idx_workouts_created_at ON workouts(created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. XP CALCULATION
-- Rules: 1 km = 1 XP; first run of day +5; run > 5 km +5; run > 10 km +10
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calc_workout_xp(
  p_user_id UUID,
  p_distance_km NUMERIC,
  p_created_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS INTEGER AS $$
DECLARE
  base_xp INTEGER;
  bonus_first_day INTEGER := 0;
  bonus_5km INTEGER := 0;
  bonus_10km INTEGER := 0;
  is_first_today BOOLEAN;
BEGIN
  base_xp := FLOOR(p_distance_km)::integer;

  SELECT NOT EXISTS (
    SELECT 1 FROM workouts w
    WHERE w.user_id = p_user_id
      AND w.created_at < p_created_at
      AND DATE(w.created_at AT TIME ZONE 'UTC') = DATE(p_created_at AT TIME ZONE 'UTC')
  ) INTO is_first_today;

  IF is_first_today THEN bonus_first_day := 5; END IF;
  IF p_distance_km > 5 THEN bonus_5km := 5; END IF;
  IF p_distance_km > 10 THEN bonus_10km := 10; END IF;

  RETURN base_xp + bonus_first_day + bonus_5km + bonus_10km;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 5. TRIGGER: On workout insert — update user_xp and sync level
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION on_workout_insert_xp()
RETURNS TRIGGER AS $$
DECLARE
  earned_xp INTEGER;
  new_total INTEGER;
BEGIN
  earned_xp := calc_workout_xp(NEW.user_id, NEW.distance_km, NEW.created_at);
  INSERT INTO user_xp (user_id, xp_total, level, updated_at)
  VALUES (
    NEW.user_id,
    earned_xp,
    level_from_xp(earned_xp),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    xp_total = user_xp.xp_total + earned_xp,
    level = level_from_xp(user_xp.xp_total + earned_xp),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_workout_xp ON workouts;
CREATE TRIGGER trigger_workout_xp
  AFTER INSERT ON workouts
  FOR EACH ROW
  EXECUTE FUNCTION on_workout_insert_xp();

-- -----------------------------------------------------------------------------
-- 6. ACHIEVEMENTS CATALOGUE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL
);

-- Seed (match app achievement codes)
INSERT INTO achievements (id, title, description, icon) VALUES
  ('FIRST_RUN',       'Первый шаг',           'Завершите первую тренировку',                    '🏃'),
  ('RUN_10_KM_TOTAL', '10 км суммарно',        'Пробегите 10 км суммарно',                       '🎯'),
  ('RUN_100_KM_TOTAL','100 км суммарно',       'Пробегите 100 км суммарно',                      '🌍'),
  ('RUN_7_DAYS_STREAK','Воин недели',          'Бегайте 7 дней подряд',                        '⚡'),
  ('RUN_50_WORKOUTS', '50 тренировок',         'Завершите 50 тренировок',                       '🏆')
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. USER ACHIEVEMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  achievement_id TEXT REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

-- -----------------------------------------------------------------------------
-- 8. ACHIEVEMENT CHECK — run after each workout
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_achievements_after_workout()
RETURNS TRIGGER AS $$
DECLARE
  total_km NUMERIC;
  total_runs BIGINT;
  streak_days INTEGER;
  d DATE;
  prev DATE;
  streak INTEGER;
  r RECORD;
BEGIN
  -- Total distance (km)
  SELECT COALESCE(SUM(distance_km), 0) INTO total_km FROM workouts WHERE user_id = NEW.user_id;
  SELECT COUNT(*) INTO total_runs FROM workouts WHERE user_id = NEW.user_id;

  -- Current streak (consecutive days with at least one run, ending today)
  streak_days := 0;
  d := DATE(NEW.created_at AT TIME ZONE 'UTC');
  LOOP
    IF NOT EXISTS (SELECT 1 FROM workouts w WHERE w.user_id = NEW.user_id AND DATE(w.created_at AT TIME ZONE 'UTC') = d) THEN
      EXIT;
    END IF;
    streak_days := streak_days + 1;
    d := d - 1;
  END LOOP;

  -- FIRST_RUN
  IF total_runs >= 1 THEN
    INSERT INTO user_achievements (user_id, achievement_id) VALUES (NEW.user_id, 'FIRST_RUN')
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;

  -- RUN_10_KM_TOTAL
  IF total_km >= 10 THEN
    INSERT INTO user_achievements (user_id, achievement_id) VALUES (NEW.user_id, 'RUN_10_KM_TOTAL')
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;

  -- RUN_100_KM_TOTAL
  IF total_km >= 100 THEN
    INSERT INTO user_achievements (user_id, achievement_id) VALUES (NEW.user_id, 'RUN_100_KM_TOTAL')
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;

  -- RUN_7_DAYS_STREAK
  IF streak_days >= 7 THEN
    INSERT INTO user_achievements (user_id, achievement_id) VALUES (NEW.user_id, 'RUN_7_DAYS_STREAK')
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;

  -- RUN_50_WORKOUTS
  IF total_runs >= 50 THEN
    INSERT INTO user_achievements (user_id, achievement_id) VALUES (NEW.user_id, 'RUN_50_WORKOUTS')
    ON CONFLICT (user_id, achievement_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_achievements ON workouts;
CREATE TRIGGER trigger_check_achievements
  AFTER INSERT ON workouts
  FOR EACH ROW
  EXECUTE FUNCTION check_achievements_after_workout();

-- -----------------------------------------------------------------------------
-- 9. MEDALS (real-life event medals)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  place TEXT NOT NULL,
  event_date DATE NOT NULL,
  proof_image TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medals_user ON medals(user_id);
CREATE INDEX IF NOT EXISTS idx_medals_status ON medals(verification_status);

-- -----------------------------------------------------------------------------
-- 10. USER STATISTICS VIEW (aggregated from workouts)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW user_stats_view AS
SELECT
  w.user_id,
  ROUND(SUM(w.distance_km)::numeric, 1) AS total_distance,
  COALESCE(SUM(w.calories), 0)::integer AS total_calories,
  COUNT(*)::integer AS total_runs
FROM workouts w
GROUP BY w.user_id;

-- -----------------------------------------------------------------------------
-- 11. API: GET /user/stats
-- Returns: total_distance, total_calories, total_runs, level, xp
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID DEFAULT auth.uid())
RETURNS JSON AS $$
  SELECT json_build_object(
    'total_distance', COALESCE(s.total_distance, 0),
    'total_calories', COALESCE(s.total_calories, 0),
    'total_runs',     COALESCE(s.total_runs, 0),
    'level',          COALESCE(x.level, 1),
    'xp',             COALESCE(x.xp_total, 0)
  )
  FROM (SELECT 1) _d
  LEFT JOIN user_stats_view s ON s.user_id = p_user_id
  LEFT JOIN user_xp x ON x.user_id = p_user_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- 12. API: GET /leaderboard — top 100 by total_distance
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS SETOF JSON AS $$
  SELECT json_build_object(
    'rank', sub.rn,
    'user_id', sub.user_id,
    'username', sub.username,
    'distance', sub.distance,
    'is_current_user', sub.is_current_user
  )
  FROM (
    SELECT
      ROW_NUMBER() OVER (ORDER BY COALESCE(s.total_distance, 0) DESC) AS rn,
      p.id AS user_id,
      COALESCE(p.full_name, p.username, p.id::text) AS username,
      ROUND(COALESCE(s.total_distance, 0)::numeric, 1) AS distance,
      (p.id = auth.uid()) AS is_current_user
    FROM profiles p
    LEFT JOIN user_stats_view s ON s.user_id = p.id
    ORDER BY COALESCE(s.total_distance, 0) DESC
    LIMIT 100
  ) sub;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- 13. API: GET /dashboard — full achievements screen payload
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_dashboard(p_user_id UUID DEFAULT auth.uid())
RETURNS JSON AS $$
DECLARE
  x user_xp%ROWTYPE;
  xp_next INTEGER;
  st RECORD;
  res JSON;
BEGIN
  SELECT * INTO x FROM user_xp WHERE user_id = p_user_id;
  xp_next := (COALESCE(x.level, 1) + 1) ^ 2 * 10;

  SELECT total_distance, total_calories, total_runs INTO st
  FROM user_stats_view WHERE user_id = p_user_id;

  res := json_build_object(
    'level',         COALESCE(x.level, 1),
    'xp',            COALESCE(x.xp_total, 0),
    'xp_next_level', xp_next,
    'stats', json_build_object(
      'total_distance', COALESCE(st.total_distance, 0),
      'total_runs',     COALESCE(st.total_runs, 0),
      'total_calories', COALESCE(st.total_calories, 0)
    ),
    'medals', (
      SELECT COALESCE(json_agg(m ORDER BY m.created_at DESC), '[]'::json)
      FROM (
        SELECT id, event_name, place, event_date, proof_image, verification_status, created_at
        FROM medals WHERE user_id = p_user_id
      ) m
    ),
    'achievements', (
      SELECT COALESCE(json_agg(a ORDER BY a.id), '[]'::json)
      FROM (
        SELECT a.id, a.title, a.description, a.icon, ua.unlocked_at,
               (ua.user_id IS NOT NULL) AS unlocked
        FROM achievements a
        LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = p_user_id
      ) a
    ),
    'leaderboard', (
      SELECT COALESCE(json_agg(t.ent ORDER BY (t.ent->>'rank')::int), '[]'::json)
      FROM (SELECT get_leaderboard() AS ent) t
    )
  );
  RETURN res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- 14. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE medals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "user_xp_select_own" ON user_xp FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "workouts_select_own" ON workouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "workouts_insert_own" ON workouts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_achievements_select_own" ON user_achievements FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "medals_select_own" ON medals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "medals_insert_own" ON medals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "medals_delete_own" ON medals FOR DELETE USING (auth.uid() = user_id);

-- Ensure profile + user_xp row on first signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO user_xp (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
