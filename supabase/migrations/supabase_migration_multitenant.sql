-- ============================================================
-- MIGRAZIONE MULTI-TENANCY — Oderzo Basket
-- Esegui nel SQL Editor di Supabase (una sola volta).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 0a. Elimina TUTTE le policy esistenti sulle tabelle coinvolte
--     (necessario prima di ALTER COLUMN TYPE su profiles.societa_id)
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 0b. Prerequisiti mancanti da sessioni precedenti
-- ────────────────────────────────────────────────────────────

-- Colonne squadra2/3 su profiles (genitore con più squadre)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS squadra2 TEXT,
  ADD COLUMN IF NOT EXISTS squadra3 TEXT;

-- Colonna stato su calendario
ALTER TABLE calendario
  ADD COLUMN IF NOT EXISTS stato TEXT NOT NULL DEFAULT 'definitiva';

-- Tabella doppio_campionato
CREATE TABLE IF NOT EXISTS doppio_campionato (
  id         SERIAL      PRIMARY KEY,
  squadra_a  TEXT        NOT NULL,
  squadra_b  TEXT        NOT NULL,
  note       TEXT        DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (squadra_a, squadra_b)
);

-- ────────────────────────────────────────────────────────────
-- 1. Tabella societa
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS societa (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT        NOT NULL UNIQUE,
  piano      TEXT        NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aggiunge colonne mancanti se la tabella esisteva già senza di esse
ALTER TABLE societa ADD COLUMN IF NOT EXISTS piano      TEXT        NOT NULL DEFAULT 'free';
ALTER TABLE societa ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Aggiunge vincolo UNIQUE su nome se mancante (tabella creata senza in run precedenti)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'societa_nome_key' AND conrelid = 'societa'::regclass
  ) THEN
    ALTER TABLE societa ADD CONSTRAINT societa_nome_key UNIQUE (nome);
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. Aggiunta colonna societa_id alle tabelle dati
-- ────────────────────────────────────────────────────────────

ALTER TABLE squadre          ADD COLUMN IF NOT EXISTS societa_id UUID REFERENCES societa(id);
ALTER TABLE palestre         ADD COLUMN IF NOT EXISTS societa_id UUID REFERENCES societa(id);
ALTER TABLE allenatori       ADD COLUMN IF NOT EXISTS societa_id UUID REFERENCES societa(id);
ALTER TABLE orario_fisso     ADD COLUMN IF NOT EXISTS societa_id UUID REFERENCES societa(id);
ALTER TABLE orario_settimana ADD COLUMN IF NOT EXISTS societa_id UUID REFERENCES societa(id);
ALTER TABLE calendario       ADD COLUMN IF NOT EXISTS societa_id UUID REFERENCES societa(id);
ALTER TABLE doppio_campionato ADD COLUMN IF NOT EXISTS societa_id UUID REFERENCES societa(id);

-- Converti profiles.societa_id da TEXT a UUID (righe vuote → NULL)
ALTER TABLE profiles ALTER COLUMN societa_id DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN societa_id DROP DEFAULT;
ALTER TABLE profiles ALTER COLUMN societa_id TYPE UUID
  USING NULLIF(TRIM(societa_id::TEXT), '')::UUID;

-- Aggiunge super_admin al ruolo
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_ruolo_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_ruolo_check
  CHECK (ruolo IN ('super_admin', 'admin', 'allenatore', 'genitore'));

-- Vincoli unicità per-società (invece di unicità globale)
ALTER TABLE squadre      DROP CONSTRAINT IF EXISTS squadre_categoria_key;
ALTER TABLE squadre      ADD CONSTRAINT  squadre_categoria_societa UNIQUE (categoria, societa_id);

ALTER TABLE palestre     DROP CONSTRAINT IF EXISTS palestre_nome_key;
ALTER TABLE palestre     ADD CONSTRAINT  palestre_nome_societa     UNIQUE (nome, societa_id);

