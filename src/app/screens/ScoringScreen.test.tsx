// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ScoringScreen } from './ScoringScreen';
import { StoreProvider } from '../StoreProvider';
import { openTestStore, seedMatch } from '../../test/factory';
import type { PeerSession } from '../hooks/usePeerSession';
import type { ScoutingStore } from '../../db/store';

afterEach(cleanup);

/** Geen gekoppeld apparaat: koppelen is een aparte laag en hoort hier niet in de weg te zitten. */
const idleSession: PeerSession = {
  supported: false,
  status: 'idle',
  peers: 0,
  lastUpdateAt: null,
  error: null,
  code: null,
  invite: async () => {},
  confirm: async () => {},
  answer: async () => {},
  disconnect: () => {},
};

async function renderScoring(): Promise<{ store: ScoutingStore; matchId: string; setId: string }> {
  const store = await openTestStore();
  const fixture = await seedMatch(store);
  render(
    <StoreProvider store={store}>
      <ScoringScreen
        matchId={fixture.match.id}
        session={idleSession}
        onExit={() => {}}
        onOpenDashboard={() => {}}
      />
    </StoreProvider>,
  );
  await screen.findByText(/Nog geen acties in deze rally/);
  return { store, matchId: fixture.match.id, setId: fixture.set.id };
}

describe('ScoringScreen', () => {
  it('legt een actie vast via speler, zone en kwalificatie', async () => {
    const user = userEvent.setup();
    const { store, matchId } = await renderScoring();

    await user.click(screen.getByRole('button', { name: 'Opslag' }));
    await user.click(screen.getByRole('button', { name: '#4 Sanne' }));
    await user.click(screen.getByRole('button', { name: 'Zone 1 (rechtsachter)' }));
    await user.click(screen.getByRole('button', { name: /^Goed/ }));

    await waitFor(async () => {
      const actions = await store.actions.listByMatch(matchId);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ type: 'serve', quality: 'good', zoneFrom: 1, team: 'us' });
    });

    // De keten laat de actie zien zoals in het schermontwerp: #4 opslag z1 goed.
    expect(await screen.findByText('#4')).toBeDefined();
    expect(screen.getByText('opslag')).toBeDefined();
    expect(screen.getByText('z1')).toBeDefined();
  });

  it('rondt de rally af zodra een actie hem beëindigt', async () => {
    const user = userEvent.setup();
    const { store, setId } = await renderScoring();

    await user.click(screen.getByRole('button', { name: 'Aanval' }));
    await user.click(screen.getByRole('button', { name: '#9 Fem' }));
    await user.click(screen.getByRole('button', { name: 'Zone 4 (linksvoor)' }));
    await user.click(screen.getByRole('button', { name: /^Perfect/ }));

    // Perfecte aanval = direct punt, dus de setstand loopt op en er staat een
    // verse rally klaar.
    await waitFor(async () => {
      expect((await store.sets.require(setId)).pointsUs).toBe(1);
    });
    await waitFor(async () => {
      const rallies = await store.rallies.listBySet(setId);
      expect(rallies).toHaveLength(2);
      expect(rallies[1]?.wonBy).toBeNull();
    });
  });

  it('weigert een aanval zonder vertrekzone en zegt waarom', async () => {
    const user = userEvent.setup();
    await renderScoring();

    await user.click(screen.getByRole('button', { name: 'Aanval' }));
    await user.click(screen.getByRole('button', { name: '#7 Noor' }));

    // Zonder zone blijft de kwalificatiestap onbruikbaar, want het protocol
    // maakt de vertrekzone bij een aanval verplicht.
    expect(screen.getByRole('button', { name: /^Perfect/ })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Zone overslaan' })).toBeNull();
  });

  it('maakt de laatste actie ongedaan', async () => {
    const user = userEvent.setup();
    const { store, matchId } = await renderScoring();

    await user.click(screen.getByRole('button', { name: 'Receptie' }));
    await user.click(screen.getByRole('button', { name: '#4 Sanne' }));
    await user.click(screen.getByRole('button', { name: /^Matig/ }));
    await waitFor(async () => expect(await store.actions.listByMatch(matchId)).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'Undo actie' }));
    await waitFor(async () => expect(await store.actions.listByMatch(matchId)).toHaveLength(0));
    expect(await screen.findByText(/Nog geen acties in deze rally/)).toBeDefined();
  });
});
