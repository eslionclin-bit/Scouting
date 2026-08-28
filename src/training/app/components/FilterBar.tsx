/**
 * De filterbalk boven de bank.
 *
 * Staat apart omdat hij op twee plekken hoort: in de bank zelf, en in het
 * venster waarin je een oefening bij een training zoekt. Daar wil je precies
 * dezelfde filters — en één ervan staat er dan al ingevuld: het aantal
 * aanwezigen van die training.
 */

import { ORIGIN_LABELS, type LibraryFilter, type Origin } from '../../domain/library';
import { GOALS, GOAL_LABELS, VISIBILITY_LABELS, type Goal, type Visibility } from '../../domain/types';
import { Chip } from './ui';

const ORIGINS: Origin[] = ['mine', 'others', 'builtin'];
const VISIBILITIES: Visibility[] = ['private', 'group', 'public'];

export function FilterBar({
  filter,
  onChange,
  groups,
  showParticipants = true,
}: {
  filter: LibraryFilter;
  onChange: (filter: LibraryFilter) => void;
  groups: readonly { id: string; name: string }[];
  showParticipants?: boolean;
}) {
  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  return (
    <div className="filters">
      <input
        type="search"
        className="input filters__search"
        placeholder="Zoeken in de bank…"
        value={filter.search}
        onChange={(event) => onChange({ ...filter, search: event.target.value })}
      />

      <div className="filters__row">
        <span className="filters__label">Traint</span>
        <div className="chips">
          {GOALS.map((goal: Goal) => (
            <Chip
              key={goal}
              active={filter.goals.includes(goal)}
              onClick={() => onChange({ ...filter, goals: toggle(filter.goals, goal) })}
            >
              {GOAL_LABELS[goal]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="filters__row">
        <span className="filters__label">Van wie</span>
        <div className="chips">
          {ORIGINS.map((origin) => (
            <Chip
              key={origin}
              active={filter.origins.includes(origin)}
              onClick={() => onChange({ ...filter, origins: toggle(filter.origins, origin) })}
            >
              {ORIGIN_LABELS[origin]}
            </Chip>
          ))}
          {VISIBILITIES.map((visibility) => (
            <Chip
              key={visibility}
              active={filter.visibilities.includes(visibility)}
              onClick={() =>
                onChange({ ...filter, visibilities: toggle(filter.visibilities, visibility) })
              }
            >
              {VISIBILITY_LABELS[visibility]}
            </Chip>
          ))}
          {groups.map((group) => (
            <Chip
              key={group.id}
              active={filter.groupId === group.id}
              onClick={() =>
                onChange({ ...filter, groupId: filter.groupId === group.id ? null : group.id })
              }
            >
              {group.name}
            </Chip>
          ))}
        </div>
      </div>

      <div className="filters__row">
        {showParticipants && (
          <label className="filters__number">
            Aantal spelers
            <input
              type="number"
              className="input input--small"
              min={1}
              max={30}
              value={filter.participants ?? ''}
              placeholder="alle"
              onChange={(event) =>
                onChange({
                  ...filter,
                  participants: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
          </label>
        )}
        <label className="filters__number">
          Hooguit
          <input
            type="number"
            className="input input--small"
            min={5}
            max={120}
            step={5}
            value={filter.maxMinutes ?? ''}
            placeholder="min."
            onChange={(event) =>
              onChange({
                ...filter,
                maxMinutes: event.target.value === '' ? null : Number(event.target.value),
              })
            }
          />
        </label>
        <Chip
          active={filter.withAnimation}
          onClick={() => onChange({ ...filter, withAnimation: !filter.withAnimation })}
        >
          Met animatie
        </Chip>
      </div>
    </div>
  );
}
