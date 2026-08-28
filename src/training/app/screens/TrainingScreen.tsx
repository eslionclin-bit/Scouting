/**
 * De trainingsbouwer.
 *
 * Hier komen de twee helften van de app bij elkaar: wat je wil doen (blokken uit
 * de bank) en wie er zijn (het vinkjeslijstje). Zodra je iemand afvinkt, rekent
 * elk blok opnieuw uit hoeveel groepen er draaien en wie erin komen — en waar
 * dat niet uitkomt staat het er meteen bij, met een alternatief dat hetzelfde
 * traint.
 */

import { useMemo, useState } from 'react';
import { newId } from '../../../domain/ids';
import { buildPlan, presentPlayers, rescale } from '../../domain/plan';
import { formatDate } from '../../domain/series';
import {
  BLOCK_KINDS,
  BLOCK_LABELS,
  GOAL_LABELS,
  VISIBILITY_LABELS,
  type BlockKind,
  type Exercise,
  type Training,
  type TrainingBlock,
  type Visibility,
} from '../../domain/types';
import { useStore } from '../StoreProvider';
import { href, useRoute } from '../router';
import { ExercisePicker } from '../components/ExercisePicker';
import { GroupPlan, PlayerName } from '../components/GroupPlan';
import { DraftInput, DraftTextarea, EmptyState, Field, Panel, Warning } from '../components/ui';

