/**
 * Het eerste scherm: wat er nu speelt.
 *
 * Een trainingsapp wordt op twee momenten geopend: op de bank thuis om iets voor
 * te bereiden, en in de auto voor de zaal om te kijken wat er ook alweer op het
 * programma stond. Voor dat tweede moment is dit scherm gemaakt — de eerstvolgende
 * training staat er, met één knop naar het blad.
 */

import { useMemo } from 'react';
import { buildPlan, presentPlayers } from '../../domain/plan';
import { formatDate } from '../../domain/series';
import { BLOCK_LABELS } from '../../domain/types';
import { useStore } from '../StoreProvider';
import { href, useRoute } from '../router';
import { EmptyState, Panel, Warning } from '../components/ui';

export function TodayScreen() {
  const { data } = useStore();
  const [, go] = useRoute();
  const today = new Date().toISOString().slice(0, 10);

  const next = useMemo(
    () =>
      [...data.trainings]
        .filter((training) => training.date >= today && !training.done)
        .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null,
    [data.trainings, today],
  );

  const plan = useMemo(
    () => (next ? buildPlan(next, data.library, data.players) : null),
    [data.library, data.players, next],
  );

  if (!next || !plan) {
    return (
      <div className="screen">
        <h1>Vandaag</h1>
        <EmptyState title="Er staat niets klaar">
          <p>
            Maak een training voor de eerstvolgende keer, of laat de app een reeks voor de hele
            periode klaarzetten.
          </p>
          <div className="row">
            <button type="button" className="button button--primary" onClick={() => go({ name: 'trainings' })}>
              Naar trainingen
            </button>
            <button type="button" className="button" onClick={() => go({ name: 'series' })}>
              Reeks maken
            </button>
          </div>
        </EmptyState>
      </div>
    );
  }

  const present = presentPlayers(next, data.players);
  const notChecked = next.attendance.length === 0 && next.absent.length === 0;

  return (
    <div className="screen">
      <h1>{next.date === today ? 'Vanavond' : formatDate(next.date)}</h1>

      <Panel
        title={next.title}
        action={
          <a className="button button--primary" href={href({ name: 'sheet', id: next.id })}>
            Trainingsblad
          </a>
        }
      >
        <p className="muted">
          {formatDate(next.date, true)}
          {next.time && ` · ${next.time}`}
          {plan.endsAt && `–${plan.endsAt}`}
          {next.location && ` · ${next.location}`} · {plan.minutes} min
        </p>

        {notChecked ? (
          <Warning severity="notice">
            Nog niemand afgevinkt. De app rekent nu met de hele selectie ({present.length}).{' '}
            <a href={href({ name: 'training', id: next.id })}>Aanwezigheid invullen</a>
          </Warning>
        ) : (
          <p>
            <strong>{present.length} speelsters</strong> aanwezig.
          </p>
        )}

        {plan.blockingCount > 0 && (
          <Warning severity="blocking">
            {plan.blockingCount === 1
              ? 'Eén blok past niet bij deze groep.'
              : `${plan.blockingCount} blokken passen niet bij deze groep.`}{' '}
            <a href={href({ name: 'training', id: next.id })}>Bekijken</a>
          </Warning>
        )}

        <ol className="miniblocks">
          {plan.blocks.map((block) => (
            <li key={block.block.id}>
              <span className="miniblocks__time">{block.startsAt ?? `${block.minutes}m`}</span>
              <span className="miniblocks__title">{block.title}</span>
              <span className="miniblocks__kind">{BLOCK_LABELS[block.kind]}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
