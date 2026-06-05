-- ─────────────────────────────────────────────────────────────────────────────
-- Migrazione: risultati partite
-- Eseguire su Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────
-- Aggiunge le colonne per il punteggio finale alla tabella calendario.
--
-- Convenzione:
--   punti_casa    = punti della squadra di CASA (indipendente da chi siamo noi)
--   punti_ospiti  = punti della squadra OSPITE
--   Entrambi NULL finché il risultato non viene inserito.
--
-- Win/loss lato frontend:
--   partita in casa (casa_fuori='Casa')   → vittoria se punti_casa > punti_ospiti
--   partita in trasferta                  → vittoria se punti_ospiti > punti_casa
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE calendario ADD COLUMN IF NOT EXISTS punti_casa   SMALLINT;
ALTER TABLE calendario ADD COLUMN IF NOT EXISTS punti_ospiti SMALLINT;
