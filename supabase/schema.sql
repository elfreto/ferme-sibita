-- La Ferme de Sibita : base partagée entre les téléphones.
-- À coller une seule fois dans Supabase > SQL Editor > New query, puis « Run ».

create sequence if not exists enregistrements_seq;

-- Une ligne par enregistrement de l'application (bande, saisie, vente, dépense…)
create table if not exists public.enregistrements (
  tbl text not null,                 -- table de l'application : bandes, journal, ventes…
  id text not null,                  -- identifiant de l'enregistrement
  donnees jsonb,                     -- contenu complet (vide si supprimé)
  supprime boolean not null default false,
  seq bigint not null default nextval('enregistrements_seq'),
  modifie_le timestamptz not null default now(),
  appareil text,                     -- téléphone qui a envoyé la modification
  primary key (tbl, id)
);
create index if not exists enregistrements_seq_idx on public.enregistrements (seq);

-- Chaque modification reçoit un nouveau numéro : les téléphones ne reprennent que le nouveau
create or replace function public.enregistrements_numeroter() returns trigger
language plpgsql as $$
begin
  new.seq := nextval('enregistrements_seq');
  new.modifie_le := now();
  return new;
end $$;

drop trigger if exists enregistrements_numeroter on public.enregistrements;
create trigger enregistrements_numeroter before insert or update on public.enregistrements
  for each row execute function public.enregistrements_numeroter();

-- Seul le compte de la ferme (connecté) lit et écrit
alter table public.enregistrements enable row level security;
drop policy if exists "ferme lit" on public.enregistrements;
drop policy if exists "ferme ajoute" on public.enregistrements;
drop policy if exists "ferme modifie" on public.enregistrements;
create policy "ferme lit" on public.enregistrements for select to authenticated using (true);
create policy "ferme ajoute" on public.enregistrements for insert to authenticated with check (true);
create policy "ferme modifie" on public.enregistrements for update to authenticated using (true) with check (true);
