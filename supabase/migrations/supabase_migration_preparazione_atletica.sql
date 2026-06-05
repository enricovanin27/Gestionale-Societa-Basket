-- ============================================================
-- MIGRATION: Modulo Preparazione Atletica
-- ============================================================

-- 1. Aggiorna constraint ruolo su profiles (aggiunge preparatore_atletico)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_ruolo_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_ruolo_check
  CHECK (ruolo IN ('super_admin','admin','allenatore','genitore','giocatore','segreteria','preparatore_atletico'));

-- 2. Aggiorna policy giocatori per includere preparatore_atletico
DROP POLICY IF EXISTS "giocatori_staff_all" ON giocatori;
CREATE POLICY "giocatori_staff_all" ON giocatori FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','allenatore','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra)
           OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = giocatori.societa_id
  ));

-- 3. Spazi atletici
CREATE TABLE IF NOT EXISTS spazi_atletici (
  id          SERIAL PRIMARY KEY,
  nome        TEXT        NOT NULL,
  tipo        TEXT        NOT NULL DEFAULT 'sala_pesi'
                          CHECK (tipo IN ('palestra','sala_pesi','altro')),
  capienza    INTEGER,
  note        TEXT,
  societa_id  UUID        NOT NULL REFERENCES societa(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE spazi_atletici ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spazi_atletici_prep_all" ON spazi_atletici FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = spazi_atletici.societa_id
  ));
CREATE POLICY "spazi_atletici_coach_read" ON spazi_atletici FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = spazi_atletici.societa_id
  ));

-- 4. Orario fisso spazi
CREATE TABLE IF NOT EXISTS spazi_orario_fisso (
  id          SERIAL PRIMARY KEY,
  spazio_id   INTEGER     NOT NULL REFERENCES spazi_atletici(id) ON DELETE CASCADE,
  giorno      TEXT        NOT NULL
              CHECK (giorno IN ('lunedi','martedi','mercoledi','giovedi','venerdi','sabato','domenica')),
  squadra     TEXT        NOT NULL,
  ora_inizio  TIME        NOT NULL,
  ora_fine    TIME        NOT NULL,
  societa_id  UUID        NOT NULL REFERENCES societa(id)
);
ALTER TABLE spazi_orario_fisso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spazi_orario_fisso_prep_all" ON spazi_orario_fisso FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = spazi_orario_fisso.societa_id
  ));
CREATE POLICY "spazi_orario_fisso_coach_read" ON spazi_orario_fisso FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = spazi_orario_fisso.societa_id
  ));

-- 5. Variazioni settimanali spazi
CREATE TABLE IF NOT EXISTS spazi_orario_settimana (
  id          SERIAL PRIMARY KEY,
  spazio_id   INTEGER     NOT NULL REFERENCES spazi_atletici(id) ON DELETE CASCADE,
  data        DATE        NOT NULL,
  squadra     TEXT        NOT NULL,
  ora_inizio  TIME        NOT NULL,
  ora_fine    TIME        NOT NULL,
  annullato   BOOLEAN     NOT NULL DEFAULT false,
  note        TEXT,
  societa_id  UUID        NOT NULL REFERENCES societa(id)
);
ALTER TABLE spazi_orario_settimana ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spazi_orario_settimana_prep_all" ON spazi_orario_settimana FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = spazi_orario_settimana.societa_id
  ));
CREATE POLICY "spazi_orario_settimana_coach_read" ON spazi_orario_settimana FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = spazi_orario_settimana.societa_id
  ));

-- 6. Tipi di test (configurabili per società)
CREATE TABLE IF NOT EXISTS test_definizioni (
  id          SERIAL PRIMARY KEY,
  nome        TEXT        NOT NULL,
  unita       TEXT        NOT NULL,
  ordine      INTEGER     NOT NULL DEFAULT 0,
  societa_id  UUID        NOT NULL REFERENCES societa(id)
);
ALTER TABLE test_definizioni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test_definizioni_prep_all" ON test_definizioni FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = test_definizioni.societa_id
  ));
CREATE POLICY "test_definizioni_coach_read" ON test_definizioni FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = test_definizioni.societa_id
  ));

-- 7. Risultati test (FK → giocatori, non profiles)
CREATE TABLE IF NOT EXISTS test_risultati (
  id            SERIAL PRIMARY KEY,
  giocatore_id  UUID        NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  test_id       INTEGER     NOT NULL REFERENCES test_definizioni(id) ON DELETE CASCADE,
  valore        NUMERIC     NOT NULL,
  data          DATE        NOT NULL,
  note          TEXT,
  societa_id    UUID        NOT NULL REFERENCES societa(id)
);
ALTER TABLE test_risultati ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test_risultati_prep_all" ON test_risultati FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = test_risultati.societa_id
  ));
CREATE POLICY "test_risultati_coach_read" ON test_risultati FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = test_risultati.societa_id
  ));

