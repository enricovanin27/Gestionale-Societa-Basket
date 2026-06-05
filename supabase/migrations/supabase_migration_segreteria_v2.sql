-- ============================================================
-- MIGRAZIONE: Segreteria V2 — Quote write + Certificati PDF
-- Esegui nel SQL Editor di Supabase
-- ============================================================

-- ── 1. Colonna URL certificato PDF su giocatori ───────────────
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS cert_medico_url TEXT;

-- ── 2. RLS: segreteria può INSERIRE quote ────────────────────
DROP POLICY IF EXISTS "quote_segreteria_insert" ON quote;
CREATE POLICY "quote_segreteria_insert" ON quote
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.ruolo IN ('segreteria', 'admin', 'super_admin')
             OR 'segreteria' = ANY(profiles.ruoli_extra)
             OR 'admin' = ANY(profiles.ruoli_extra))
        AND profiles.societa_id = quote.societa_id
    )
  );

-- ── 3. RLS: segreteria può AGGIORNARE quote (es. segna pagato) ─
DROP POLICY IF EXISTS "quote_segreteria_update" ON quote;
CREATE POLICY "quote_segreteria_update" ON quote
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.ruolo IN ('segreteria', 'admin', 'super_admin')
             OR 'segreteria' = ANY(profiles.ruoli_extra)
             OR 'admin' = ANY(profiles.ruoli_extra))
        AND profiles.societa_id = quote.societa_id
    )
  );

-- ── 4. RLS: segreteria può ELIMINARE quote ───────────────────
DROP POLICY IF EXISTS "quote_segreteria_delete" ON quote;
CREATE POLICY "quote_segreteria_delete" ON quote
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND (profiles.ruolo IN ('segreteria', 'admin', 'super_admin')
             OR 'segreteria' = ANY(profiles.ruoli_extra)
             OR 'admin' = ANY(profiles.ruoli_extra))
        AND profiles.societa_id = quote.societa_id
    )
  );

-- ── 5. Storage: upload/update certificati ────────────────────
DROP POLICY IF EXISTS "certificati_upload" ON storage.objects;
CREATE POLICY "certificati_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'certificati');

DROP POLICY IF EXISTS "certificati_update" ON storage.objects;
CREATE POLICY "certificati_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'certificati');
