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

async function renderScoring(
  role: 'scorer' | 'assistant' = 'scorer',
): Promise<{ store: ScoutingStore; matchId: string; setId: string }> {
  const store = await openTestStore();
  const fixture = await seedMatch(store);
  if (role === 'assistant') {
    // Een assistent haakt aan op de rally die de hoofdinvoerder open heeft staan.
    await store.rallies.start({ setId: fixture.set.id });
  }

  render(
    <StoreProvider store={store}>
      <ScoringScreen
        matchId={fixture.match.id}
        session={idleSession}
        role={role}
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

    await user.click(screen.getByRole('button', { name: '#4 Sanne' }));
    await user.click(screen.getByRole('button', { name: 'Service' }));
    await user.click(screen.getByRole('button', { name: 'Zone 1 (rechtsachter)' }));
    await user.click(screen.getByRole('button', { name: /^Goed/ }));

    await waitFor(async () => {
      const actions = await store.actions.listByMatch(matchId);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({ type: 'serve', quality: 'good', zoneFrom: 1, team: 'us' });
    });

    // De keten laat de actie zien zoals in het schermontwerp: #4 service z1 goed.
    expect(await screen.findByText('#4')).toBeDefined();
    expect(screen.getByText('service')).toBeDefined();
    expect(screen.getByText('z1')).toBeDefined();
  });

  it('rondt de rally af zodra een actie hem beëindigt', async () => {
    const user = userEvent.setup();
    const { store, setId } = await renderScoring();

    await user.click(screen.getByRole('button', { name: '#9 Fem' }));
    await user.click(screen.getByRole('button', { name: 'Aanval' }));
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

    await user.click(screen.getByRole('button', { name: '#7 Noor' }));
    await user.click(screen.getByRole('button', { name: 'Aanval' }));

    // De zone is bij een aanval verplicht: overslaan bestaat hier niet, en de
    // kwalificatiestap komt pas ná de zone in beeld.
    expect(screen.queryByRole('button', { name: 'Zone overslaan' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Perfect/ })).toBeNull();
    expect(screen.getByText('Waar stond de speler?')).toBeDefined();
  });

  it('maakt de laatste actie ongedaan', async () => {
    const user = userEvent.setup();
    const { store, matchId } = await renderScoring();

    await user.click(screen.getByRole('button', { name: '#4 Sanne' }));
    await user.click(screen.getByRole('button', { name: 'Pass' }));
    await user.click(screen.getByRole('button', { name: /^Matig/ }));
    await waitFor(async () => expect(await store.actions.listByMatch(matchId)).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'Undo actie' }));
    await waitFor(async () => expect(await store.actions.listByMatch(matchId)).toHaveLength(0));
    expect(await screen.findByText(/Nog geen acties in deze rally/)).toBeDefined();
  });
});

describe('ScoringScreen als assistent', () => {
  it('voert acties in maar bepaalt het verloop van de rally niet', async () => {
    const user = userEvent.setup();
    const { store, matchId, setId } = await renderScoring('assistant');

    // Aanvullen mag.
    await user.click(screen.getByRole('button', { name: '#4 Sanne' }));
    await user.click(screen.getByRole('button', { name: 'Pass' }));
    await user.click(screen.getByRole('button', { name: /^Goed/ }));
    await waitFor(async () => expect(await store.actions.listByMatch(matchId)).toHaveLength(1));

    // Afronden, undo van een hele rally, sets en opstelling horen bij de
    // hoofdinvoerder: twee apparaten die dat tegelijk doen, botsen.
    expect(screen.queryByRole('button', { name: 'Punt wij' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Punt zij' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Undo rally' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set afronden' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Opstelling' })).toBeNull();

    expect(await store.rallies.listBySet(setId)).toHaveLength(1);
  });

  it('rondt de rally niet af bij een beëindigende actie', async () => {
    const user = userEvent.setup();
    const { store, setId } = await renderScoring('assistant');

    await user.click(screen.getByRole('button', { name: '#9 Fem' }));
    await user.click(screen.getByRole('button', { name: 'Aanval' }));
    await user.click(screen.getByRole('button', { name: 'Zone 4 (linksvoor)' }));
    await user.click(screen.getByRole('button', { name: /^Fout/ }));

    // De actie staat er, maar de stand blijft aan de hoofdinvoerder.
    await waitFor(() =>
      expect(screen.getByText(/hoofdinvoerder rondt de rally af/)).toBeDefined(),
    );
    const rallies = await store.rallies.listBySet(setId);
    expect(rallies).toHaveLength(1);
    expect(rallies[0]?.wonBy).toBeNull();
    expect((await store.sets.require(setId)).pointsThem).toBe(0);
  });

  it('wacht als de hoofdinvoerder nog geen rally open heeft staan', async () => {
    const store = await openTestStore();
    const fixture = await seedMatch(store);

    render(
      <StoreProvider store={store}>
        <ScoringScreen
          matchId={fixture.match.id}
          session={idleSession}
          role="assistant"
          onExit={() => {}}
          onOpenDashboard={() => {}}
        />
      </StoreProvider>,
    );

    expect(await screen.findByText(/Wachten op de hoofdinvoerder/)).toBeDefined();
    expect(await store.rallies.listBySet(fixture.set.id)).toHaveLength(0);
  });
});
