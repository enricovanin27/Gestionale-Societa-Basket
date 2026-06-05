-- ══════════════════════════════════════════════════════════════════════════════
-- Migrazione: Modulo Contabilità — Tabella spese con RLS
-- Eseguire nel SQL Editor di Supabase (una sola volta; safe to re-run)
-- RLS:
--   * SELECT: segreteria, dirigente, admin, super_admin (propria società)
--   * INSERT/DELETE: segreteria (anche via ruoli_extra), admin, super_admin
--   * UPDATE: non supportato
-- ══════════════════════════════════════════════════════════════════════════════

-- Tabella spese
CREATE TABLE IF NOT EXISTS spese (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societa_id  UUID NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
  data        DATE NOT NULL,
  importo     NUMERIC(10,2) NOT NULL CHECK (importo > 0),
  categoria   TEXT NOT NULL,
  descrizione TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spese_societa_data_idx ON spese (societa_id, data);

ALTER TABLE spese ENABLE ROW LEVEL SECURITY;

-- SELECT: segreteria, dirigente, admin, super_admin + ruoli_extra
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spese' AND policyname = 'spese_select') THEN
    EXECUTE $policy$
      CREATE POLICY spese_select ON spese
        FOR SELECT TO authenticated
        USING (
          societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
          AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
              ruolo IN ('segreteria', 'dirigente', 'admin', 'super_admin')
              OR 'segreteria' = ANY(ruoli_extra)
              OR 'dirigente'  = ANY(ruoli_extra)
            )
          )
        );
    $policy$;
  END IF;
END;
$$;

-- INSERT: segreteria (anche ruoli_extra), admin, super_admin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spese' AND policyname = 'spese_insert') THEN
    EXECUTE $policy$
      CREATE POLICY spese_insert ON spese
        FOR INSERT TO authenticated
        WITH CHECK (
          societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
          AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
              ruolo IN ('segreteria', 'admin', 'super_admin')
              OR 'segreteria' = ANY(ruoli_extra)
            )
          )
        );
    $policy$;
  END IF;
END;
$$;

-- DELETE: segreteria (anche ruoli_extra), admin, super_admin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spese' AND policyname = 'spese_delete') THEN
    EXECUTE $policy$
      CREATE POLICY spese_delete ON spese
        FOR DELETE TO authenticated
        USING (
          societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
          AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (
              ruolo IN ('segreteria', 'admin', 'super_admin')
              OR 'segreteria' = ANY(ruoli_extra)
            )
          )
        );
    $policy$;
  END IF;
END;
$$;
