/**
 * Een eigen oefening opschrijven.
 *
 * Er stonden zestien velden op dit scherm, en dat is er zo veel dat je aan het
 * invullen begint in plaats van aan het opschrijven van je oefening. Wat er nu
 * open staat is het minimum waarmee een oefening bruikbaar is: hoe hij heet,
 * wat je doet, wat het traint, met hoeveel mensen, en waar je op let. De rest
 * — duur, niveau, materiaal, waar hij in een training past, posities,
 * varianten — heeft een werkbare standaard en staat onder één knop.
 *
 * De volgorde blijft die van het bedenken. En er is geen opslaan-knop: alles
 * gaat vanzelf naar de opslag, want een half ingevulde oefening kwijtraken
 * omdat de telefoon uitging is nergens goed voor.
 */

import { useEffect, useState } from 'react';
import { newId } from '../../../domain/ids';
import { allowedSizes } from '../../domain/grouping';
import { describeGroupSpec, summaryFrom, withStep } from '../../domain/library';
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
import { DraftInput, DraftTextarea, EmptyState, Field, More, Panel } from '../components/ui';

/**
 * De vormen waarin een oefening te doen is. Vier knoppen in plaats van een veld
 * waar 'per hoeveel' in moet: niemand schrijft een oefening op in stappen, maar
 * wel in tweetallen of drietallen.
 */
const GROUP_SHAPES = [
  { step: 1, label: 'Elk aantal' },
  { step: 2, label: 'In tweetallen' },
  { step: 3, label: 'In drietallen' },
  { step: 4, label: 'In viertallen' },
] as const;

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

  /**
   * De uitleg bewaren, en meteen de regel voor in de lijst als die nog leeg is.
   * Zo is er één veld minder om in te vullen zonder dat de bank vol lege regels
   * komt te staan.
   */
  async function saveDescription(description: string) {
    const current = data.exercises.find((item) => item.id === id);
    const summary = current?.summary.trim() ? current.summary : summaryFrom(description);
    await patch({ description, summary });
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
          <DraftInput
            className="input"
            value={exercise.title}
            onCommit={(title) => void patch({ title })}
          />
        </Field>
        <Field label="Uitleg" hint="De eerste zin komt in de lijst te staan.">
          <DraftTextarea
            className="input input--area"
            rows={6}
            value={exercise.description}
            onCommit={(description) => void saveDescription(description)}
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
      </Panel>

      <Panel title="Met hoeveel spelers">
        <div className="chips">
          {GROUP_SHAPES.map((shape) => (
            <button
              key={shape.step}
              type="button"
              className={`chip ${exercise.group.step === shape.step ? 'is-active' : ''}`}
              onClick={() => void patch({ group: withStep(exercise.group, shape.step) })}
            >
              {shape.label}
            </button>
          ))}
        </div>

        <div className="row row--wrap">
          <label className="filters__number">
            Van
            <input
              type="number"
              className="input input--tiny"
              min={1}
              max={24}
              value={exercise.group.min}
              aria-label="Kleinste groep"
              onChange={(event) =>
                void patch({ group: { ...exercise.group, min: Number(event.target.value) } })
              }
            />
          </label>
          <label className="filters__number">
            tot en met
            <input
              type="number"
              className="input input--tiny"
              min={1}
              max={24}
              value={exercise.group.max}
              aria-label="Grootste groep"
              onChange={(event) =>
                void patch({ group: { ...exercise.group, max: Number(event.target.value) } })
              }
            />
          </label>
          <span className="muted">spelers per groep</span>
        </div>

        <p className="muted">
          {sizes.length > 0
            ? `Werkt met groepen van ${sizes.join(', ')} spelers. In de bank staat: ${describeGroupSpec(exercise)}.`
            : 'Zo blijft er geen werkbare groep over — kijk nog eens naar het bereik.'}
        </p>
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


      <Panel title="Animatie">
        <AnimationEditor
          animation={animation}
          onChange={(next) => {
            setAnimation(next);
            void patch({ animation: next });
          }}
        />
      </Panel>

      <More title="Meer instellen — duur, niveau, materiaal, varianten">
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

        <Field label="Materiaal" hint="Gescheiden door komma's.">
          <DraftInput
            className="input"
            value={exercise.material.join(', ')}
            onCommit={(value) =>
              void patch({
                material: value
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
          />
        </Field>

        <Field label="Eigen regel voor in de lijst" hint="Leeg laten: dan pakt de app de eerste zin van de uitleg.">
          <DraftInput
            className="input"
            value={exercise.summary}
            onCommit={(summary) => void patch({ summary })}
          />
        </Field>

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

        <Field
          label="Hoe vaak naast elkaar"
          hint="Hoeveel groepen er tegelijk kunnen draaien; zoveel netten of vakken heb je nodig."
        >
          <input
            type="number"
            className="input input--tiny"
            min={1}
            max={8}
            value={exercise.group.maxGroups}
            onChange={(event) =>
              void patch({ group: { ...exercise.group, maxGroups: Number(event.target.value) } })
            }
          />
        </Field>

        <Field label="Posities per groep" hint="Alleen invullen als de oefening er echt om vraagt.">
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

        <h3>Varianten</h3>
        {exercise.variants.map((variant, index) => (
          <div key={variant.id} className="variant">
            <DraftInput
              className="input"
              value={variant.title}
              aria-label="Titel van de variant"
              onCommit={(title) =>
                void patch({
                  variants: exercise.variants.map((item, i) =>
                    i === index ? { ...item, title } : item,
                  ),
                })
              }
            />
            <DraftTextarea
              className="input input--area"
              rows={2}
              value={variant.description}
              aria-label="Uitleg van de variant"
              onCommit={(description) =>
                void patch({
                  variants: exercise.variants.map((item, i) =>
                    i === index ? { ...item, description } : item,
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
      </More>

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
