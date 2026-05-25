-- supabase/migrations/supabase_migration_genitore_link.sql

-- ── Colonna di collegamento genitore → giocatore ──────────────────────────
ALTER TABLE giocatori
  ADD COLUMN IF NOT EXISTS genitore_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── RLS: il genitore può leggere i propri giocatori collegati ─────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'giocatori' AND policyname = 'giocatori_genitore_own'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY giocatori_genitore_own ON giocatori
        FOR SELECT TO authenticated
        USING (
          genitore_user_id = auth.uid()
          AND societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
        );
    $policy$;
  END IF;
END;
$$;

-- ── NOTE ──────────────────────────────────────────────────────────────────
-- La policy giocatori_segreteria_update già esistente copre l'aggiornamento
-- del campo genitore_user_id da parte della segreteria, nessuna policy extra.
-- Esegui questo file nel Supabase Dashboard → SQL Editor → Run.
