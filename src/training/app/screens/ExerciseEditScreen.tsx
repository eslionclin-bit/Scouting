/**
 * Een eigen oefening opschrijven.
 *
 * Het formulier is lang, maar de volgorde is die van het bedenken: eerst wat het
 * is, dan wat het traint, dan met hoeveel mensen het werkt, en pas daarna de
 * animatie. Alles wordt bij elke toetsaanslag bewaard — er is geen
 * opslaan-knop, want een half ingevulde oefening kwijtraken omdat de telefoon
 * uitging is nergens goed voor.
 */

import { useEffect, useState } from 'react';
import { newId } from '../../../domain/ids';
import { allowedSizes } from '../../domain/grouping';
import {
  BLOCK_KINDS,
  BLOCK_LABELS,
  GOALS,
  GOAL_LABELS,
  POSITIONS,
  POSITION_LABELS,
  type BlockKind,
  type Exercise,
  type Goal,
  type Position,
} from '../../domain/types';
import { useStore } from '../StoreProvider';
import { useRoute } from '../router';
import { AnimationEditor } from '../components/AnimationEditor';
import { EmptyState, Field, Panel } from '../components/ui';

export function ExerciseEditScreen({ id }: { id: string }) {
  const { store, data } = useStore();
  const [, go] = useRoute();
  const [point, setPoint] = useState('');
  const exercise = data.exercises.find((item) => item.id === id);

  /**
   * De animatie wordt hier vastgehouden en niet alleen in de opslag.
   *
   * Elke wijziging gaat wél meteen naar de database, maar het scherm wacht niet
   * op de terugweg. Deed het dat wel, dan zou twee keer snel achter elkaar
   * tikken — een speler en meteen de bal erbij — de eerste van de twee kunnen
   * kwijtraken: de tweede tik rekent dan nog met de animatie van vóór de eerste.
   */
  const [animation, setAnimation] = useState(exercise?.animation ?? null);

  // Bij een andere oefening opnieuw beginnen; binnen dezelfde oefening blijft
  // staan wat je aan het tekenen bent.
  useEffect(() => {
    setAnimation(data.exercises.find((item) => item.id === id)?.animation ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!exercise) {
    return (
      <EmptyState title="Deze oefening is niet van jou">
        <p>
          Oefeningen uit de bank en van anderen zijn niet te wijzigen. Maak er een kopie van; die is
          wel van jou.
        </p>
        <button type="button" className="button" onClick={() => go({ name: 'library' })}>
          Naar de bank
        </button>
      </EmptyState>
    );
  }

  async function patch(changes: Partial<Exercise>) {
    await store.exercises.update(id, changes);
  }

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  const sizes = allowedSizes(exercise.group);

  return (
    <div className="screen">
      <header className="screen__head">
        <button type="button" className="linkbutton" onClick={() => go({ name: 'exercise', id })}>
          ← Bekijken
        </button>
        <span className="muted">Wordt vanzelf bewaard</span>
      </header>

      <Panel title="Wat is het">
        <Field label="Titel">
          <input
            className="input"
            value={exercise.title}
            onChange={(event) => void patch({ title: event.target.value })}
          />
        </Field>
        <Field label="Eén regel" hint="Wat je in de lijst leest.">
          <input
            className="input"
            value={exercise.summary}
            onChange={(event) => void patch({ summary: event.target.value })}
          />
        </Field>
        <Field label="Uitleg">
          <textarea
            className="input input--area"
            rows={6}
            value={exercise.description}
            onChange={(event) => void patch({ description: event.target.value })}
          />
        </Field>
        <Field label="Materiaal" hint="Gescheiden door komma's.">
          <input
            className="input"
            value={exercise.material.join(', ')}
            onChange={(event) =>
              void patch({
                material: event.target.value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>
      </Panel>

      <Panel title="Wat traint het">
        <div className="chips">
          {GOALS.map((goal: Goal) => (
            <button
              key={goal}
              type="button"
              className={`chip ${exercise.goals.includes(goal) ? 'is-active' : ''}`}
              onClick={() => void patch({ goals: toggle(exercise.goals, goal) })}
            >
              {GOAL_LABELS[goal]}
            </button>
          ))}
        </div>
        <p className="muted">Hierop wordt gefilterd; kies er liever twee dan vijf.</p>

        <Field label="Past in">
          <div className="chips">
            {BLOCK_KINDS.map((kind: BlockKind) => (
              <button
                key={kind}
                type="button"
                className={`chip ${exercise.slots.includes(kind) ? 'is-active' : ''}`}
                onClick={() => void patch({ slots: toggle(exercise.slots, kind) })}
              >
                {BLOCK_LABELS[kind]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid--form">
          <Field label="Richtduur (min)">
            <input
              type="number"
              className="input"
              min={5}
              max={60}
              step={5}
              value={exercise.minutes}
              onChange={(event) => void patch({ minutes: Number(event.target.value) })}
            />
          </Field>
          <Field label="Niveau">
            <select
              className="input"
              value={exercise.level}
              onChange={(event) => void patch({ level: Number(event.target.value) as 1 | 2 | 3 })}
            >
              <option value={1}>1 — beginners</option>
              <option value={2}>2 — gemiddeld</option>
              <option value={3}>3 — gevorderd</option>
            </select>
          </Field>
        </div>
      </Panel>

      <Panel title="Met hoeveel spelers">
        <div className="grid grid--form">
          <Field label="Kleinste groep">
            <input
              type="number"
              className="input"
              min={1}
              max={20}
              value={exercise.group.min}
              onChange={(event) =>
                void patch({ group: { ...exercise.group, min: Number(event.target.value) } })
              }
            />
          </Field>
          <Field label="Grootste groep">
            <input
              type="number"
              className="input"
              min={1}
              max={24}
              value={exercise.group.max}
              onChange={(event) =>
                void patch({ group: { ...exercise.group, max: Number(event.target.value) } })
              }
            />
          </Field>
          <Field label="Per" hint="3 = alleen in drietallen, 1 = elk aantal.">
            <input
              type="number"
              className="input"
              min={1}
              max={8}
              value={exercise.group.step}
              onChange={(event) =>
                void patch({ group: { ...exercise.group, step: Number(event.target.value) } })
              }
            />
          </Field>
          <Field label="Hoe vaak naast elkaar" hint="Hoeveel groepen er tegelijk kunnen draaien.">
            <input
              type="number"
              className="input"
              min={1}
              max={8}
              value={exercise.group.maxGroups}
              onChange={(event) =>
                void patch({ group: { ...exercise.group, maxGroups: Number(event.target.value) } })
              }
            />
          </Field>
        </div>

        <p className="muted">
          {sizes.length > 0
            ? `Werkt met groepen van ${sizes.join(', ')} spelers.`
            : 'Deze combinatie levert geen enkele werkbare groepsgrootte op — kijk nog eens naar het minimum en de stap.'}
        </p>

        <Field label="Posities per groep">
          <div className="chips">
            {POSITIONS.map((position: Position) => {
              const role = exercise.group.roles.find((item) => item.position === position);
              return (
                <button
                  key={position}
                  type="button"
                  className={`chip ${role ? 'is-active' : ''}`}
                  onClick={() =>
                    void patch({
                      group: {
                        ...exercise.group,
                        roles: role
                          ? exercise.group.roles.filter((item) => item.position !== position)
                          : [...exercise.group.roles, { position, count: 1, required: true }],
                      },
                    })
                  }
                >
                  {POSITION_LABELS[position]}
                  {role ? ` ×${role.count}` : ''}
                </button>
              );
            })}
          </div>
        </Field>
      </Panel>

      <Panel title="Waar je op let">
        <ul className="bullets">
          {exercise.coachingPoints.map((item, index) => (
            <li key={index}>
              {item}{' '}
              <button
                type="button"
                className="linkbutton"
                onClick={() =>
                  void patch({
                    coachingPoints: exercise.coachingPoints.filter((_, i) => i !== index),
                  })
                }
              >
                weg
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <input
            className="input"
            placeholder="Nog een punt"
            value={point}
            onChange={(event) => setPoint(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || !point.trim()) return;
              void patch({ coachingPoints: [...exercise.coachingPoints, point.trim()] });
              setPoint('');
            }}
          />
          <button
            type="button"
            className="button"
            onClick={() => {
              if (!point.trim()) return;
              void patch({ coachingPoints: [...exercise.coachingPoints, point.trim()] });
              setPoint('');
            }}
          >
            Toevoegen
          </button>
        </div>
      </Panel>

      <Panel title="Varianten">
        {exercise.variants.map((variant, index) => (
          <div key={variant.id} className="variant">
            <input
              className="input"
              value={variant.title}
              aria-label="Titel van de variant"
              onChange={(event) =>
                void patch({
                  variants: exercise.variants.map((item, i) =>
                    i === index ? { ...item, title: event.target.value } : item,
                  ),
                })
              }
            />
            <textarea
              className="input input--area"
              rows={2}
              value={variant.description}
              aria-label="Uitleg van de variant"
              onChange={(event) =>
                void patch({
                  variants: exercise.variants.map((item, i) =>
                    i === index ? { ...item, description: event.target.value } : item,
                  ),
                })
              }
            />
            <button
              type="button"
              className="button button--ghost"
              onClick={() =>
                void patch({ variants: exercise.variants.filter((_, i) => i !== index) })
              }
            >
              Variant weg
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button"
          onClick={() =>
            void patch({
              variants: [
                ...exercise.variants,
                { id: newId(), title: 'Variant', description: '', group: null },
              ],
            })
          }
        >
          Variant erbij
        </button>
      </Panel>

      <Panel title="Animatie">
        <AnimationEditor
          animation={animation}
          onChange={(next) => {
            setAnimation(next);
            void patch({ animation: next });
          }}
        />
      </Panel>

      <Panel title="Opruimen">
        <button
          type="button"
          className="button button--danger"
          onClick={async () => {
            if (!confirm(`${exercise.title} weggooien?`)) return;
            await store.exercises.remove(id);
            go({ name: 'library' });
          }}
        >
          Oefening weggooien
        </button>
      </Panel>
    </div>
  );
}
