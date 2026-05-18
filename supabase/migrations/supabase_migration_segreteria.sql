-- ============================================================
-- MIGRAZIONE: Ruolo Segreteria, Multi-ruolo, Cert. Medico
-- Esegui nel SQL Editor di Supabase
-- ============================================================

-- ── 1. CERT. MEDICO su giocatori ─────────────────────────────
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS cert_medico_scadenza DATE;

-- ── 2. RUOLI EXTRA su profiles ────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ruoli_extra TEXT[] NOT NULL DEFAULT '{}';

-- ── 3. AGGIUNGI 'segreteria' al vincolo ruolo ────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_ruolo_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_ruolo_check
  CHECK (ruolo IN ('super_admin', 'admin', 'allenatore', 'genitore', 'giocatore', 'segreteria'));

-- ── 4. RLS: Segreteria può leggere giocatori ─────────────────
DROP POLICY IF EXISTS "giocatori_segreteria_select" ON giocatori;
CREATE POLICY "giocatori_segreteria_select" ON giocatori
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.ruolo = 'segreteria' OR 'segreteria' = ANY(profiles.ruoli_extra))
        AND profiles.societa_id = giocatori.societa_id
    )
  );

-- ── 5. RLS: Segreteria può leggere quote ─────────────────────
DROP POLICY IF EXISTS "quote_segreteria_select" ON quote;
CREATE POLICY "quote_segreteria_select" ON quote
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.ruolo = 'segreteria' OR 'segreteria' = ANY(profiles.ruoli_extra))
        AND profiles.societa_id = quote.societa_id
    )
  );

-- ── 6. RLS: utenti con ruoli_extra admin/allenatore su giocatori ──
DROP POLICY IF EXISTS "giocatori_extra_roles_select" ON giocatori;
CREATE POLICY "giocatori_extra_roles_select" ON giocatori
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (
          'admin' = ANY(profiles.ruoli_extra) OR
          'allenatore' = ANY(profiles.ruoli_extra)
        )
        AND profiles.societa_id = giocatori.societa_id
    )
  );
