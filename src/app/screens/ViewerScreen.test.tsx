// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ViewerScreen } from './ViewerScreen';
import { StoreProvider } from '../StoreProvider';
import { openTestStore, seedMatch } from '../../test/factory';
import type { PeerSession } from '../hooks/usePeerSession';
import type { ScoutingStore } from '../../db/store';

afterEach(cleanup);

const connectedSession: PeerSession = {
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

async function renderViewer(): Promise<{ store: ScoutingStore; setId: string }> {
  const store = await openTestStore('device-viewer');
  const fixture = await seedMatch(store);

  const rally = await store.rallies.start({ setId: fixture.set.id });
  await store.actions.append({
    rallyId: rally.id,
    team: 'us',
    type: 'serve',
    quality: 'perfect',
    playerId: fixture.players[0]!.id,
    zoneFrom: 1,
  });
  await store.rallies.complete(rally.id);

  render(
    <StoreProvider store={store}>
      <ViewerScreen
        matchId={fixture.match.id}
        session={connectedSession}
        onExit={() => {}}
        onOpenDashboard={() => {}}
        onSwitchToScoring={() => {}}
      />
    </StoreProvider>,
  );
  await screen.findByText("Laatste rally's");
  return { store, setId: fixture.set.id };
}

describe('ViewerScreen', () => {
  it('spiegelt stand en rally-verloop van de invoerder', async () => {
    await renderViewer();

    expect(screen.getByText(/Set 1 · meelezen/)).toBeDefined();
    const points = document.querySelector('.topbar__points');
    expect(points?.textContent?.replace(/\s+/g, ' ')).toContain('1 – 0');
    expect(screen.getByText(/#4 opslag perfect/)).toBeDefined();
    expect(screen.getByText('verbonden')).toBeDefined();
  });

  it('schrijft zelf niets aan de wedstrijd', async () => {
    const { store, setId } = await renderViewer();

    // Het invoerscherm maakt een openstaande rally aan zodra het opent; het
    // meeleesscherm hoort dat juist niet te doen — het kijkt alleen mee.
    const rallies = await store.rallies.listBySet(setId);
    expect(rallies).toHaveLength(1);
    expect(rallies[0]?.wonBy).toBe('us');

    expect(screen.getByText(/Nog geen acties in deze rally/)).toBeDefined();
    // Geen invoerknoppen: undo, kwalificaties en punt-knoppen ontbreken.
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Perfect/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Punt wij' })).toBeNull();
  });
});
