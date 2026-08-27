-- ============================================================
-- Distrito 3 Tracker — Supabase Migration
-- Ejecuta este SQL en tu dashboard de Supabase:
--   Dashboard → SQL Editor → New query → Pega → Run
-- ============================================================

-- 1. Tabla de sesiones de recorrido
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID          PRIMARY KEY,
  district_id   TEXT          NOT NULL DEFAULT '3',
  section_id    TEXT          NOT NULL,
  state         TEXT          NOT NULL DEFAULT 'idle',
  started_at    BIGINT,
  accepted_at   BIGINT,
  finished_at   BIGINT,
  points        JSONB         DEFAULT '[]'::jsonb,
  distance_meters DOUBLE PRECISION DEFAULT 0,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);

-- 2. Índice para consultas por sección
CREATE INDEX IF NOT EXISTS idx_sessions_section_id ON sessions (section_id);

-- 3. Índice para ordenar por fecha de inicio
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at DESC);

-- 4. Habilitar Row Level Security
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- 5. Política: permitir acceso anónimo (la app no tiene auth)
CREATE POLICY "anon_full_access"
  ON sessions
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- 6. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
