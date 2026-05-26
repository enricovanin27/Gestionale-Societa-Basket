-- ─────────────────────────────────────────────────────────────────────────────
-- Migrazione: ruolo dirigente
-- Eseguire su Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────
-- Il ruolo 'dirigente' ha accesso READ-ONLY a:
--   - giocatori (cert, conteggi)
--   - quote (panoramica economica)
--   - orario_settimana (allenamenti cancellati)
--   - presenze_allenamento (presenze per squadra)
--   - annunci (bacheca)
-- Non può CREATE/UPDATE/DELETE nulla.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: societa_id dell'utente corrente
-- (già esiste come funzione in alcune configurazioni; creiamo per sicurezza)
CREATE OR REPLACE FUNCTION auth_societa_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT societa_id FROM profiles WHERE id = auth.uid() LIMIT 1
$$;

-- ── quote: SELECT per dirigente ──────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='quote' AND policyname='Dirigente read quote'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Dirigente read quote" ON quote
      FOR SELECT USING (
        societa_id = auth_societa_id()
        AND (SELECT ruolo FROM profiles WHERE id = auth.uid()) = 'dirigente'
      )
    $p$;
  END IF;
END $$;

-- ── presenze_allenamento: SELECT per dirigente ───────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='presenze_allenamento' AND policyname='Dirigente read presenze'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Dirigente read presenze" ON presenze_allenamento
      FOR SELECT USING (
        societa_id = auth_societa_id()
        AND (SELECT ruolo FROM profiles WHERE id = auth.uid()) = 'dirigente'
      )
    $p$;
  END IF;
END $$;

-- ── giocatori: SELECT per dirigente ─────────────────────────────────────────
-- (se già esiste una policy aperta a tutti gli autenticati, questa è ridondante
--  ma non crea conflitti — Supabase fa OR fra le policy)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='giocatori' AND policyname='Dirigente read giocatori'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Dirigente read giocatori" ON giocatori
      FOR SELECT USING (
        societa_id = auth_societa_id()
        AND (SELECT ruolo FROM profiles WHERE id = auth.uid()) = 'dirigente'
      )
    $p$;
  END IF;
END $$;

-- ── orario_settimana: SELECT per dirigente ───────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='orario_settimana' AND policyname='Dirigente read orario_settimana'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Dirigente read orario_settimana" ON orario_settimana
      FOR SELECT USING (
        societa_id = auth_societa_id()
        AND (SELECT ruolo FROM profiles WHERE id = auth.uid()) = 'dirigente'
      )
    $p$;
  END IF;
END $$;

-- ── annunci/bacheca: SELECT per dirigente ────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='annunci' AND policyname='Dirigente read annunci'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Dirigente read annunci" ON annunci
      FOR SELECT USING (
        societa_id = auth_societa_id()
        AND (SELECT ruolo FROM profiles WHERE id = auth.uid()) = 'dirigente'
      )
    $p$;
  END IF;
END $$;

-- ── profiles: SELECT per se stesso (già dovrebbe esistere) ───────────────────
-- Nessuna modifica necessaria se la policy "Users can read their own profile"
-- è già presente.

-- ─────────────────────────────────────────────────────────────────────────────
-- COME CREARE UN ACCOUNT DIRIGENTE:
-- 1. Invitare l'utente dalla pagina Impostazioni (già funziona per segreteria)
-- 2. Oppure manualmente:
--    UPDATE profiles SET ruolo = 'dirigente' WHERE email = 'nome@email.com';
-- ─────────────────────────────────────────────────────────────────────────────