ALTER TABLE allenatori   DROP CONSTRAINT IF EXISTS allenatori_nome_cognome_key;
ALTER TABLE allenatori   ADD CONSTRAINT  allenatori_nome_cognome_societa UNIQUE (nome, cognome, societa_id);

ALTER TABLE orario_fisso DROP CONSTRAINT IF EXISTS orario_fisso_giorno_palestra_squadra_ora_inizio_key;
ALTER TABLE orario_fisso ADD CONSTRAINT  orario_fisso_unique UNIQUE (giorno, palestra, squadra, ora_inizio, societa_id);

ALTER TABLE doppio_campionato DROP CONSTRAINT IF EXISTS doppio_campionato_squadra_a_squadra_b_key;
ALTER TABLE doppio_campionato ADD CONSTRAINT  doppio_unique UNIQUE (squadra_a, squadra_b, societa_id);

-- ────────────────────────────────────────────────────────────
-- 3. Helper SECURITY DEFINER (evita loop RLS su profiles)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_societa_id()
RETURNS UUID AS $$
  SELECT societa_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT ruolo FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ────────────────────────────────────────────────────────────
-- 4. Popola Oderzo Basket e migra dati esistenti
-- ────────────────────────────────────────────────────────────

INSERT INTO societa (nome, piano, slug)
VALUES ('Oderzo Basket', 'pro', 'oderzo-basket')
ON CONFLICT (nome) DO NOTHING;

DO $$
DECLARE oderzo_id UUID;
BEGIN
  SELECT id INTO oderzo_id FROM societa WHERE nome = 'Oderzo Basket';

  UPDATE squadre           SET societa_id = oderzo_id WHERE societa_id IS NULL;
  UPDATE palestre          SET societa_id = oderzo_id WHERE societa_id IS NULL;
  UPDATE allenatori        SET societa_id = oderzo_id WHERE societa_id IS NULL;
  UPDATE orario_fisso      SET societa_id = oderzo_id WHERE societa_id IS NULL;
  UPDATE orario_settimana  SET societa_id = oderzo_id WHERE societa_id IS NULL;
  UPDATE calendario        SET societa_id = oderzo_id WHERE societa_id IS NULL;
  UPDATE doppio_campionato SET societa_id = oderzo_id WHERE societa_id IS NULL;
  UPDATE profiles          SET societa_id = oderzo_id WHERE societa_id IS NULL;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 5. RLS: isolamento per società
-- ────────────────────────────────────────────────────────────

-- societa: lettura pubblica agli autenticati, scrittura solo super_admin
ALTER TABLE societa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "societa_read"  ON societa;
DROP POLICY IF EXISTS "societa_write" ON societa;
CREATE POLICY "societa_read"  ON societa FOR SELECT TO authenticated USING (true);
CREATE POLICY "societa_write" ON societa FOR ALL    TO authenticated
  USING  (get_my_role() = 'super_admin')
  WITH CHECK (get_my_role() = 'super_admin');

-- ── squadre ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "squadre_read"  ON squadre;
DROP POLICY IF EXISTS "squadre_write" ON squadre;
CREATE POLICY "squadre_read" ON squadre FOR SELECT TO authenticated
  USING (societa_id = get_my_societa_id() OR get_my_role() = 'super_admin');
