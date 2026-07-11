-- ============================================================
-- MIGRAZIONE: Stagione sportiva + turnover roster
-- Esegui nel SQL Editor di Supabase
-- ============================================================

-- ── 1. Colonne base ────────────────────────────────────────────
-- profiles.attivo è già in uso in produzione (SetupPage.jsx lo legge/scrive)
-- ma non esiste in nessuna migrazione tracciata: la aggiungiamo qui in modo
-- difensivo (IF NOT EXISTS) così la migrazione è idempotente ovunque venga eseguita.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS attivo BOOLEAN NOT NULL DEFAULT true;

-- Nota: formato "AAAA/AAAA" (slash) intenzionalmente distinto da doa.stagione
-- ("AAAA-AAAA", dash, in migration_fip.sql) — feature diversa, nessun riferimento incrociato.
ALTER TABLE societa  ADD COLUMN IF NOT EXISTS stagione_corrente TEXT NOT NULL DEFAULT '2025/2026';

ALTER TABLE calendario           ADD COLUMN IF NOT EXISTS stagione TEXT;
ALTER TABLE orario_fisso         ADD COLUMN IF NOT EXISTS stagione TEXT;
ALTER TABLE presenze_allenamento ADD COLUMN IF NOT EXISTS stagione TEXT;
ALTER TABLE quote                ADD COLUMN IF NOT EXISTS stagione TEXT;

-- ── 2. Backfill: tagga le righe esistenti con la stagione corrente della loro società ──
UPDATE calendario c SET stagione = s.stagione_corrente
  FROM societa s WHERE c.societa_id = s.id AND c.stagione IS NULL;
UPDATE orario_fisso o SET stagione = s.stagione_corrente
  FROM societa s WHERE o.societa_id = s.id AND o.stagione IS NULL;
UPDATE presenze_allenamento p SET stagione = s.stagione_corrente
  FROM societa s WHERE p.societa_id = s.id AND p.stagione IS NULL;
UPDATE quote q SET stagione = s.stagione_corrente
  FROM societa s WHERE q.societa_id = s.id AND q.stagione IS NULL;

-- ── 3. Trigger: ogni nuova riga eredita la stagione corrente della società, se non specificata ──
CREATE OR REPLACE FUNCTION set_stagione_from_societa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stagione IS NULL THEN
    SELECT stagione_corrente INTO NEW.stagione FROM societa WHERE id = NEW.societa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_stagione_calendario ON calendario;
CREATE TRIGGER trg_stagione_calendario
  BEFORE INSERT ON calendario
  FOR EACH ROW EXECUTE FUNCTION set_stagione_from_societa();

DROP TRIGGER IF EXISTS trg_stagione_orario_fisso ON orario_fisso;
CREATE TRIGGER trg_stagione_orario_fisso
  BEFORE INSERT ON orario_fisso
  FOR EACH ROW EXECUTE FUNCTION set_stagione_from_societa();

DROP TRIGGER IF EXISTS trg_stagione_presenze ON presenze_allenamento;
CREATE TRIGGER trg_stagione_presenze
  BEFORE INSERT ON presenze_allenamento
  FOR EACH ROW EXECUTE FUNCTION set_stagione_from_societa();

DROP TRIGGER IF EXISTS trg_stagione_quote ON quote;
CREATE TRIGGER trg_stagione_quote
  BEFORE INSERT ON quote
  FOR EACH ROW EXECUTE FUNCTION set_stagione_from_societa();
