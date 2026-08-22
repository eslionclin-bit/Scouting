-- Serverkant van de online koppeling.
--
-- Wat hier staat is bewust bijna niets. De app is offline-first: alle logica —
-- de puntentelling, de rotatie, het samenvoegen van wijzigingen — zit in de
-- app en moet daar blijven, want die moet ook werken als de zaal geen bereik
-- heeft. De server is een doorgeefluik met geheugen: hij bewaart per record de
-- nieuwste versie en geeft terug wat er sinds de vorige keer bij kwam.
--
-- Twee dingen doet hij wél zelf:
--
--   1. **Een volgnummer per wijziging** (`seq`). De app heeft een logische klok
--      per apparaat; die is per apparaat oplopend maar niet tussen apparaten
--      onderling. Om te kunnen zeggen 'geef me alles ná dit punt' is één
--      teller nodig die de server bijhoudt.
--   2. **De ploegcode controleren.** Zie onderaan.
--
-- Installeren: plak dit hele bestand in de SQL-editor van je Supabase-project
-- en voer het uit. Daarna één keer `select add_team('VCH DS 1', 'jullie-code')`
-- om de ploeg aan te maken.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Ploegen
-- ---------------------------------------------------------------------------

-- De code wordt gehasht opgeslagen, net als een wachtwoord. Wie in de database
-- kijkt, kan er niet mee inloggen — en dat hoort zo, ook als het 'maar' een
-- ploegcode is.
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code_hash text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Wijzigingen
-- ---------------------------------------------------------------------------

-- Eén rij per record, niet één rij per wijziging: elke wijziging bevat het
-- volledige record, dus de vorige versie heeft geen waarde meer. Dat houdt de
-- tabel klein en maakt opnieuw versturen ongevaarlijk.
create table if not exists changes (
  seq bigint generated always as identity primary key,
  team_id uuid not null references teams(id) on delete cascade,
  entity text not null,
  record_id uuid not null,
  -- Revisie uit de hybride klok van de app: bepaalt wie wint bij gelijktijdig
  -- wijzigen. De server vergelijkt hem als tekst, precies zoals de app doet.
  rev text not null,
  match_id uuid,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  unique (team_id, entity, record_id)
);

create index if not exists changes_by_team_seq on changes (team_id, seq);
create index if not exists changes_by_match on changes (team_id, match_id, seq);

-- ---------------------------------------------------------------------------
-- Afgrendelen
-- ---------------------------------------------------------------------------

-- Niemand komt rechtstreeks bij deze tabellen. De app gebruikt de publieke
-- anon-sleutel, en die staat in de gebouwde app — dus die sleutel mag niets.
-- Alles loopt via de twee functies hieronder, en die vragen om de ploegcode.
alter table teams enable row level security;
alter table changes enable row level security;
revoke all on teams from anon, authenticated;
revoke all on changes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ploeg aanmaken (draai je zelf, één keer, in de SQL-editor)
-- ---------------------------------------------------------------------------

create or replace function add_team(team_name text, team_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into teams (name, code_hash)
  values (team_name, crypt(team_code, gen_salt('bf')))
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function add_team(text, text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- De ploeg bij een code zoeken
-- ---------------------------------------------------------------------------

create or replace function team_for_code(team_code text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from teams where code_hash = crypt(team_code, code_hash) limit 1;
$$;

revoke all on function team_for_code(text) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Push: wijzigingen van een apparaat aannemen
-- ---------------------------------------------------------------------------

-- Teruggegeven wordt welke revisies zijn verwerkt. Alleen die haalt de app uit
-- zijn outbox; de rest blijft staan en gaat de volgende ronde opnieuw mee. Een
-- revisie die de server al in een nieuwere versie had, telt ook als verwerkt —
-- hij is aangekomen, hij is alleen niet de winnaar.
create or replace function sync_push(team_code text, changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  team uuid;
  item jsonb;
  accepted text[] := array[]::text[];
begin
  team := team_for_code(team_code);
  if team is null then
    raise exception 'onbekende ploegcode' using errcode = '28000';
  end if;

  for item in select * from jsonb_array_elements(changes)
  loop
    insert into changes as c (team_id, entity, record_id, rev, match_id, payload)
    values (
      team,
      item->>'entity',
      (item->'record'->>'id')::uuid,
      item->'record'->>'rev',
      nullif(item->>'matchId', '')::uuid,
      item->'record'
    )
    on conflict (team_id, entity, record_id) do update
      set rev = excluded.rev,
          match_id = excluded.match_id,
          payload = excluded.payload,
          updated_at = now(),
          -- Een nieuw volgnummer, zodat andere apparaten de wijziging ophalen.
          seq = nextval(pg_get_serial_sequence('changes', 'seq'))
      -- Hoogste revisie wint, precies zoals in de app. Een ouder bericht dat
      -- vertraagd binnenkomt, mag een nieuwere versie niet overschrijven.
      where excluded.rev > c.rev;

    accepted := accepted || (item->'record'->>'rev');
  end loop;

  return jsonb_build_object('acceptedRevs', to_jsonb(accepted));
end;
$$;

grant execute on function sync_push(text, jsonb) to anon;

-- ---------------------------------------------------------------------------
-- Pull: alles ophalen wat er sinds de vorige keer bij kwam
-- ---------------------------------------------------------------------------

create or replace function sync_pull(
  team_code text,
  cursor_seq bigint default 0,
  match_filter uuid default null,
  batch integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  team uuid;
  rows jsonb;
  last_seq bigint;
  counted integer;
begin
  team := team_for_code(team_code);
  if team is null then
    raise exception 'onbekende ploegcode' using errcode = '28000';
  end if;

  with picked as (
    select seq, entity, payload
    from changes
    where team_id = team
      and seq > coalesce(cursor_seq, 0)
      -- Meelezen met één wedstrijd: ploegen en spelers horen overal bij en
      -- gaan dus altijd mee.
      and (match_filter is null or match_id = match_filter or match_id is null)
    order by seq
    limit least(greatest(batch, 1), 500)
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('entity', entity, 'record', payload) order by seq), '[]'::jsonb),
    max(seq),
    count(*)
  into rows, last_seq, counted
  from picked;

  return jsonb_build_object(
    'changes', rows,
    'cursor', coalesce(last_seq, cursor_seq, 0),
    'hasMore', counted >= least(greatest(batch, 1), 500)
  );
end;
$$;

grant execute on function sync_pull(text, bigint, uuid, integer) to anon;
