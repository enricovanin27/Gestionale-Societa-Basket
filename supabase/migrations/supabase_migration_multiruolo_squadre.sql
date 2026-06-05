-- ============================================================
-- Migrazione: squadre separate per ruolo genitore
-- ============================================================
-- Aggiunge colonne genitore_squadra/2/3 a profiles, separate
-- da squadra/2/3 (che rimangono per il ruolo giocatore).
-- Migra i dati esistenti per i profili con ruolo='genitore'.
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS genitore_squadra  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS genitore_squadra2 text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS genitore_squadra3 text;

-- Copia i valori esistenti di squadra/2/3 nei nuovi campi
-- solo per i profili il cui ruolo principale è 'genitore'
-- e che non hanno ancora i nuovi campi valorizzati.
UPDATE profiles
SET
  genitore_squadra  = squadra,
  genitore_squadra2 = squadra2,
  genitore_squadra3 = squadra3
WHERE ruolo = 'genitore'
  AND genitore_squadra IS NULL
  AND (squadra IS NOT NULL OR squadra2 IS NOT NULL OR squadra3 IS NOT NULL);

-- Verifica: prep_squadre deve già esistere (da supabase_migration_prep_v2.sql)
-- Se non esiste, creala:
CREATE TABLE IF NOT EXISTS prep_squadre (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societa_id    uuid REFERENCES societa(id) ON DELETE CASCADE,
  preparatore_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  squadra       text NOT NULL,
  UNIQUE (societa_id, preparatore_id, squadra)
);

-- RLS per prep_squadre (admin può gestire)
ALTER TABLE prep_squadre ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prep_squadre_select" ON prep_squadre;
CREATE POLICY "prep_squadre_select" ON prep_squadre
  FOR SELECT TO authenticated
  USING (societa_id = get_my_societa_id());

DROP POLICY IF EXISTS "prep_squadre_insert" ON prep_squadre;
CREATE POLICY "prep_squadre_insert" ON prep_squadre
  FOR INSERT TO authenticated
  WITH CHECK (
    societa_id = get_my_societa_id()
    AND get_my_role() IN ('admin', 'super_admin')
  );

DROP POLICY IF EXISTS "prep_squadre_delete" ON prep_squadre;
CREATE POLICY "prep_squadre_delete" ON prep_squadre
  FOR DELETE TO authenticated
  USING (
    societa_id = get_my_societa_id()
    AND get_my_role() IN ('admin', 'super_admin')
  );