CREATE POLICY "squadre_write" ON squadre FOR ALL TO authenticated
  USING  (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','super_admin'))
  WITH CHECK (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','super_admin'));

-- ── palestre ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "palestre_read"  ON palestre;
DROP POLICY IF EXISTS "palestre_write" ON palestre;
CREATE POLICY "palestre_read" ON palestre FOR SELECT TO authenticated
  USING (societa_id = get_my_societa_id() OR get_my_role() = 'super_admin');
CREATE POLICY "palestre_write" ON palestre FOR ALL TO authenticated
  USING  (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','super_admin'))
  WITH CHECK (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','super_admin'));

-- ── allenatori ───────────────────────────────────────────────
DROP POLICY IF EXISTS "allenatori_read"  ON allenatori;
DROP POLICY IF EXISTS "allenatori_write" ON allenatori;
CREATE POLICY "allenatori_read" ON allenatori FOR SELECT TO authenticated
  USING (societa_id = get_my_societa_id() OR get_my_role() = 'super_admin');
CREATE POLICY "allenatori_write" ON allenatori FOR ALL TO authenticated
  USING  (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','super_admin'))
  WITH CHECK (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','super_admin'));

-- ── orario_fisso ─────────────────────────────────────────────
DROP POLICY IF EXISTS "orario_fisso_read"  ON orario_fisso;
DROP POLICY IF EXISTS "orario_fisso_write" ON orario_fisso;
CREATE POLICY "orario_fisso_read" ON orario_fisso FOR SELECT TO authenticated
  USING (societa_id = get_my_societa_id() OR get_my_role() = 'super_admin');
CREATE POLICY "orario_fisso_write" ON orario_fisso FOR ALL TO authenticated
  USING  (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','super_admin'))
  WITH CHECK (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','super_admin'));

-- ── orario_settimana ─────────────────────────────────────────
DROP POLICY IF EXISTS "orario_settimana_read"  ON orario_settimana;
DROP POLICY IF EXISTS "orario_settimana_write" ON orario_settimana;
CREATE POLICY "orario_settimana_read" ON orario_settimana FOR SELECT TO authenticated
  USING (societa_id = get_my_societa_id() OR get_my_role() = 'super_admin');
CREATE POLICY "orario_settimana_write" ON orario_settimana FOR ALL TO authenticated
  USING  (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','allenatore','super_admin'))
  WITH CHECK (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','allenatore','super_admin'));

-- ── calendario ───────────────────────────────────────────────
DROP POLICY IF EXISTS "calendario_read"  ON calendario;
DROP POLICY IF EXISTS "calendario_write" ON calendario;
CREATE POLICY "calendario_read" ON calendario FOR SELECT TO authenticated
  USING (societa_id = get_my_societa_id() OR get_my_role() = 'super_admin');
CREATE POLICY "calendario_write" ON calendario FOR ALL TO authenticated
  USING  (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','allenatore','super_admin'))
  WITH CHECK (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','allenatore','super_admin'));

-- ── doppio_campionato ────────────────────────────────────────
ALTER TABLE doppio_campionato ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doppio_read"  ON doppio_campionato;
DROP POLICY IF EXISTS "doppio_write" ON doppio_campionato;
CREATE POLICY "doppio_read" ON doppio_campionato FOR SELECT TO authenticated
  USING (societa_id = get_my_societa_id() OR get_my_role() = 'super_admin');
CREATE POLICY "doppio_write" ON doppio_campionato FOR ALL TO authenticated
  USING  (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','super_admin'))
  WITH CHECK (societa_id = get_my_societa_id() AND get_my_role() IN ('admin','super_admin'));

-- ── profiles ────────────────────────────────────────────────
-- Admin vede/modifica solo i profili della propria società
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;

CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR (
      get_my_role() IN ('admin','super_admin')
      AND (societa_id = get_my_societa_id() OR get_my_role() = 'super_admin')
    )
  );

CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated
  USING (
    auth.uid() = id
    OR (
      get_my_role() IN ('admin','super_admin')
      AND (societa_id = get_my_societa_id() OR get_my_role() = 'super_admin')
    )
  );

-- ────────────────────────────────────────────────────────────
-- 6. Aggiorna il trigger per propagare societa_id dalla metadata
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, ruolo, nome, cognome, societa_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'ruolo', 'genitore'),
    COALESCE(NEW.raw_user_meta_data->>'nome',    ''),
    COALESCE(NEW.raw_user_meta_data->>'cognome', ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'societa_id', '')), '')::UUID
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
