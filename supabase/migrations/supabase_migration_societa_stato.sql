-- supabase_migration_societa_stato.sql
-- Aggiunge stato + dati referente per il flusso di auto-registrazione

ALTER TABLE societa
  ADD COLUMN IF NOT EXISTS stato     TEXT NOT NULL DEFAULT 'attiva',
  ADD COLUMN IF NOT EXISTS ref_nome     TEXT,
  ADD COLUMN IF NOT EXISTS ref_cognome  TEXT,
  ADD COLUMN IF NOT EXISTS ref_email    TEXT,
  ADD COLUMN IF NOT EXISTS ref_citta    TEXT;

-- Le società esistenti rimangono 'attiva' per il DEFAULT sopra.
-- Permette agli utenti anonimi di registrare una nuova società (solo pending)
DROP POLICY IF EXISTS "anon_societa_register" ON societa;
CREATE POLICY "anon_societa_register" ON societa
  FOR INSERT TO anon
  WITH CHECK (stato = 'pending');
