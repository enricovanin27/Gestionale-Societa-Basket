-- ============================================================
-- MIGRAZIONE: presenze_allenamento — schema corretto
-- ============================================================
-- PROBLEMA: la tabella originale aveva `allenamento_id BIGINT NOT NULL`
-- che non veniva mai popolato dal frontend. AppelloModal, HomeAdmin e
-- PresenzeAdmin usano data + squadra come chiave di sessione.
-- SOLUZIONE: ricreare la tabella con lo schema che corrisponde al frontend.
-- ATTENZIONE: elimina i dati esistenti in presenze_allenamento (pre-produzione).
-- ============================================================

DROP TABLE IF EXISTS presenze_allenamento CASCADE;

CREATE TABLE presenze_allenamento (
  id           BIGSERIAL   PRIMARY KEY,
  societa_id   UUID        NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
  data         DATE        NOT NULL,
  squadra      TEXT        NOT NULL,
  giocatore_id UUID        NOT NULL REFERENCES giocatori(id) ON DELETE CASCADE,
  presente     BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now(),

  -- Una riga per giocatore per sessione (data+squadra = identificatore sessione)
  UNIQUE (societa_id, data, squadra, giocatore_id)
);

-- Indici per le query tipiche di HomeAdmin e PresenzeAdmin (filtri su data)
CREATE INDEX idx_pres_all_societa_data
  ON presenze_allenamento (societa_id, data);

CREATE INDEX idx_pres_all_giocatore
  ON presenze_allenamento (giocatore_id);

ALTER TABLE presenze_allenamento ENABLE ROW LEVEL SECURITY;

-- ── SELECT: tutti i ruoli autenticati della società ──────────────────────────
CREATE POLICY "pres_all_select" ON presenze_allenamento
  FOR SELECT TO authenticated
  USING (
    societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
  );

-- ── INSERT: admin, allenatori, segreteria (anche via ruoli_extra) ────────────
CREATE POLICY "pres_all_insert" ON presenze_allenamento
  FOR INSERT TO authenticated
  WITH CHECK (
    societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT ruolo FROM profiles WHERE id = auth.uid())
        IN ('admin', 'allenatore', 'segreteria', 'super_admin')
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND ruoli_extra && ARRAY['admin', 'allenatore', 'segreteria']
      )
    )
  );

-- ── DELETE: stessa regola dell'INSERT (AppelloModal fa delete+insert) ────────
CREATE POLICY "pres_all_delete" ON presenze_allenamento
  FOR DELETE TO authenticated
  USING (
    societa_id = (SELECT societa_id FROM profiles WHERE id = auth.uid())
    AND (
      (SELECT ruolo FROM profiles WHERE id = auth.uid())
        IN ('admin', 'allenatore', 'segreteria', 'super_admin')
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND ruoli_extra && ARRAY['admin', 'allenatore', 'segreteria']
      )
    )
  );
