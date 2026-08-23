-- De tabel wordt door de worker zelf aangemaakt bij het eerste verzoek (zie
-- worker.js). Dit bestand is er nog voor wie hem met de hand wil bekijken of
-- klaarzetten, bijvoorbeeld in de SQL-console van Cloudflare.
--
-- Loopt een geplakt blok daar vast op 'Requests without any query are not
-- supported', voer de statements dan een voor een uit en laat de puntkomma weg.

create table if not exists changes (
  seq integer primary key autoincrement,
  team text not null,
  entity text not null,
  record_id text not null,
  rev text not null,
  match_id text,
  payload text not null,
  updated_at text not null
);

create unique index if not exists changes_record on changes (team, entity, record_id);
create index if not exists changes_by_team_seq on changes (team, seq);
create index if not exists changes_by_match on changes (team, match_id, seq);
