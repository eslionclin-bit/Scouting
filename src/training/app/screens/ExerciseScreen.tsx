/**
 * Eén oefening: wat het is, hoe het loopt, en hoe hij uitpakt bij jouw groep.
 *
 * De rekenmachine onderaan is de reden dat dit scherm bestaat en niet alleen een
 * lange tekst is: je wil weten wat er gebeurt met de tien speelsters die vanavond
 * komen, niet wat er in theorie kan.
 */

import { useMemo, useState } from 'react';
import { assign, rotationRounds } from '../../domain/grouping';
import { describeGroupSpec } from '../../domain/library';
import { describeProblem } from '../../domain/plan';
import { copyExercise } from '../../bank';
import {
  BLOCK_LABELS,
  POSITION_LABELS,
  VISIBILITY_LABELS,
  type Visibility,
} from '../../domain/types';
import { useStore } from '../StoreProvider';
import { goBack, useRoute } from '../router';
import { AnimationPlayer } from '../components/AnimationPlayer';
import { GroupPlan } from '../components/GroupPlan';
import { EmptyState, GoalChips, Panel } from '../components/ui';

export function ExerciseScreen({ id }: { id: string }) {
  const { store, data } = useStore();
  const [, go] = useRoute();
  const exercise = data.library.find((item) => item.id === id);
  const players = useMemo(
    () => data.players.filter((player) => player.active),
    [data.players],
  );
  const [participants, setParticipants] = useState<number>(
    data.settings.defaultParticipants ?? players.length ?? 8,
  );

  if (!exercise) {
    return (
      <EmptyState title="Oefening niet gevonden">
        <p>Hij is misschien verwijderd, of hij hoorde bij een groep waar je niet meer in zit.</p>
        <button type="button" className="button" onClick={() => go({ name: 'library' })}>
          Naar de bank
        </button>
      </EmptyState>
    );
  }

  const mine = exercise.authorId === data.profile.id && !exercise.builtIn;
  const selection = players.slice(0, participants);
  const assignment = assign(selection, exercise.group);
  const rounds = rotationRounds(selection, exercise.group);

  async function copy() {
    const { id: _id, rev, updatedAt, deletedAt, ...input } = copyExercise(exercise!, data.profile);
    const created = await store.exercises.create(input);
    go({ name: 'exercise-edit', id: created.id });
  }

  async function share(visibility: Visibility, groupIds: string[]) {
    await store.exercises.update(exercise!.id, { visibility, groupIds });
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <button type="button" className="linkbutton" onClick={() => goBack({ name: 'library' })}>
          ← Terug
        </button>
        <div className="screen__actions">
          {mine ? (
            <button
              type="button"
              className="button"
              onClick={() => go({ name: 'exercise-edit', id: exercise.id })}
            >
              Bewerken
            </button>
          ) : (
            <button type="button" className="button" onClick={copy}>
              Kopiëren naar mijn bank
            </button>
          )}
        </div>
      </header>

      <h1>{exercise.title}</h1>
      <p className="lead">{exercise.summary}</p>
      <GoalChips goals={exercise.goals} />
      <p className="muted">
        {describeGroupSpec(exercise)} · {exercise.minutes} min · niveau {exercise.level} ·{' '}
        {exercise.slots.map((slot) => BLOCK_LABELS[slot]).join(', ')}
        {exercise.builtIn ? ' · uit de bank' : ` · van ${exercise.authorName}`}
      </p>

      {exercise.animation && (
        <Panel title="Hoe het loopt">
          <AnimationPlayer animation={exercise.animation} autoPlay />
        </Panel>
      )}

      <Panel title="Uitleg">
        <p className="prose">{exercise.description}</p>
        {exercise.material.length > 0 && (
          <p className="muted">Nodig: {exercise.material.join(', ')}</p>
        )}
        {exercise.group.roles.length > 0 && (
          <p className="muted">
            Posities per groep:{' '}
            {exercise.group.roles
              .map(
                (role) =>
                  `${role.count}× ${POSITION_LABELS[role.position]}${role.required ? '' : ' (mag ook zonder)'}`,
              )
              .join(', ')}
          </p>
        )}
      </Panel>

      {exercise.coachingPoints.length > 0 && (
        <Panel title="Waar je op let">
          <ul className="bullets">
            {exercise.coachingPoints.map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </Panel>
      )}

      {exercise.variants.length > 0 && (
        <Panel title="Varianten">
          {exercise.variants.map((variant) => (
            <div key={variant.id} className="variant">
              <h3>{variant.title}</h3>
              <p>{variant.description}</p>
            </div>
          ))}
        </Panel>
      )}

      <Panel title="Met hoeveel spelers?">
        <label className="field field--inline">
          <span className="field__label">Aanwezig</span>
          <input
            type="number"
            className="input input--small"
            min={1}
            max={30}
            value={participants}
            onChange={(event) => setParticipants(Math.max(1, Number(event.target.value)))}
          />
        </label>

        {selection.length < participants && (
          <p className="muted">
            Er staan {players.length} speelsters in je selectie; hieronder rekent de app met
            plaatshouders voor de rest.
          </p>
        )}

        {selection.length > 0 ? (
          <GroupPlan
            assignment={assignment}
            rounds={rounds}
            rotateEveryMinutes={rounds.length > 1 ? Math.round(exercise.minutes / rounds.length) : null}
          />
        ) : (
          <>
            <p>
              {assignment.distribution.possible
                ? `${assignment.distribution.groups.length} groep(en) van ${assignment.distribution.groups.join(' + ')}, ${assignment.distribution.waiting} wachten.`
                : 'Dit aantal werkt niet voor deze oefening.'}
            </p>
            {assignment.problems.map((problem, index) => (
              <p key={index} className="muted">
                {describeProblem(problem)}
              </p>
            ))}
          </>
        )}
      </Panel>

      {mine && (
        <Panel title="Delen">
          <div className="chips">
            {(['private', 'public'] as Visibility[]).map((visibility) => (
              <button
                key={visibility}
                type="button"
                className={`chip ${exercise.visibility === visibility ? 'is-active' : ''}`}
                onClick={() => share(visibility, [])}
              >
                {VISIBILITY_LABELS[visibility]}
              </button>
            ))}
            {data.groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`chip ${
                  exercise.visibility === 'group' && exercise.groupIds.includes(group.id)
                    ? 'is-active'
                    : ''
                }`}
                onClick={() => {
                  const has = exercise.groupIds.includes(group.id);
                  const groupIds = has
                    ? exercise.groupIds.filter((item) => item !== group.id)
                    : [...exercise.groupIds, group.id];
                  void share(groupIds.length > 0 ? 'group' : 'private', groupIds);
                }}
              >
                {group.name}
              </button>
            ))}
          </div>
          <p className="muted">
            Privé blijft op je eigen apparaten. Openbaar betekent openbaar: iedereen met dezelfde
            deelserver kan hem zien en overnemen.
          </p>
        </Panel>
      )}
    </div>
  );
}
