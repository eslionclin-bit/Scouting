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
