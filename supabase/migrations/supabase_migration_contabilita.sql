-- supabase/migrations/supabase_migration_contabilita.sql

-- ── Tabella spese ─────────────────────────────────────────────────────────
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

-- Indice per query per società + periodo
CREATE INDEX IF NOT EXISTS spese_societa_data_idx ON spese (societa_id, data);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE spese ENABLE ROW LEVEL SECURITY;

-- SELECT: qualsiasi utente autenticato della propria società
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spese' AND policyname = 'spese_select') THEN
    EXECUTE $policy$
      CREATE POLICY spese_select ON spese
        FOR SELECT TO authenticated
        USING (societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid()));
    $policy$;
  END IF;
END;
$$;

-- INSERT: solo segreteria, admin, super_admin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spese' AND policyname = 'spese_insert') THEN
    EXECUTE $policy$
      CREATE POLICY spese_insert ON spese
        FOR INSERT TO authenticated
        WITH CHECK (
          societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
          AND (SELECT ruolo FROM profiles WHERE id = auth.uid())
            IN ('segreteria', 'admin', 'super_admin')
        );
    $policy$;
  END IF;
END;
$$;

-- DELETE: solo segreteria, admin, super_admin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'spese' AND policyname = 'spese_delete') THEN
    EXECUTE $policy$
      CREATE POLICY spese_delete ON spese
        FOR DELETE TO authenticated
        USING (
          societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
          AND (SELECT ruolo FROM profiles WHERE id = auth.uid())
            IN ('segreteria', 'admin', 'super_admin')
        );
    $policy$;
  END IF;
END;
$$;
