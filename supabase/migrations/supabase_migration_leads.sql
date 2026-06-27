-- Tabella leads: richieste demo dalla landing page
CREATE TABLE IF NOT EXISTS leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  nome        TEXT NOT NULL,
  societa     TEXT NOT NULL,
  email       TEXT NOT NULL,
  telefono    TEXT NOT NULL,
  status      TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted'))
);

-- RLS abilitata: service_role bypassa RLS (usato dall'Edge Function handle-lead)
-- Nessuna policy pubblica — i leads sono dati privati, accesso solo via service_role
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Index per query per data (futuro dashboard leads)
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);
