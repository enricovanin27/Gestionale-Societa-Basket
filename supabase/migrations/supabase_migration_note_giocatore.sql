-- Migration: add note_giocatore table
-- Run in Supabase SQL Editor

create table if not exists note_giocatore (
  id           uuid        primary key default gen_random_uuid(),
  societa_id   uuid        not null references societa(id) on delete cascade,
  giocatore_id uuid        not null references giocatori(id) on delete cascade,
  testo        text        not null,
  autore_nome  text        not null,
  autore_id    uuid        references auth.users(id),
  created_at   timestamptz not null default now()
);

create index if not exists note_giocatore_giocatore_idx on note_giocatore(giocatore_id);
create index if not exists note_giocatore_societa_idx   on note_giocatore(societa_id);

alter table note_giocatore enable row level security;

create policy "segreteria_can_manage_note"
  on note_giocatore
  for all
  to authenticated
  using (
    societa_id = (select societa_id from profili where id = auth.uid())
  )
  with check (
    societa_id = (select societa_id from profili where id = auth.uid())
  );
