-- Crea tabella presenze_allenamento (schema nuovo) senza toccare presenze (usata per RSVP genitori)
CREATE TABLE IF NOT EXISTS presenze_allenamento (
  id            BIGSERIAL PRIMARY KEY,
  societa_id    UUID NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
  allenamento_id BIGINT NOT NULL,
  giocatore_id  BIGINT NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  presente      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (allenamento_id, giocatore_id)
);

ALTER TABLE presenze_allenamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presenze_allenamento_societa" ON presenze_allenamento
  USING (societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "presenze_allenamento_insert" ON presenze_allenamento
  FOR INSERT WITH CHECK (societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "presenze_allenamento_delete" ON presenze_allenamento
  FOR DELETE USING (societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid()));
