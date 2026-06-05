-- Fix: aggiungi vincoli UNIQUE mancanti usati dal frontend nelle query upsert

-- 1. orario_settimana: una sola riga per (societa, data, squadra)
--    Necessario per upsert e per maybeSingle() in saveToSettimana
ALTER TABLE orario_settimana
  ADD CONSTRAINT IF NOT EXISTS orario_settimana_societa_data_squadra_unique
  UNIQUE (societa_id, data, squadra);

-- 2. presenze_allenamento: una sola presenze per (giocatore, data)
--    La tabella ha già UNIQUE(allenamento_id, giocatore_id) ma il codice usa (giocatore_id, data)
ALTER TABLE presenze_allenamento
  ADD CONSTRAINT IF NOT EXISTS presenze_allenamento_giocatore_data_unique
  UNIQUE (giocatore_id, data);
