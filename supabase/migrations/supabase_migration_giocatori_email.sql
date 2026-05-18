-- ============================================================
-- MIGRAZIONE: Aggiunge colonna email a giocatori
-- Esegui nel SQL Editor di Supabase
-- ============================================================

ALTER TABLE giocatori ADD COLUMN IF NOT EXISTS email TEXT;