export function TrainingScreen({ id }: { id: string }) {
  const { store, data } = useStore();
  const [, go] = useRoute();
  const [picking, setPicking] = useState<{ blockId: string; kind: BlockKind } | null>(null);
  const [showAttendance, setShowAttendance] = useState(true);

  const training = data.trainings.find((item) => item.id === id);
  const squad = useMemo(
    () =>
      data.players
        .filter((player) => player.active)
        .filter((player) => !training?.teamId || player.teamId === training.teamId)
        .sort((a, b) => (a.number ?? 99) - (b.number ?? 99)),
    [data.players, training?.teamId],
  );

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

  const present = presentPlayers(training, data.players);

  async function patch(changes: Partial<Training>) {
    await store.trainings.update(id, changes);
  }

  async function setBlocks(blocks: TrainingBlock[]) {
    await patch({ blocks });
  }

  function togglePresence(playerId: string) {
    const checked = new Set(
      training!.attendance.length > 0 || training!.absent.length > 0
        ? training!.attendance
        : squad.map((player) => player.id),
    );
    if (checked.has(playerId)) checked.delete(playerId);
    else checked.add(playerId);
    const attendance = squad.filter((player) => checked.has(player.id)).map((player) => player.id);
    const absent = squad.filter((player) => !checked.has(player.id)).map((player) => player.id);
    void patch({ attendance, absent });
  }

  const attendanceChecked = (playerId: string) =>
    training.attendance.length === 0 && training.absent.length === 0
      ? true
      : training.attendance.includes(playerId);

  async function addBlock(kind: BlockKind) {
    const block: TrainingBlock = {
      id: newId(),
      kind,
      exerciseId: null,
      title: BLOCK_LABELS[kind],
      minutes: kind === 'warmup' ? 15 : kind === 'cooldown' ? 10 : 20,
      variantId: null,
      note: null,
    };
    await setBlocks([...training!.blocks, block]);
    setPicking({ blockId: block.id, kind });
  }

  async function pickExercise(blockId: string, exercise: Exercise) {
    await setBlocks(
      training!.blocks.map((block) =>
        block.id === blockId
          ? { ...block, exerciseId: exercise.id, title: null, minutes: exercise.minutes, variantId: null }
          : block,
      ),
    );
    setPicking(null);
  }

  async function move(blockId: string, direction: -1 | 1) {
    const blocks = [...training!.blocks];
    const index = blocks.findIndex((block) => block.id === blockId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    const [moved] = blocks.splice(index, 1);
    if (moved) blocks.splice(target, 0, moved);
    await setBlocks(blocks);
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <button type="button" className="linkbutton" onClick={() => go({ name: 'trainings' })}>
          ← Trainingen
        </button>
        <div className="screen__actions">
          <a className="button button--primary" href={href({ name: 'sheet', id: training.id })}>
            Trainingsblad
          </a>
        </div>
      </header>

      <div className="grid grid--form">
        <Field label="Titel">
          <DraftInput
            className="input"
            value={training.title}
            onCommit={(title) => void patch({ title })}
          />
        </Field>
        <Field label="Datum">
          <input
            type="date"
            className="input"
            value={training.date}
            onChange={(event) => void patch({ date: event.target.value })}
          />
        </Field>
        <Field label="Aanvang">
          <input
            type="time"
            className="input"
            value={training.time ?? ''}
            onChange={(event) => void patch({ time: event.target.value || null })}
          />
        </Field>
        <Field label="Zaal">
          <DraftInput
            className="input"
            value={training.location ?? ''}
            onCommit={(location) => void patch({ location: location.trim() || null })}
          />
        </Field>
      </div>

      <Panel
        title={`Wie er zijn · ${present.length} van ${squad.length}`}
        action={
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setShowAttendance(!showAttendance)}
          >
            {showAttendance ? 'Inklappen' : 'Uitklappen'}
          </button>
        }
      >
        {squad.length === 0 ? (
          <p className="muted">
            Er staat nog geen team in de app. Vul je selectie in op{' '}
            <a href={href({ name: 'manage' })}>de beheerpagina</a>.
          </p>
        ) : (
          showAttendance && (
            <>
              <div className="attendance">
                {squad.map((player) => (
                  <label key={player.id} className="attendance__item">
                    <input
                      type="checkbox"
                      checked={attendanceChecked(player.id)}
                      onChange={() => togglePresence(player.id)}
                    />
                    <PlayerName player={player} />
                  </label>
                ))}
              </div>
              <div className="row">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => void patch({ attendance: squad.map((p) => p.id), absent: [] })}
                >
                  Iedereen aanwezig
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => void patch({ attendance: [], absent: squad.map((p) => p.id) })}
                >
                  Niemand
                </button>
              </div>
            </>
          )
        )}
      </Panel>

      <Panel
        title={`Opbouw · ${plan.minutes} min${plan.endsAt ? ` (tot ${plan.endsAt})` : ''}`}
        action={
          plan.minutes > 0 ? (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => void setBlocks(rescale(training.blocks, 90))}
            >
              Naar 90 min
            </button>
          ) : null
        }
      >
        {plan.blocks.length === 0 && (
          <p className="muted">Nog geen blokken. Voeg er hieronder een toe.</p>
        )}

        <ol className="blocks">
          {plan.blocks.map((blockPlan, index) => (
            <li key={blockPlan.block.id} className={`block block--${blockPlan.kind}`}>
              <div className="block__head">
                <span className="block__kind">{BLOCK_LABELS[blockPlan.kind]}</span>
                {blockPlan.startsAt && <span className="block__time">{blockPlan.startsAt}</span>}
                <h3>
                  {blockPlan.exercise ? (
                    <a href={href({ name: 'exercise', id: blockPlan.exercise.id })}>
                      {blockPlan.title}
                    </a>
                  ) : (
                    blockPlan.title
                  )}
                </h3>
                <input
                  type="number"
                  className="input input--tiny"
                  min={5}
                  max={90}
                  step={5}
                  value={blockPlan.minutes}
                  aria-label="Minuten"
                  onChange={(event) =>
                    void setBlocks(
                      training.blocks.map((block) =>
                        block.id === blockPlan.block.id
                          ? { ...block, minutes: Number(event.target.value) }
                          : block,
                      ),
                    )
                  }
                />
                <span className="muted">min</span>
              </div>

              {blockPlan.exercise && (
                <p className="muted">{blockPlan.exercise.summary}</p>
              )}

              {blockPlan.exercise && blockPlan.exercise.variants.length > 0 && (
                <select
                  className="input input--small"
                  value={blockPlan.block.variantId ?? ''}
                  onChange={(event) =>
                    void setBlocks(
                      training.blocks.map((block) =>
                        block.id === blockPlan.block.id
                          ? { ...block, variantId: event.target.value || null }
                          : block,
                      ),
                    )
                  }
                >
                  <option value="">Gewone vorm</option>
                  {blockPlan.exercise.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.title}
                    </option>
                  ))}
                </select>
              )}

              {blockPlan.warnings.map((warning, wIndex) => (
                <Warning key={wIndex} severity={warning.severity}>
                  {warning.text}
                </Warning>
              ))}

              {blockPlan.alternatives.length > 0 && (
                <div className="block__alternatives">
                  <p className="muted">Past wél bij {present.length} speelsters:</p>
                  {blockPlan.alternatives.map((alternative) => (
                    <button
                      key={alternative.id}
                      type="button"
                      className="chip"
                      onClick={() => void pickExercise(blockPlan.block.id, alternative)}
                    >
                      {alternative.title}
                    </button>
                  ))}
                </div>
              )}

              {blockPlan.assignment && blockPlan.assignment.distribution.possible && (
                <GroupPlan
                  assignment={blockPlan.assignment}
                  rounds={blockPlan.rounds}
                  rotateEveryMinutes={blockPlan.rotateEveryMinutes}
                  compact
                />
              )}

              <DraftTextarea
                className="input input--note"
                placeholder="Aantekening voor tijdens de training"
                value={blockPlan.block.note ?? ''}
                onCommit={(note) =>
                  void setBlocks(
                    training.blocks.map((block) =>
                      block.id === blockPlan.block.id
                        ? { ...block, note: note.trim() || null }
                        : block,
                    ),
                  )
                }
              />

              <div className="block__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setPicking({ blockId: blockPlan.block.id, kind: blockPlan.kind })}
                >
                  {blockPlan.exercise ? 'Andere oefening' : 'Oefening kiezen'}
                </button>
                <button
                  type="button"
                  className="button button--icon"
                  onClick={() => void move(blockPlan.block.id, -1)}
                  disabled={index === 0}
                  aria-label="Naar boven"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="button button--icon"
                  onClick={() => void move(blockPlan.block.id, 1)}
                  disabled={index === plan.blocks.length - 1}
                  aria-label="Naar beneden"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() =>
                    void setBlocks(training.blocks.filter((block) => block.id !== blockPlan.block.id))
                  }
                >
                  Weg
                </button>
              </div>
            </li>
          ))}
        </ol>

        <div className="row row--wrap">
          {BLOCK_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="button"
              onClick={() => void addBlock(kind)}
            >
              + {BLOCK_LABELS[kind]}
            </button>
          ))}
        </div>
      </Panel>

      {plan.minutesPerGoal.size > 0 && (
        <Panel title="Waar de tijd heen gaat">
          <ul className="balance">
            {[...plan.minutesPerGoal.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([goal, minutes]) => (
                <li key={goal}>
                  <span className="balance__label">{GOAL_LABELS[goal]}</span>
                  <span className="balance__bar" style={{ width: `${(minutes / plan.minutes) * 100}%` }} />
                  <span className="balance__value">{Math.round(minutes)} min</span>
                </li>
              ))}
          </ul>
        </Panel>
      )}

      <Panel title="Delen en opruimen">
        <div className="chips">
          {(['private', 'public'] as Visibility[]).map((visibility) => (
            <button
              key={visibility}
              type="button"
              className={`chip ${training.visibility === visibility ? 'is-active' : ''}`}
              onClick={() => void patch({ visibility, groupIds: [] })}
            >
              {VISIBILITY_LABELS[visibility]}
            </button>
          ))}
          {data.groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`chip ${
                training.visibility === 'group' && training.groupIds.includes(group.id)
                  ? 'is-active'
                  : ''
              }`}
              onClick={() => {
                const has = training.groupIds.includes(group.id);
                const groupIds = has
                  ? training.groupIds.filter((item) => item !== group.id)
                  : [...training.groupIds, group.id];
                void patch({
                  visibility: groupIds.length > 0 ? 'group' : 'private',
                  groupIds,
                });
              }}
            >
              {group.name}
            </button>
          ))}
        </div>
        <div className="row">
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void patch({ done: !training.done })}
          >
            {training.done ? 'Weer openzetten' : 'Afvinken als gegeven'}
          </button>
          <button
            type="button"
            className="button button--danger"
            onClick={async () => {
              if (!confirm(`Training van ${formatDate(training.date)} weggooien?`)) return;
              await store.trainings.remove(training.id);
              go({ name: 'trainings' });
            }}
          >
            Training weggooien
          </button>
        </div>
      </Panel>

      {picking && (
        <ExercisePicker
          library={data.library}
          meId={data.profile.id}
          groups={data.groups}
          participants={present.length || null}
          kind={picking.kind}
          onPick={(exercise) => void pickExercise(picking.blockId, exercise)}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
