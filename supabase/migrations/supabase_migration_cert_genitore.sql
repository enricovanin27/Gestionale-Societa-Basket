-- ─────────────────────────────────────────────────────────────────────────────
-- Migrazione: upload certificato medico da parte del genitore
-- Eseguire su Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Permetti ai genitori di aggiornare cert_medico_url per i propri figli
--    (solo il campo URL, non altri dati sensibili — limitato tramite funzione SECURITY DEFINER)
CREATE OR REPLACE FUNCTION update_cert_url_genitore(p_giocatore_id UUID, p_url TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE giocatori
  SET cert_medico_url = p_url
  WHERE id             = p_giocatore_id
    AND genitore_user_id = auth.uid()
    AND attivo          = true;
END;
$$;

-- Revoca accesso diretto, lascia solo la funzione
REVOKE ALL ON FUNCTION update_cert_url_genitore(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_cert_url_genitore(UUID, TEXT) TO authenticated;

-- 2. Storage: policy per permettere ai genitori di caricare certificati
--    (bucket 'certificati' deve già esistere — creato dalla segreteria)
--    Permetti INSERT solo se autenticati
DO $$
BEGIN
  -- Inserisci policy solo se non esiste già
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'Authenticated users can upload to certificati'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can upload to certificati"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'certificati'
        AND auth.uid() IS NOT NULL
      )
    $policy$;
  END IF;

  -- Permetti lettura a tutti gli autenticati
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'Authenticated users can read certificati'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Authenticated users can read certificati"
      ON storage.objects FOR SELECT
      USING (
        bucket_id = 'certificati'
        AND auth.uid() IS NOT NULL
      )
    $policy$;
  END IF;
END $$;
