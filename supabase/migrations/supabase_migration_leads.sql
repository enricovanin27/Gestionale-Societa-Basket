-- Tabella leads: richieste demo dalla landing page
CREATE TABLE IF NOT EXISTS leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  nome        TEXT NOT NULL,
  societa     TEXT NOT NULL,
  email       TEXT NOT NULL,
  telefono    TEXT NOT NULL,
  status      TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted'))
);

-- RLS abilitata: nessuna policy pubblica, solo service_role può accedere
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Index per query per data (futuro dashboard leads)
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);
