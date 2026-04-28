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


-- ────────────────────────────────────────────────────────────
-- TABELLA PROFILES (per il frontend React)
-- Collega auth.users al ruolo applicativo (admin/allenatore/genitore).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT,
    nome        TEXT    NOT NULL DEFAULT '',
    cognome     TEXT    NOT NULL DEFAULT '',
    ruolo       TEXT    NOT NULL DEFAULT 'genitore'
                        CHECK (ruolo IN ('admin', 'allenatore', 'genitore')),
    societa_id  TEXT    NOT NULL DEFAULT '',
    squadra     TEXT    NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger per aggiornare updated_at
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: ogni utente legge solo il proprio profilo
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "profiles_select_own" ON profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

CREATE POLICY IF NOT EXISTS "profiles_update_own" ON profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id);

-- Trigger: crea automaticamente il profilo ad ogni nuovo utente
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, email, ruolo, nome, cognome)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'ruolo', 'genitore'),
        COALESCE(NEW.raw_user_meta_data->>'nome', ''),
        COALESCE(NEW.raw_user_meta_data->>'cognome', '')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Popola profiles per gli utenti già esistenti
INSERT INTO profiles (id, email, ruolo, nome, cognome)
SELECT
    id,
    email,
    COALESCE(raw_user_meta_data->>'ruolo', 'genitore'),
    COALESCE(raw_user_meta_data->>'nome', ''),
    COALESCE(raw_user_meta_data->>'cognome', '')
FROM auth.users
ON CONFLICT (id) DO UPDATE
    SET ruolo   = EXCLUDED.ruolo,
        nome    = EXCLUDED.nome,
        cognome = EXCLUDED.cognome,
        email   = EXCLUDED.email;


-- ────────────────────────────────────────────────────────────
-- FIX RLS — Rimuovi policy che usano 'allenatore' come ruolo
-- PostgreSQL (causerebbe "role 'allenatore' does not exist").
-- Le policy corrette usano TO authenticated, non TO allenatore.
-- ────────────────────────────────────────────────────────────

-- Controlla le policy esistenti con questo SELECT:
-- SELECT tablename, policyname, roles FROM pg_policies
-- WHERE 'allenatore' = ANY(roles);

-- Se il SELECT mostra righe, droppale con:
-- DROP POLICY IF EXISTS "nome_policy" ON nome_tabella;

-- Poi abilita RLS sulle tabelle dati e aggiungi policy corrette:
ALTER TABLE orario_fisso      ENABLE ROW LEVEL SECURITY;
ALTER TABLE orario_settimana  ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario        ENABLE ROW LEVEL SECURITY;
ALTER TABLE squadre           ENABLE ROW LEVEL SECURITY;
ALTER TABLE allenatori        ENABLE ROW LEVEL SECURITY;
ALTER TABLE palestre          ENABLE ROW LEVEL SECURITY;

-- Lettura aperta a tutti gli utenti autenticati
CREATE POLICY IF NOT EXISTS "orario_fisso_read"     ON orario_fisso     FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "orario_settimana_read" ON orario_settimana FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "calendario_read"       ON calendario       FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "squadre_read"          ON squadre          FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "allenatori_read"       ON allenatori       FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "palestre_read"         ON palestre         FOR SELECT TO authenticated USING (true);

-- Scrittura solo per admin (verifica ruolo da profiles)
CREATE POLICY IF NOT EXISTS "orario_fisso_write" ON orario_fisso
    FOR ALL TO authenticated
    USING  ((SELECT ruolo FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK ((SELECT ruolo FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY IF NOT EXISTS "orario_settimana_write" ON orario_settimana
    FOR ALL TO authenticated
    USING  ((SELECT ruolo FROM profiles WHERE id = auth.uid()) IN ('admin','allenatore'))
    WITH CHECK ((SELECT ruolo FROM profiles WHERE id = auth.uid()) IN ('admin','allenatore'));

CREATE POLICY IF NOT EXISTS "calendario_write" ON calendario
    FOR ALL TO authenticated
    USING  ((SELECT ruolo FROM profiles WHERE id = auth.uid()) = 'admin')
    WITH CHECK ((SELECT ruolo FROM profiles WHERE id = auth.uid()) = 'admin');


-- ────────────────────────────────────────────────────────────
-- COLONNE allenatori — richieste dal frontend React
-- ────────────────────────────────────────────────────────────
ALTER TABLE allenatori
    ADD COLUMN IF NOT EXISTS squadre_capo TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS squadre_vice TEXT NOT NULL DEFAULT '';