-- 8. Test programmati (per card HomePrep "Prossimi test")
CREATE TABLE IF NOT EXISTS test_programmati (
  id          SERIAL PRIMARY KEY,
  test_id     INTEGER     NOT NULL REFERENCES test_definizioni(id) ON DELETE CASCADE,
  squadra     TEXT        NOT NULL,
  data        DATE        NOT NULL,
  note        TEXT,
  societa_id  UUID        NOT NULL REFERENCES societa(id)
);
ALTER TABLE test_programmati ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test_programmati_prep_all" ON test_programmati FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = test_programmati.societa_id
  ));
CREATE POLICY "test_programmati_coach_read" ON test_programmati FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = test_programmati.societa_id
  ));

-- 9. Antropometria (FK → giocatori)
CREATE TABLE IF NOT EXISTS antropometria (
  id                  SERIAL PRIMARY KEY,
  giocatore_id        UUID        NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  data                DATE        NOT NULL,
  altezza_cm          NUMERIC,
  peso_kg             NUMERIC,
  apertura_braccia_cm NUMERIC,
  note                TEXT,
  societa_id          UUID        NOT NULL REFERENCES societa(id)
);
ALTER TABLE antropometria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "antropometria_prep_all" ON antropometria FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = antropometria.societa_id
  ));
CREATE POLICY "antropometria_coach_read" ON antropometria FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = antropometria.societa_id
  ));

-- 10. Infortuni (FK → giocatori)
CREATE TABLE IF NOT EXISTS infortuni (
  id                     SERIAL PRIMARY KEY,
  giocatore_id           UUID        NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  tipo                   TEXT        NOT NULL,
  gravita                TEXT        NOT NULL CHECK (gravita IN ('lieve','moderato','grave')),
  data_inizio            DATE        NOT NULL,
  data_rientro_prevista  DATE,
  data_rientro_effettiva DATE,
  stato                  TEXT        NOT NULL DEFAULT 'attivo'
                         CHECK (stato IN ('attivo','risolto')),
  note                   TEXT,
  societa_id             UUID        NOT NULL REFERENCES societa(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE infortuni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "infortuni_prep_all" ON infortuni FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = infortuni.societa_id
  ));
CREATE POLICY "infortuni_coach_read" ON infortuni FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = infortuni.societa_id
  ));

-- 11. RPE sessioni (FK → giocatori)
CREATE TABLE IF NOT EXISTS rpe_sessioni (
  id              SERIAL PRIMARY KEY,
  giocatore_id    UUID        NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  data            DATE        NOT NULL,
  tipo_sessione   TEXT        NOT NULL DEFAULT 'allenamento'
                  CHECK (tipo_sessione IN ('allenamento','partita','pesi')),
  valore_rpe      INTEGER     NOT NULL CHECK (valore_rpe BETWEEN 1 AND 10),
  note            TEXT,
  societa_id      UUID        NOT NULL REFERENCES societa(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (giocatore_id, data, tipo_sessione)
);
ALTER TABLE rpe_sessioni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rpe_sessioni_prep_all" ON rpe_sessioni FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = rpe_sessioni.societa_id
  ));
CREATE POLICY "rpe_sessioni_coach_read" ON rpe_sessioni FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo = 'allenatore' OR 'allenatore' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = rpe_sessioni.societa_id
  ));
CREATE POLICY "rpe_sessioni_giocatore_insert" ON rpe_sessioni FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM giocatori
      WHERE giocatori.id = rpe_sessioni.giocatore_id
        AND giocatori.user_id = auth.uid())
  );
CREATE POLICY "rpe_sessioni_giocatore_select" ON rpe_sessioni FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM giocatori
      WHERE giocatori.id = rpe_sessioni.giocatore_id
        AND giocatori.user_id = auth.uid())
  );

-- 12. Schede atletiche
CREATE TABLE IF NOT EXISTS schede_atletiche (
  id            SERIAL PRIMARY KEY,
  nome          TEXT        NOT NULL,
  categoria     TEXT        NOT NULL
                CHECK (categoria IN ('riscaldamento','forza','mobilita','recupero','altro')),
  descrizione   TEXT,
  esercizi      JSONB       NOT NULL DEFAULT '[]',
  societa_id    UUID        NOT NULL REFERENCES societa(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE schede_atletiche ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schede_atletiche_prep_all" ON schede_atletiche FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = schede_atletiche.societa_id
  ));

-- 13. Assegnazioni schede
CREATE TABLE IF NOT EXISTS schede_assegnazioni (
  id           SERIAL PRIMARY KEY,
  scheda_id    INTEGER     NOT NULL REFERENCES schede_atletiche(id) ON DELETE CASCADE,
  squadra      TEXT,
  giocatore_id UUID        REFERENCES giocatori(id) ON DELETE CASCADE,
  data_inizio  DATE        NOT NULL,
  data_fine    DATE,
  societa_id   UUID        NOT NULL REFERENCES societa(id),
  CHECK (squadra IS NOT NULL OR giocatore_id IS NOT NULL)
);
ALTER TABLE schede_assegnazioni ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schede_assegnazioni_prep_all" ON schede_assegnazioni FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
      AND (profiles.ruolo IN ('admin','super_admin','preparatore_atletico')
           OR 'preparatore_atletico' = ANY(profiles.ruoli_extra))
      AND profiles.societa_id = schede_assegnazioni.societa_id
  ));
