-- ============================================================
-- FIX: Adatta tabelle già create a UUID e array squadre
-- Esegui nel SQL Editor di Supabase
-- ============================================================

-- ── push_subscriptions: squadra TEXT → squadre TEXT[] ────────
ALTER TABLE push_subscriptions RENAME COLUMN squadra TO squadre_old;
ALTER TABLE push_subscriptions ADD COLUMN squadre TEXT[] NOT NULL DEFAULT '{}';
UPDATE push_subscriptions SET squadre = ARRAY[squadre_old] WHERE squadre_old IS NOT NULL AND squadre_old <> '';
ALTER TABLE push_subscriptions DROP COLUMN squadre_old;
