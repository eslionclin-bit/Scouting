-- De tabel wordt door de worker zelf aangemaakt bij het eerste verzoek (zie
-- worker.js). Dit bestand is er voor wie hem met de hand wil bekijken of
-- klaarzetten, bijvoorbeeld in de SQL-console van Cloudflare.

create table if not exists shared (
  seq integer primary key autoincrement,
  scope text not null,
  entity text not null,
  record_id text not null,
  rev text not null,
  payload text not null,
  updated_at text not null
);

create unique index if not exists shared_record on shared (scope, entity, record_id);
create index if not exists shared_by_scope_seq on shared (scope, seq);
