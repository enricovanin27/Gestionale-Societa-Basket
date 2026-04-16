-- ============================================================
-- SCHEMA SUPABASE — Oderzo Basket Gestione Spazi
-- Esegui questo script nel SQL Editor di Supabase.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SQUADRE
-- Colonne Google Sheets: Categoria, Minuti Riscaldamento,
--   Durata Partita, Lunedi, Martedi, Mercoledi, Giovedi,
--   Venerdi, Sabato, Domenica
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS squadre (
    id                    SERIAL PRIMARY KEY,
    categoria             TEXT        NOT NULL UNIQUE,
    minuti_riscaldamento  INTEGER     NOT NULL DEFAULT 30,
    durata_partita        INTEGER     NOT NULL DEFAULT 105,
    lunedi                TEXT        NOT NULL DEFAULT 'NO' CHECK (lunedi    IN ('SI','NO')),
    martedi               TEXT        NOT NULL DEFAULT 'NO' CHECK (martedi   IN ('SI','NO')),
    mercoledi             TEXT        NOT NULL DEFAULT 'NO' CHECK (mercoledi IN ('SI','NO')),
    giovedi               TEXT        NOT NULL DEFAULT 'NO' CHECK (giovedi   IN ('SI','NO')),
    venerdi               TEXT        NOT NULL DEFAULT 'NO' CHECK (venerdi   IN ('SI','NO')),
    sabato                TEXT        NOT NULL DEFAULT 'NO' CHECK (sabato    IN ('SI','NO')),
    domenica              TEXT        NOT NULL DEFAULT 'NO' CHECK (domenica  IN ('SI','NO')),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ────────────────────────────────────────────────────────────
-- PALESTRE
-- Colonne Google Sheets: Nome, Orario Inizio, Orario Fine,
--   Lunedi, Martedi, Mercoledi, Giovedi, Venerdi, Sabato,
--   Domenica
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS palestre (
    id            SERIAL PRIMARY KEY,
    nome          TEXT        NOT NULL UNIQUE,
    orario_inizio TIME        NOT NULL DEFAULT '15:00',
    orario_fine   TIME        NOT NULL DEFAULT '22:00',
    lunedi        TEXT        NOT NULL DEFAULT 'NO' CHECK (lunedi    IN ('SI','NO')),
    martedi       TEXT        NOT NULL DEFAULT 'NO' CHECK (martedi   IN ('SI','NO')),
    mercoledi     TEXT        NOT NULL DEFAULT 'NO' CHECK (mercoledi IN ('SI','NO')),
    giovedi       TEXT        NOT NULL DEFAULT 'NO' CHECK (giovedi   IN ('SI','NO')),
    venerdi       TEXT        NOT NULL DEFAULT 'NO' CHECK (venerdi   IN ('SI','NO')),
    sabato        TEXT        NOT NULL DEFAULT 'NO' CHECK (sabato    IN ('SI','NO')),
    domenica      TEXT        NOT NULL DEFAULT 'NO' CHECK (domenica  IN ('SI','NO')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ────────────────────────────────────────────────────────────
-- ALLENATORI
-- Colonne Google Sheets: Nome, Cognome, Email, Squadre
-- (Squadre = stringa inline con ruoli, es.
--  "U18 (Capo allenatore), U15 (Assistente)")
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS allenatori (
    id         SERIAL PRIMARY KEY,
    nome       TEXT        NOT NULL,
    cognome    TEXT        NOT NULL,
    email      TEXT        NOT NULL DEFAULT '',
    squadre    TEXT        NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (nome, cognome)
);


-- ────────────────────────────────────────────────────────────
-- ORARIO FISSO
-- Colonne Google Sheets: giorno, palestra, squadra,
--   ora_inizio, ora_fine, allenatori, condivisione
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orario_fisso (
    id           SERIAL PRIMARY KEY,
    giorno       TEXT        NOT NULL,
    palestra     TEXT        NOT NULL,
    squadra      TEXT        NOT NULL,
    ora_inizio   TIME        NOT NULL,
    ora_fine     TIME        NOT NULL,
    allenatori   TEXT        NOT NULL DEFAULT '',
    condivisione TEXT        NOT NULL DEFAULT 'NO' CHECK (condivisione IN ('SI','NO')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (giorno, palestra, squadra, ora_inizio)
);


-- ────────────────────────────────────────────────────────────
-- CALENDARIO (Calendario Definitivo)
-- Colonne Google Sheets: Data, Giorno, Squadra, Tipo,
--   Avversario, Ora Inizio, Ora Fine, Casa/Fuori, Palestra
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendario (
    id          SERIAL PRIMARY KEY,
    data        DATE        NOT NULL,
    giorno      TEXT        NOT NULL DEFAULT '',
    squadra     TEXT        NOT NULL,
    tipo        TEXT        NOT NULL,
    avversario  TEXT        NOT NULL DEFAULT '',
    ora_inizio  TIME,
    ora_fine    TIME,
    casa_fuori  TEXT        NOT NULL DEFAULT '' CHECK (casa_fuori IN ('Casa','Fuori Casa','',
                                                                      'Allenamento spostato')),
    palestra    TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ────────────────────────────────────────────────────────────
-- ORARIO SETTIMANA (override/variazioni per settimana specifica)
-- Sostituisce o integra orario_fisso per date specifiche.
-- annullato=TRUE → l'allenamento di quel giorno è cancellato.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orario_settimana (
    id           SERIAL PRIMARY KEY,
    data         DATE        NOT NULL,
    giorno       TEXT        NOT NULL DEFAULT '',
    palestra     TEXT        NOT NULL DEFAULT '',
    squadra      TEXT        NOT NULL,
    ora_inizio   TIME        NOT NULL,
    ora_fine     TIME        NOT NULL,
    allenatori   TEXT        NOT NULL DEFAULT '',
    condivisione TEXT        NOT NULL DEFAULT 'NO' CHECK (condivisione IN ('SI','NO')),
    annullato    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orario_settimana_data
    ON orario_settimana (data);

CREATE INDEX IF NOT EXISTS idx_orario_settimana_squadra
    ON orario_settimana (squadra);


-- ────────────────────────────────────────────────────────────
-- Trigger updated_at (facoltativo ma utile)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['squadre','palestre','allenatori','orario_fisso','orario_settimana','calendario']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            t, t
        );
    END LOOP;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- Indici per le query più frequenti
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orario_fisso_giorno_palestra
    ON orario_fisso (giorno, palestra);

CREATE INDEX IF NOT EXISTS idx_orario_fisso_squadra
    ON orario_fisso (squadra);

CREATE INDEX IF NOT EXISTS idx_calendario_data
    ON calendario (data);

CREATE INDEX IF NOT EXISTS idx_calendario_squadra
    ON calendario (squadra);

CREATE INDEX IF NOT EXISTS idx_calendario_tipo
    ON calendario (tipo);


-- ────────────────────────────────────────────────────────────
-- AGGIUNTE NUOVE FUNZIONALITÀ
-- Esegui questo blocco nel SQL Editor di Supabase se hai già
-- le tabelle create. Le istruzioni sono idempotenti (IF NOT EXISTS
-- / DEFAULT garantisce retrocompatibilità).
-- ────────────────────────────────────────────────────────────

-- Feature 1: Flag allenamenti (normale / importante / annullato / da_confermare)
ALTER TABLE orario_settimana
    ADD COLUMN IF NOT EXISTS flag TEXT NOT NULL DEFAULT 'normale';

-- Feature 5: Tipo palestra (Principale / Secondaria / Esterna)
ALTER TABLE palestre
    ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'Principale';

-- Feature 6: Zone della palestra (es. "Campo principale,Zona fisica")
ALTER TABLE palestre
    ADD COLUMN IF NOT EXISTS zone TEXT NOT NULL DEFAULT '';

-- Feature 6: Zona usata dall'allenamento (es. "Campo principale")
ALTER TABLE orario_fisso
    ADD COLUMN IF NOT EXISTS zona TEXT NOT NULL DEFAULT '';
ALTER TABLE orario_settimana
    ADD COLUMN IF NOT EXISTS zona TEXT NOT NULL DEFAULT '';
