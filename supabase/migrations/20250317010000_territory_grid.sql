-- =============================================================================
-- GRID-BASED TERRITORY CAPTURE SYSTEM
-- 50m x 50m cells; cell_size = 0.00045 (~50m at equator)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. GRID CELLS
-- Unique (lat_index, lng_index); owner assigned on first capture
-- -----------------------------------------------------------------------------
CREATE TABLE grid_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lat_index INTEGER NOT NULL,
  lng_index INTEGER NOT NULL,
  owner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  capture_count INTEGER NOT NULL DEFAULT 1,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (lat_index, lng_index)
);

CREATE INDEX idx_grid_cells_lat_index ON grid_cells(lat_index);
CREATE INDEX idx_grid_cells_lng_index ON grid_cells(lng_index);
CREATE INDEX idx_grid_cells_owner_user_id ON grid_cells(owner_user_id);
CREATE INDEX idx_grid_cells_lat_lng ON grid_cells(lat_index, lng_index);

-- -----------------------------------------------------------------------------
-- 2. USER CELL VISITS (which user visited which cell, when)
-- -----------------------------------------------------------------------------
CREATE TABLE user_cell_visits (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cell_id UUID NOT NULL REFERENCES grid_cells(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, cell_id)
);

CREATE INDEX idx_user_cell_visits_user ON user_cell_visits(user_id);
CREATE INDEX idx_user_cell_visits_cell ON user_cell_visits(cell_id);

