-- ============================================================
-- MIGRAZIONE: prep atletica accessibile ad admin e allenatori
-- ============================================================

-- 1. preparatore_id diventa nullable (sessioni create da admin/coach)
ALTER TABLE prep_sessioni ALTER COLUMN preparatore_id DROP NOT NULL;

-- 2. Admin e allenatori possono inserire sessioni prep (senza preparatore)
CREATE POLICY "prep_sessioni_admin_allenatore_insert" ON prep_sessioni
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.ruolo IN ('admin', 'super_admin', 'allenatore')
      AND p.societa_id = prep_sessioni.societa_id
  ));

-- 3. Admin può anche eliminare sessioni prep non proprie
CREATE POLICY "prep_sessioni_admin_delete" ON prep_sessioni
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.ruolo IN ('admin', 'super_admin')
      AND p.societa_id = prep_sessioni.societa_id
  ));

-- 4. Colonne prep sull'orario fisso (settimana tipo)
ALTER TABLE orario_fisso
  ADD COLUMN IF NOT EXISTS prep_inclusa    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS prep_quando     TEXT    CHECK (prep_quando IN ('prima','durante','dopo')),
  ADD COLUMN IF NOT EXISTS prep_durata_min INTEGER,
  ADD COLUMN IF NOT EXISTS prep_su_campo   BOOLEAN DEFAULT FALSE;
