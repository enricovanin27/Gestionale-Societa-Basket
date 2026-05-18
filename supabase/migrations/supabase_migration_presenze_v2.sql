-- ============================================================
-- MIGRAZIONE: Ricrea tabella presenze con schema corretto
-- Esegui nel SQL Editor di Supabase
-- ATTENZIONE: elimina i dati esistenti nella tabella presenze
-- ============================================================

-- Rimuovi la vecchia tabella (aveva schema incompatibile: data, squadra, user_id, risposta)
DROP TABLE IF EXISTS presenze CASCADE;

-- Crea la nuova tabella presenze per allenamento
CREATE TABLE presenze (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  allenamento_id uuid REFERENCES orario_settimana(id) ON DELETE CASCADE,
  giocatore_id   uuid REFERENCES giocatori(id) ON DELETE CASCADE,
  presente       boolean NOT NULL DEFAULT false,
  societa_id     uuid REFERENCES societa(id) ON DELETE CASCADE,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(allenamento_id, giocatore_id)
);

ALTER TABLE presenze ENABLE ROW LEVEL SECURITY;

-- Allenatori e admin possono leggere/scrivere presenze della propria società
CREATE POLICY "presenze_societa_access" ON presenze
  FOR ALL TO authenticated
  USING (
    societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
  );

-- Giocatori possono leggere le proprie presenze
CREATE POLICY "presenze_giocatore_read" ON presenze
  FOR SELECT TO authenticated
  USING (
    giocatore_id IN (
      SELECT g.id FROM giocatori g
      JOIN profiles p ON p.nome = g.nome AND p.cognome = g.cognome AND p.societa_id = g.societa_id
      WHERE p.id = auth.uid()
    )
  );
