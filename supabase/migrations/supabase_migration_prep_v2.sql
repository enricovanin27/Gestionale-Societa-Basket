-- ============================================================
-- MIGRATION V2: Preparazione Atletica — Redesign Gestionale
-- ============================================================

-- 1. Rimuovi tabelle non più necessarie
DROP TABLE IF EXISTS test_programmati CASCADE;
DROP TABLE IF EXISTS test_risultati CASCADE;
DROP TABLE IF EXISTS test_definizioni CASCADE;
DROP TABLE IF EXISTS antropometria CASCADE;
DROP TABLE IF EXISTS spazi_orario_settimana CASCADE;
DROP TABLE IF EXISTS spazi_orario_fisso CASCADE;
DROP TABLE IF EXISTS spazi_atletici CASCADE;

-- 2. Tabella: associazione preparatore ↔ squadre (admin la configura)
CREATE TABLE IF NOT EXISTS prep_squadre (
  id              SERIAL PRIMARY KEY,
  preparatore_id  UUID  NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  squadra         TEXT  NOT NULL,
  societa_id      UUID  NOT NULL REFERENCES societa(id),
  UNIQUE (preparatore_id, squadra, societa_id)
);
ALTER TABLE prep_squadre ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prep_squadre_admin_all" ON prep_squadre FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
      AND ruolo IN ('admin','super_admin') AND societa_id = prep_squadre.societa_id
  ));
CREATE POLICY "prep_squadre_prep_read" ON prep_squadre FOR SELECT TO authenticated
  USING (preparatore_id = auth.uid());
CREATE POLICY "prep_squadre_coach_read" ON prep_squadre FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
      AND (ruolo = 'allenatore' OR 'allenatore' = ANY(ruoli_extra))
      AND societa_id = prep_squadre.societa_id
  ));

-- 3. Tabella: turni del preparatore (legati a un allenamento o standalone)
CREATE TABLE IF NOT EXISTS prep_sessioni (
  id              SERIAL PRIMARY KEY,
  societa_id      UUID    NOT NULL REFERENCES societa(id),
  preparatore_id  UUID    NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  squadra         TEXT    NOT NULL,
  data            DATE    NOT NULL,
  ora_inizio      TIME    NOT NULL DEFAULT '00:00',
  durata_min      INTEGER NOT NULL DEFAULT 30,
  quando          TEXT    NOT NULL DEFAULT 'standalone'
                  CHECK (quando IN ('prima','durante','dopo','standalone')),
  su_campo        BOOLEAN NOT NULL DEFAULT FALSE,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE prep_sessioni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prep_sessioni_prep_all" ON prep_sessioni FOR ALL TO authenticated
  USING (preparatore_id = auth.uid());
CREATE POLICY "prep_sessioni_admin_read" ON prep_sessioni FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
      AND ruolo IN ('admin','super_admin') AND societa_id = prep_sessioni.societa_id
  ));
CREATE POLICY "prep_sessioni_coach_read" ON prep_sessioni FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
      AND (p.ruolo = 'allenatore' OR 'allenatore' = ANY(p.ruoli_extra))
      AND p.societa_id = prep_sessioni.societa_id
      AND (p.squadra = prep_sessioni.squadra
           OR p.squadra2 = prep_sessioni.squadra
           OR p.squadra3 = prep_sessioni.squadra)
  ));
