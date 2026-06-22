-- Aggiunge colonna quote_template alla tabella societa
-- Struttura JSON attesa:
--   { "rate": [{ "numero": 1, "importo": 150.00, "scadenza": "2026-09-30" }, ...] }
-- La segreteria configura questo template una volta per stagione.
-- Quando si iscrive un nuovo giocatore, le rate vengono create automaticamente.

ALTER TABLE societa
  ADD COLUMN IF NOT EXISTS quote_template JSONB DEFAULT NULL;

COMMENT ON COLUMN societa.quote_template IS
  'Template rate iscrizione: { "rate": [{ "numero": int, "importo": numeric, "scadenza": "YYYY-MM-DD" }] }';
