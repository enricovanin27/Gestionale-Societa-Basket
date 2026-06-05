-- Tabella presenze agli allenamenti
CREATE TABLE IF NOT EXISTS presenze (
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
  USING (
    societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
  );

-- Giocatori possono leggere le proprie presenze
CREATE POLICY "presenze_giocatore_read" ON presenze
  FOR SELECT
  USING (
    giocatore_id IN (
      SELECT g.id FROM giocatori g
      JOIN profiles p ON p.nome = g.nome AND p.cognome = g.cognome AND p.societa_id = g.societa_id
      WHERE p.id = auth.uid()
    )
  );
