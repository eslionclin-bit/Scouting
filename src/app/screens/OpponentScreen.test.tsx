// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OpponentScreen } from './OpponentScreen';
import { StoreProvider } from '../StoreProvider';
import { openTestStore } from '../../test/factory';
import type { ScoutingStore } from '../../db/store';
import type { Zone } from '../../domain/types';

afterEach(cleanup);

/** Zet één wedstrijd neer met het opgegeven aantal aanvallen van de tegenstander. */
async function renderDossier(attacks: number): Promise<{ store: ScoutingStore }> {
  const store = await openTestStore();
  const ownTeam = await store.teams.create({ name: 'Onze ploeg', isOwnTeam: true });
  const opponent = await store.teams.findOrCreateOpponent('VC Noord');
  const match = await store.matches.create({
    date: '2026-09-12',
    ownTeamId: ownTeam.id,
    opponentTeamId: opponent.id,
    homeAway: 'home',
    status: 'finished',
  });
  const set = await store.sets.start({ matchId: match.id, startingServe: 'them' });

  for (let i = 0; i < attacks; i++) {
    const rally = await store.rallies.start({ setId: set.id });
    await store.actions.append({
      rallyId: rally.id,
      team: 'them',
      type: 'attack',
      quality: 'perfect',
      zoneFrom: 4 as Zone,
    });
    await store.rallies.complete(rally.id);
  }

  render(
    <StoreProvider store={store}>
      <OpponentScreen opponentId={opponent.id} onExit={() => {}} onOpenMatch={() => {}} />
    </StoreProvider>,
  );
  await screen.findByText('Belangrijkste patronen');
  return { store };
}

describe('OpponentScreen', () => {
  it('zegt niets zolang er te weinig is vastgelegd', async () => {
    await renderDossier(4);

    // Vier aanvallen, allemaal uit dezelfde zone: een patroon dat er sterk
    // uitziet maar nergens op berust. Het dossier hoort dat te weigeren.
    expect(screen.getByText(/Nog te weinig vastgelegd/)).toBeDefined();
    expect(screen.queryByText('Tactisch advies')).toBeNull();
  });

  it('toont patronen met het aantal waarnemingen erbij, en advies dat daarnaar verwijst', async () => {
    await renderDossier(14);

    // De bevinding staat er één keer als patroon en één keer als onderbouwing
    // onder het advies: precies de koppeling die de brief vraagt.
    expect(screen.getAllByText(/100% levert direct een punt op/)).toHaveLength(2);
    expect(screen.getAllByText(/op 14 waarnemingen/).length).toBeGreaterThan(0);

    expect(screen.getByText('Tactisch advies')).toBeDefined();
    expect(screen.getByText(/Zet het blok vroeg naar die kant/)).toBeDefined();
  });

  it('zet het onderlinge verleden in de kop', async () => {
    await renderDossier(14);

    expect(screen.getByText('VC Noord')).toBeDefined();
    expect(screen.getByText(/1 wedstrijd gespeeld · 14 acties vastgelegd/)).toBeDefined();
  });
});
