/**
 * Reeksen: een periode in één keer klaarzetten.
 *
 * Het formulier is bewust kort. Alles wat de app zelf kan bedenken — welke
 * oefeningen, in welke volgorde, met welk accent — vraagt hij niet. Wat hij niet
 * kan weten staat er wel: wanneer je traint, hoe lang, en op hoeveel speelsters
 * je rekent.
 */

import { useState } from 'react';
import { defaultAccents, formatDate, generateSeries, trainingDates, WEEKDAY_LABELS } from '../../domain/series';
import { useStore } from '../StoreProvider';
import { href, useRoute } from '../router';
import { EmptyState, Field, Panel } from '../components/ui';

export function SeriesScreen() {
  const { store, data } = useStore();
  const [, go] = useRoute();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    name: 'Nieuwe reeks',
    startDate: today,
    endDate: addWeeks(today, 8),
    weekdays: [2, 4],
    minutes: 90,
    time: '20:00',
    participants: Math.max(6, data.players.filter((player) => player.active).length || 10),
  });
  const [busy, setBusy] = useState(false);

  const dates = trainingDates(form.startDate, form.endDate, form.weekdays);

  async function generate() {
    setBusy(true);
    try {
      const { series, trainings } = generateSeries(
        {
          name: form.name,
          startDate: form.startDate,
          endDate: form.endDate,
          weekdays: form.weekdays,
          minutes: form.minutes,
          accents: defaultAccents(),
          visibility: 'private',
          groupIds: [],
        },
        {
          library: data.library,
          expectedParticipants: form.participants,
          teamId: data.settings.activeTeamId ?? data.teams[0]?.id ?? null,
          authorId: data.profile.id,
          authorName: data.profile.name,
          time: form.time,
        },
      );

      for (const training of trainings) {
        const { rev, updatedAt, deletedAt, ...input } = training;
        await store.trainings.create(input);
      }
      const { rev, updatedAt, deletedAt, ...input } = series;
      const created = await store.series.create(input);
      go({ name: 'series-detail', id: created.id });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <h1>Reeksen</h1>

      {data.series.length > 0 && (
        <Panel title="Wat er staat">
          <ul className="list">
            {data.series.map((series) => (
              <li key={series.id} className="list__item">
                <a className="list__link" href={href({ name: 'series-detail', id: series.id })}>
                  <span className="list__title">{series.name}</span>
                  <span className="list__meta">
                    {formatDate(series.startDate)} – {formatDate(series.endDate, true)} ·{' '}
                    {series.trainingIds.length} trainingen
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Nieuwe reeks">
        <div className="grid grid--form">
          <Field label="Naam">
            <input
              className="input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Van">
            <input
              type="date"
              className="input"
              value={form.startDate}
              onChange={(event) => setForm({ ...form, startDate: event.target.value })}
            />
          </Field>
          <Field label="Tot en met">
            <input
              type="date"
              className="input"
              value={form.endDate}
              onChange={(event) => setForm({ ...form, endDate: event.target.value })}
            />
          </Field>
          <Field label="Aanvang">
            <input
              type="time"
              className="input"
              value={form.time}
              onChange={(event) => setForm({ ...form, time: event.target.value })}
            />
          </Field>
          <Field label="Duur (minuten)">
            <input
              type="number"
              className="input"
              min={30}
              max={180}
              step={15}
              value={form.minutes}
              onChange={(event) => setForm({ ...form, minutes: Number(event.target.value) })}
            />
          </Field>
          <Field label="Reken op hoeveel speelsters" hint="Bepaalt welke oefeningen gekozen worden.">
            <input
              type="number"
              className="input"
              min={2}
              max={30}
              value={form.participants}
              onChange={(event) => setForm({ ...form, participants: Number(event.target.value) })}
            />
          </Field>
        </div>

        <Field label="Trainingsdagen">
          <div className="chips">
            {WEEKDAY_LABELS.map((label, index) => {
              const day = index + 1;
              const active = form.weekdays.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  className={`chip ${active ? 'is-active' : ''}`}
                  onClick={() =>
                    setForm({
                      ...form,
                      weekdays: active
                        ? form.weekdays.filter((item) => item !== day)
                        : [...form.weekdays, day].sort(),
                    })
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Field>

        <p className="muted">
          Dat worden {dates.length} trainingen, van {dates[0] ? formatDate(dates[0]) : '—'} tot{' '}
          {dates[dates.length - 1] ? formatDate(dates[dates.length - 1] as string, true) : '—'}. De
          accenten lopen van voorbereiding via opbouw naar competitie; elke training krijgt een
          warming-up, twee kernblokken, een wedstrijdvorm en een afsluiting.
        </p>

        <button
          type="button"
          className="button button--primary"
          onClick={generate}
          disabled={busy || dates.length === 0}
        >
          {busy ? 'Bezig…' : `${dates.length} trainingen klaarzetten`}
        </button>
      </Panel>

      {data.series.length === 0 && (
        <EmptyState title="Waarom een reeks?">
          <p>
            Omdat de opbouw over de weken het werk is, niet de losse training. De app zet de datums
            en een eerste invulling klaar; jij past per training aan wat er die avond nodig is.
          </p>
        </EmptyState>
      )}
    </div>
  );
}

function addWeeks(iso: string, weeks: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}
