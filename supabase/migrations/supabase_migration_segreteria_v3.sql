-- supabase/migrations/supabase_migration_segreteria_v3.sql

-- ── GIOCATORI ─────────────────────────────────────────────────────────────
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS luogo_nascita TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS indirizzo TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS citta TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS cap TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS provincia TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS nome_genitore TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS cognome_genitore TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS codice_fiscale_genitore TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS email_genitore TEXT;
ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS data_iscrizione DATE;

-- ── SOCIETA ──────────────────────────────────────────────────────────────
ALTER TABLE societa ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS indirizzo TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS citta TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS cap TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS provincia TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE societa ADD COLUMN IF NOT EXISTS nome_completo TEXT;

-- ── QUOTE ────────────────────────────────────────────────────────────────
ALTER TABLE quote ADD COLUMN IF NOT EXISTS metodo_pagamento TEXT
  CHECK (metodo_pagamento IN ('contanti', 'bonifico', 'pos'));
ALTER TABLE quote ADD COLUMN IF NOT EXISTS data_pagamento DATE;
ALTER TABLE quote ADD COLUMN IF NOT EXISTS numero_ricevuta INTEGER;

-- ── RLS: segreteria può leggere e scrivere sulla propria società ──────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'societa' AND policyname = 'segreteria_own_societa'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY segreteria_own_societa ON societa
        FOR ALL
        TO authenticated
        USING (
          id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
          AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
            AND (ruolo = 'segreteria' OR 'segreteria' = ANY(ruoli_extra))
          )
        )
        WITH CHECK (
          id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
        );
    $policy$;
  END IF;
END;
$$;
