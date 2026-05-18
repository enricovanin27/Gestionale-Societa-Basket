-- ============================================================
-- MIGRAZIONE: Giocatori, Presenze Allenamento, Indisponibilità, Quote
-- Esegui nel SQL Editor di Supabase
-- ============================================================

-- ── AGGIORNA VINCOLO RUOLO ────────────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_ruolo_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_ruolo_check
  CHECK (ruolo IN ('super_admin', 'admin', 'allenatore', 'genitore', 'giocatore'));


-- ── GIOCATORI (roster) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS giocatori (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id     UUID NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
  nome           TEXT NOT NULL,
  cognome        TEXT NOT NULL,
  squadra        TEXT NOT NULL,
  squadra2       TEXT,
  squadra3       TEXT,
  data_nascita   DATE,
  numero_maglia  SMALLINT,
  note           TEXT,
  attivo         BOOLEAN NOT NULL DEFAULT TRUE,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE giocatori ENABLE ROW LEVEL SECURITY;

CREATE POLICY "giocatori_staff_all" ON giocatori
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.ruolo IN ('admin', 'super_admin', 'allenatore')
        AND profiles.societa_id = giocatori.societa_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.ruolo IN ('admin', 'super_admin', 'allenatore')
        AND profiles.societa_id = giocatori.societa_id
    )
  );

CREATE POLICY "giocatori_self_select" ON giocatori
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ── PRESENZE ALLENAMENTO ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS presenze_allenamento (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id    UUID NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
  giocatore_id  UUID NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  data          DATE NOT NULL,
  squadra       TEXT NOT NULL,
  presente      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (giocatore_id, data)
);

ALTER TABLE presenze_allenamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presenze_all_staff_all" ON presenze_allenamento
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.ruolo IN ('admin', 'super_admin', 'allenatore')
        AND profiles.societa_id = presenze_allenamento.societa_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.ruolo IN ('admin', 'super_admin', 'allenatore')
        AND profiles.societa_id = presenze_allenamento.societa_id
    )
  );

CREATE POLICY "presenze_all_self_select" ON presenze_allenamento
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM giocatori
      WHERE giocatori.id = presenze_allenamento.giocatore_id
        AND giocatori.user_id = auth.uid()
    )
  );


-- ── INDISPONIBILITÀ ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS indisponibilita (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id    UUID NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
  giocatore_id  UUID NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  data_inizio   DATE NOT NULL,
  data_fine     DATE,
  tipo          TEXT NOT NULL DEFAULT 'infortunio'
                  CHECK (tipo IN ('infortunio', 'sospeso', 'altro')),
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE indisponibilita ENABLE ROW LEVEL SECURITY;

CREATE POLICY "indisponibilita_staff_all" ON indisponibilita
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.ruolo IN ('admin', 'super_admin', 'allenatore')
        AND profiles.societa_id = indisponibilita.societa_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.ruolo IN ('admin', 'super_admin', 'allenatore')
        AND profiles.societa_id = indisponibilita.societa_id
    )
  );

CREATE POLICY "indisponibilita_self_select" ON indisponibilita
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM giocatori
      WHERE giocatori.id = indisponibilita.giocatore_id
        AND giocatori.user_id = auth.uid()
    )
  );


-- ── QUOTE ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id      UUID NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
  giocatore_id    UUID NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL DEFAULT 'mensile'
                    CHECK (tipo IN ('mensile', 'iscrizione', 'altro')),
  descrizione     TEXT,
  importo         NUMERIC(8,2),
  data_scadenza   DATE,
  pagato          BOOLEAN NOT NULL DEFAULT FALSE,
  data_pagamento  DATE,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE quote ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_admin_all" ON quote
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.ruolo IN ('admin', 'super_admin')
        AND profiles.societa_id = quote.societa_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.ruolo IN ('admin', 'super_admin')
        AND profiles.societa_id = quote.societa_id
    )
  );

CREATE POLICY "quote_self_select" ON quote
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM giocatori
      WHERE giocatori.id = quote.giocatore_id
        AND giocatori.user_id = auth.uid()
    )
  );
