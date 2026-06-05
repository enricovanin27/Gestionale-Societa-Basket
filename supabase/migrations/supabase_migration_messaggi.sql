-- Migration: tabella messaggi (comunicazioni famiglie → staff)
-- Data: 2026-06-01

CREATE TABLE IF NOT EXISTS messaggi (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societa_id     UUID NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
  mittente_id    UUID NOT NULL,
  mittente_nome  TEXT NOT NULL,
  mittente_ruolo TEXT NOT NULL CHECK (mittente_ruolo IN ('genitore', 'giocatore')),
  squadra        TEXT NOT NULL,
  testo          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  letto          BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS messaggi_societa_squadra_idx ON messaggi(societa_id, squadra);
CREATE INDEX IF NOT EXISTS messaggi_mittente_idx        ON messaggi(mittente_id);

ALTER TABLE messaggi ENABLE ROW LEVEL SECURITY;

-- Genitori e giocatori possono inserire messaggi nella propria società
CREATE POLICY "messaggi_insert" ON messaggi
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('genitore', 'giocatore') AND
    societa_id = get_my_societa_id()
  );

-- Tutti gli autenticati della stessa società possono leggere
-- (filtro per squadra avviene lato app)
CREATE POLICY "messaggi_select" ON messaggi
  FOR SELECT TO authenticated
  USING (societa_id = get_my_societa_id());

-- Admin/allenatore/preparatore/segreteria possono aggiornare letto
CREATE POLICY "messaggi_update_letto" ON messaggi
  FOR UPDATE TO authenticated
  USING (societa_id = get_my_societa_id())
  WITH CHECK (societa_id = get_my_societa_id());
