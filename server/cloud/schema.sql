-- Serverkant van de online koppeling: één tabel.
--
-- De app is offline-first. Alle logica — puntentelling, rotatie, het
-- samenvoegen van wijzigingen — zit in de app en moet daar blijven, want die
-- moet ook werken als de zaal geen bereik heeft. De server is een doorgeefluik
-- met geheugen.
--
-- Eén rij per record, niet één per wijziging: elke wijziging bevat het
-- volledige record, dus de vorige versie heeft geen waarde meer. Daardoor is
-- opnieuw versturen ongevaarlijk en blijft de tabel klein.

create table if not exists changes (
  -- Het volgnummer waarop 'geef me alles ná dit punt' werkt. De logische klok
  -- van de app loopt per apparaat op, maar niet tussen apparaten onderling;
  -- daar is één teller voor nodig, en dat is precies wat een oplopende rowid is.
  --
  -- Daarom wordt een gewijzigd record ook verwijderd en opnieuw ingevoegd in
  -- plaats van bijgewerkt: zo krijgt het een nieuw, hoger volgnummer en halen
  -- andere apparaten het op.
  seq integer primary key autoincrement,

  -- De ploeg, als hash van de ploegcode. De code zelf komt hier nooit; de
  -- server kan hem dus ook niet lekken. Wie de code heeft, komt bij de rijen
  -- die eronder hangen — precies zoals bedoeld, en niets meer.
  team text not null,

  entity text not null,
  record_id text not null,

  -- Revisie uit de hybride klok van de app. Bepaalt wie wint bij gelijktijdig
  -- wijzigen; als tekst vergeleken, precies zoals de app het doet.
  rev text not null,

  -- Waar dit record bij hoort, zodat meelezen met één wedstrijd niet de hele
  -- geschiedenis hoeft op te halen. Leeg bij ploegen en spelers: die horen
  -- overal bij en gaan altijd mee.
  match_id text,

  payload text not null,
  updated_at text not null
);

create unique index if not exists changes_record on changes (team, entity, record_id);
create index if not exists changes_by_team_seq on changes (team, seq);
create index if not exists changes_by_match on changes (team, match_id, seq);
