// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { CoachScreen } from './CoachScreen';
import { StoreProvider } from '../StoreProvider';
import { openTestStore, seedMatch } from '../../test/factory';
import type { PeerSession } from '../hooks/usePeerSession';
import type { ScoutingStore } from '../../db/store';
import type { TeamSide } from '../../domain/types';

afterEach(cleanup);

const connected: PeerSession = {
  supported: true,
  status: 'connected',
  peers: 1,
  lastUpdateAt: null,
  error: null,
  code: null,
  invite: async () => {},
  confirm: async () => {},
  answer: async () => {},
  disconnect: () => {},
};

async function renderCoach(rallies: number): Promise<{ store: ScoutingStore; setId: string }> {
  const store = await openTestStore();
  const fixture = await seedMatch(store);

  // De tegenstander wint alles met een aanval vanuit zone 4.
  for (let i = 0; i < rallies; i++) {
    const rally = await store.rallies.start({ setId: fixture.set.id });
    await store.actions.append({
      rallyId: rally.id,
      team: 'them' as TeamSide,
      type: 'attack',
      quality: 'perfect',
      zoneFrom: 4,
    });
    await store.rallies.complete(rally.id);
  }

  render(
    <StoreProvider store={store}>
      <CoachScreen
        matchId={fixture.match.id}
        session={connected}
        onExit={() => {}}
        onOpenDashboard={() => {}}
        onOpenOpponent={() => {}}
        onSwitchToScoring={() => {}}
      />
    </StoreProvider>,
  );
  await screen.findByText('Sideout per rotatie');
  return { store, setId: fixture.set.id };
}

describe('CoachScreen', () => {
  it('zwijgt zolang er te weinig gespeeld is', async () => {
    await renderCoach(2);

    expect(screen.getByText(/Nog te weinig gespeeld/)).toBeDefined();
    expect(screen.queryByText(/Blok naar/)).toBeNull();
  });

  it('zet bovenaan wat er nu aan de hand is, met de telling erbij', async () => {
    await renderCoach(9);

    // Een reeks tegen is het eerste wat een coach moet zien.
    expect(screen.getByText(/punten op rij tegen/)).toBeDefined();
    expect(screen.getByText('Blok naar zone 4 (linksvoor)')).toBeDefined();
    expect(screen.getByText(/9 van 9 aanvallen komen daarvandaan/)).toBeDefined();
  });

  it('geeft in de time-out hooguit drie zinnen om te zeggen', async () => {
    const user = userEvent.setup();
    await renderCoach(9);

    await user.click(screen.getByRole('button', { name: 'Time-out' }));

    const points = screen.getAllByRole('listitem').filter((item) => item.closest('.timeout__points'));
    expect(points.length).toBeGreaterThan(0);
    expect(points.length).toBeLessThanOrEqual(3);
  });

  it('schrijft zelf niets aan de wedstrijd', async () => {
    const { store, setId } = await renderCoach(3);

    // Het invoerscherm maakt een openstaande rally aan zodra het opent; de bank
    // hoort dat niet te doen — daar wordt alleen gekeken.
    const rallies = await store.rallies.listBySet(setId);
    expect(rallies).toHaveLength(3);
    expect(rallies.every((rally) => rally.wonBy !== null)).toBe(true);

    expect(screen.queryByRole('button', { name: 'Punt wij' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Perfect/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
  });
});