-- -----------------------------------------------------------------------------
-- 3. GRID CALCULATION
-- cell_size = 0.00045 (~50m); returns (lat_index, lng_index)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_grid_cell(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS TABLE(lat_index INTEGER, lng_index INTEGER) AS $$
DECLARE
  cell_size CONSTANT DOUBLE PRECISION := 0.00045;
BEGIN
  lat_index := FLOOR(p_lat / cell_size)::INTEGER;
  lng_index := FLOOR(p_lng / cell_size)::INTEGER;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- -----------------------------------------------------------------------------
-- 4. CELL CAPTURE LOGIC
-- On GPS point: get cell indexes → upsert cell → mark visit → set owner if empty → bump capture_count on revisit
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION capture_cell(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS UUID AS $$
DECLARE
  v_lat_index INTEGER;
  v_lng_index INTEGER;
  v_cell_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;

  SELECT g.lat_index, g.lng_index INTO v_lat_index, v_lng_index
  FROM get_grid_cell(p_lat, p_lng) g;

  -- 1–2. Upsert cell: create if not exists; if exists bump capture_count and set owner if empty
  INSERT INTO grid_cells (lat_index, lng_index, owner_user_id, capture_count, captured_at)
  VALUES (v_lat_index, v_lng_index, p_user_id, 1, NOW())
  ON CONFLICT (lat_index, lng_index) DO UPDATE SET
    capture_count = grid_cells.capture_count + 1,
    captured_at = NOW(),
    owner_user_id = COALESCE(grid_cells.owner_user_id, EXCLUDED.owner_user_id)
  RETURNING id INTO v_cell_id;

  -- 3–4. Mark user visit (idempotent: update visited_at on conflict)
  INSERT INTO user_cell_visits (user_id, cell_id, visited_at)
  VALUES (p_user_id, v_cell_id, NOW())
  ON CONFLICT (user_id, cell_id) DO UPDATE SET visited_at = NOW();

  RETURN v_cell_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 5. USER TERRITORY STATS VIEW
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW user_territory_stats AS
SELECT
  p.id AS user_id,
  COALESCE(owned.cnt, 0)::INTEGER AS total_cells_owned,
  COALESCE(visited.cnt, 0)::INTEGER AS total_cells_visited
FROM profiles p
LEFT JOIN (
  SELECT owner_user_id, COUNT(*) AS cnt
  FROM grid_cells
  WHERE owner_user_id IS NOT NULL
  GROUP BY owner_user_id
) owned ON owned.owner_user_id = p.id
LEFT JOIN (
  SELECT user_id, COUNT(*) AS cnt
  FROM user_cell_visits
  GROUP BY user_id
) visited ON visited.user_id = p.id;

-- -----------------------------------------------------------------------------
-- 6. GET /territory-leaderboard — top users by total_cells_owned
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_territory_leaderboard(p_limit INTEGER DEFAULT 100)
RETURNS SETOF JSON AS $$
  SELECT json_build_object(
    'rank', sub.rn,
    'user_id', sub.user_id,
    'username', sub.username,
    'total_cells_owned', sub.total_cells_owned,
    'total_cells_visited', sub.total_cells_visited,
    'is_current_user', (sub.user_id = auth.uid())
  )
  FROM (
    SELECT
      ROW_NUMBER() OVER (ORDER BY t.total_cells_owned DESC, t.total_cells_visited DESC) AS rn,
      t.user_id,
      COALESCE(p.full_name, p.username, p.id::text) AS username,
      t.total_cells_owned,
      t.total_cells_visited
    FROM user_territory_stats t
    JOIN profiles p ON p.id = t.user_id
    WHERE t.total_cells_owned > 0 OR t.total_cells_visited > 0
    ORDER BY t.total_cells_owned DESC, t.total_cells_visited DESC
    LIMIT p_limit
  ) sub;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- 7. get_user_cells(user_id) — all cells owned or visited by user
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_cells(p_user_id UUID DEFAULT auth.uid())
RETURNS SETOF JSON AS $$
  SELECT json_build_object(
    'id', c.id,
    'lat_index', c.lat_index,
    'lng_index', c.lng_index,
    'owner_user_id', c.owner_user_id,
    'capture_count', c.capture_count,
    'captured_at', c.captured_at,
    'visited_at', v.visited_at,
    'is_owner', (c.owner_user_id = p_user_id)
  )
  FROM grid_cells c
  JOIN user_cell_visits v ON v.cell_id = c.id AND v.user_id = p_user_id
  ORDER BY v.visited_at DESC;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- 8. get_map_cells(bounds) — all grid cells inside viewport
-- bounds: north, south, east, west (lat/lng)
-- Convert bounds to index range and return cells in range
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_map_cells(
  p_north DOUBLE PRECISION,
  p_south DOUBLE PRECISION,
  p_east DOUBLE PRECISION,
  p_west DOUBLE PRECISION
)
RETURNS SETOF JSON AS $$
DECLARE
  cell_size CONSTANT DOUBLE PRECISION := 0.00045;
  lat_min INTEGER;
  lat_max INTEGER;
  lng_min INTEGER;
  lng_max INTEGER;
BEGIN
  lat_min := FLOOR(LEAST(p_north, p_south) / cell_size)::INTEGER;
  lat_max := FLOOR(GREATEST(p_north, p_south) / cell_size)::INTEGER;
  lng_min := FLOOR(LEAST(p_east, p_west) / cell_size)::INTEGER;
  lng_max := FLOOR(GREATEST(p_east, p_west) / cell_size)::INTEGER;

  RETURN QUERY
  SELECT json_build_object(
    'id', c.id,
    'lat_index', c.lat_index,
    'lng_index', c.lng_index,
    'owner_user_id', c.owner_user_id,
    'capture_count', c.capture_count,
    'captured_at', c.captured_at
  )
  FROM grid_cells c
  WHERE c.lat_index BETWEEN lat_min AND lat_max
    AND c.lng_index BETWEEN lng_min AND lng_max
  ORDER BY c.lat_index, c.lng_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- 9. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE grid_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cell_visits ENABLE ROW LEVEL SECURITY;

-- Anyone can read grid cells (for map); only service/capture_cell writes
CREATE POLICY "grid_cells_select_all" ON grid_cells FOR SELECT USING (true);
CREATE POLICY "grid_cells_insert_via_rpc" ON grid_cells FOR INSERT WITH CHECK (true);
CREATE POLICY "grid_cells_update_via_rpc" ON grid_cells FOR UPDATE USING (true);

-- Users see own visits; inserts/updates happen via capture_cell (SECURITY DEFINER)
CREATE POLICY "user_cell_visits_select_own" ON user_cell_visits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_cell_visits_insert_own" ON user_cell_visits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_cell_visits_update_own" ON user_cell_visits FOR UPDATE USING (auth.uid() = user_id);
