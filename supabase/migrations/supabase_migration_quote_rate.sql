-- ============================================================
-- MIGRAZIONE: rate di pagamento per le quote
-- Aggiunge numero_rata e rate_totali alla tabella quote
-- Ogni rata è una riga separata con la propria scadenza/stato
-- ============================================================

ALTER TABLE quote
  ADD COLUMN IF NOT EXISTS numero_rata  INTEGER,
  ADD COLUMN IF NOT EXISTS rate_totali  INTEGER;

-- Opzionale: vincolo di coerenza (se presente, entrambi devono esserci)
ALTER TABLE quote
  ADD CONSTRAINT check_rate_coerenza
    CHECK (
      (numero_rata IS NULL AND rate_totali IS NULL) OR
      (numero_rata IS NOT NULL AND rate_totali IS NOT NULL AND numero_rata BETWEEN 1 AND rate_totali AND rate_totali BETWEEN 1 AND 3)
    );
