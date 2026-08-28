/**
 * Het trainingsblad: wat je in de zaal in je hand hebt.
 *
 * Andere eisen dan de rest van de app. Je leest het staand, met een bal onder je
 * arm, in een zaal waar het licht van boven komt: dus grote letters, veel wit en
 * geen knoppen die iets veranderen. En het moet op papier kunnen — niet elke
 * trainer wil zijn telefoon aan de kant leggen, en een blad in de map is de
 * enige versie die niet leegloopt.
 *
 * Wat er per blok staat is precies wat je nodig hebt op het moment dat je het
 * blok start: hoe laat, hoe lang, wie er in welke groep, wie er wisselen, en de
 * drie dingen waar je op let.
 */

import { useMemo } from 'react';
import { buildPlan } from '../../domain/plan';
import { formatDate } from '../../domain/series';
import { BLOCK_LABELS } from '../../domain/types';
import { useStore } from '../StoreProvider';
import { href, useRoute } from '../router';
import { AnimationStrip } from '../components/AnimationPlayer';
import { GroupPlan, PlayerName } from '../components/GroupPlan';
import { EmptyState } from '../components/ui';

export function SheetScreen({ id }: { id: string }) {
  const { data } = useStore();
  const [, go] = useRoute();
  const training = data.trainings.find((item) => item.id === id);
  const plan = useMemo(
    () => (training ? buildPlan(training, data.library, data.players) : null),
    [data.library, data.players, training],
  );

  if (!training || !plan) {
    return (
      <EmptyState title="Training niet gevonden">
        <button type="button" className="button" onClick={() => go({ name: 'trainings' })}>
          Naar de trainingen
        </button>
      </EmptyState>
    );
  }

  return (
    <div className="sheetview">
      <div className="sheetview__bar noprint">
        <a className="linkbutton" href={href({ name: 'training', id: training.id })}>
          ← Aanpassen
        </a>
        <button type="button" className="button" onClick={() => print()}>
          Printen
        </button>
      </div>

      <header className="sheetview__head">
        <h1>{training.title}</h1>
        <p>
          {formatDate(training.date, true)}
          {training.time && ` · ${training.time}`}
          {plan.endsAt && `–${plan.endsAt}`}
          {training.location && ` · ${training.location}`}
        </p>
        <p className="sheetview__present">
          <strong>{plan.present.length} speelsters:</strong>{' '}
          {plan.present.map((player) => player.name).join(', ') || 'nog niemand afgevinkt'}
        </p>
      </header>

      <ol className="sheetview__blocks">
        {plan.blocks.map((block) => (
          <li key={block.block.id} className={`sheetblock sheetblock--${block.kind}`}>
            <div className="sheetblock__head">
              <span className="sheetblock__time">{block.startsAt ?? ''}</span>
              <h2>{block.title}</h2>
              <span className="sheetblock__minutes">{block.minutes} min</span>
            </div>
            <p className="sheetblock__kind">{BLOCK_LABELS[block.kind]}</p>

            {block.variant ? (
              <p className="sheetblock__summary">{block.variant.description}</p>
            ) : (
              block.exercise && <p className="sheetblock__summary">{block.exercise.summary}</p>
            )}

            {block.assignment && block.assignment.distribution.possible && (
              <GroupPlan
                assignment={block.assignment}
                rounds={block.rounds}
                rotateEveryMinutes={block.rotateEveryMinutes}
              />
            )}

            {block.warnings.length > 0 && (
              <ul className="sheetblock__warnings">
                {block.warnings.map((warning, index) => (
                  <li key={index}>{warning.text}</li>
                ))}
              </ul>
            )}

            {block.exercise && block.exercise.coachingPoints.length > 0 && (
              <ul className="bullets">
                {block.exercise.coachingPoints.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            )}

            {block.block.note && <p className="sheetblock__note">{block.block.note}</p>}

            {block.exercise?.animation && (
              <div className="sheetblock__animation">
                <AnimationStrip animation={block.exercise.animation} />
              </div>
            )}
          </li>
        ))}
      </ol>

      {plan.present.length > 0 && (
        <section className="sheetview__squad">
          <h2>Aanwezig</h2>
          <ul>
            {plan.present.map((player) => (
              <li key={player.id}>
                <PlayerName player={player} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
