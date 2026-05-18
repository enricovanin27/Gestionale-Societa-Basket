-- ============================================================
-- MIGRATION: Calendario FIP provvisorio/definitivo + DOA
-- Esegui nel SQL Editor di Supabase
-- ============================================================

-- 1. Aggiungi colonne alla tabella calendario
ALTER TABLE calendario ADD COLUMN IF NOT EXISTS stato TEXT DEFAULT 'provvisoria';
ALTER TABLE calendario ADD COLUMN IF NOT EXISTS tipo_import TEXT DEFAULT 'manuale';
ALTER TABLE calendario ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';

-- Popola i record esistenti per retrocompatibilità
UPDATE calendario SET tipo_import = 'manuale' WHERE tipo_import IS NULL OR tipo_import = '';
UPDATE calendario SET stato = 'provvisoria' WHERE stato IS NULL OR stato = '';
UPDATE calendario SET note = '' WHERE note IS NULL;

-- 2. Crea tabella DOA (Disponibilità Orario Accordate)
CREATE TABLE IF NOT EXISTS doa (
    id BIGSERIAL PRIMARY KEY,
    categoria TEXT NOT NULL,
    giorno TEXT NOT NULL,
    ora_inizio TEXT NOT NULL,
    ora_fine TEXT NOT NULL,
    stagione TEXT NOT NULL DEFAULT '2025-2026',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
