-- supabase/migrations/supabase_migration_annunci_rls_fix.sql
--
-- Bug: annunci_staff_insert consentiva solo ruolo='admin'|'allenatore'.
-- La segreteria e chi ha questi ruoli come ruoli_extra veniva bloccata.
-- Fix: le policy ora includono 'segreteria' e controllano anche ruoli_extra.

-- ── INSERT ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "annunci_staff_insert" ON annunci;
CREATE POLICY "annunci_staff_insert" ON annunci
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.societa_id = annunci.societa_id
        AND (
          profiles.ruolo IN ('admin', 'allenatore', 'segreteria')
          OR 'admin'      = ANY(profiles.ruoli_extra)
          OR 'allenatore' = ANY(profiles.ruoli_extra)
          OR 'segreteria' = ANY(profiles.ruoli_extra)
        )
    )
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "annunci_staff_update" ON annunci;
CREATE POLICY "annunci_staff_update" ON annunci
  FOR UPDATE TO authenticated
  USING (
    autore_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.societa_id = annunci.societa_id
        AND (
          profiles.ruolo = 'admin'
          OR 'admin' = ANY(profiles.ruoli_extra)
        )
    )
  );

-- ── DELETE ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "annunci_delete" ON annunci;
CREATE POLICY "annunci_delete" ON annunci
  FOR DELETE TO authenticated
  USING (
    autore_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.societa_id = annunci.societa_id
        AND (
          profiles.ruolo = 'admin'
          OR 'admin' = ANY(profiles.ruoli_extra)
        )
    )
  );

-- ── NOTE ──────────────────────────────────────────────────────────────────────
-- Esegui nel Supabase Dashboard → SQL Editor → Run.
