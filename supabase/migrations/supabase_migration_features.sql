-- ============================================================
-- MIGRAZIONE: Push Notifications + Presenze + Annunci
-- Esegui nel SQL Editor di Supabase
-- ============================================================

-- ── PUSH SUBSCRIPTIONS ───────────────────────────────────────
-- Generare VAPID keys con: npx web-push generate-vapid-keys
-- Aggiungere a .env: VITE_VAPID_PUBLIC_KEY, VAPID_PUBLIC_KEY,
--   VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:tua@email.com),
--   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  societa_id   UUID REFERENCES societa(id) ON DELETE CASCADE,
  squadre      TEXT[] NOT NULL DEFAULT '{}',
  subscription JSONB NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_own" ON push_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── PRESENZE ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS presenze (
  id        SERIAL PRIMARY KEY,
  societa_id UUID REFERENCES societa(id) ON DELETE CASCADE,
  data      DATE NOT NULL,
  squadra   TEXT NOT NULL,
  user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  risposta  TEXT NOT NULL CHECK (risposta IN ('presente','assente','forse')),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(societa_id, data, squadra, user_id)
);

ALTER TABLE presenze ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presenze_own" ON presenze
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "presenze_staff_select" ON presenze
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.ruolo IN ('admin','allenatore')
        AND profiles.societa_id = presenze.societa_id
    )
  );


-- ── ANNUNCI ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS annunci (
  id          SERIAL PRIMARY KEY,
  societa_id  UUID REFERENCES societa(id) ON DELETE CASCADE NOT NULL,
  squadra     TEXT,
  titolo      TEXT NOT NULL,
  testo       TEXT NOT NULL DEFAULT '',
  autore_id   UUID REFERENCES auth.users(id),
  autore_nome TEXT NOT NULL DEFAULT '',
  pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE annunci ENABLE ROW LEVEL SECURITY;

CREATE POLICY "annunci_read" ON annunci
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.societa_id = annunci.societa_id
    )
  );

CREATE POLICY "annunci_staff_insert" ON annunci
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.ruolo IN ('admin','allenatore')
        AND profiles.societa_id = annunci.societa_id
    )
  );

CREATE POLICY "annunci_staff_update" ON annunci
  FOR UPDATE TO authenticated
  USING (
    autore_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.ruolo = 'admin'
        AND profiles.societa_id = annunci.societa_id
    )
  );

CREATE POLICY "annunci_delete" ON annunci
  FOR DELETE TO authenticated
  USING (
    autore_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.ruolo = 'admin'
        AND profiles.societa_id = annunci.societa_id
    )
  );
