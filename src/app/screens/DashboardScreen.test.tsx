// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DashboardScreen } from './DashboardScreen';
import { StoreProvider } from '../StoreProvider';
import { openTestStore, seedMatch } from '../../test/factory';
import type { ScoutingStore } from '../../db/store';

afterEach(cleanup);

/**
 * Twee rally's: wij winnen de eerste met een kill vanaf zone 4, en verliezen de
 * tweede door een aanvalsfout. Genoeg om te zien of de cijfers en de filters op
 * dezelfde data uitkomen.
 */
async function renderDashboard(): Promise<ScoutingStore> {
  const store = await openTestStore();
  const fixture = await seedMatch(store);
  const [sanne, , fem] = fixture.players;

  const first = await store.rallies.start({ setId: fixture.set.id });
  await store.actions.append({
    rallyId: first.id,
    team: 'us',
    type: 'serve',
    quality: 'good',
    playerId: sanne!.id,
    zoneFrom: 1,
  });
  await store.actions.append({
    rallyId: first.id,
    team: 'us',
    type: 'attack',
    quality: 'perfect',
    playerId: fem!.id,
    zoneFrom: 4,
  });
  await store.rallies.complete(first.id);

  const second = await store.rallies.start({ setId: fixture.set.id });
  await store.actions.append({
    rallyId: second.id,
    team: 'us',
    type: 'attack',
    quality: 'error',
    playerId: fem!.id,
    zoneFrom: 4,
  });
  await store.rallies.complete(second.id);

  render(
    <StoreProvider store={store}>
      <DashboardScreen matchId={fixture.match.id} onExit={() => {}} />
    </StoreProvider>,
  );
  await screen.findByText('Per speler');
  return store;
}

describe('DashboardScreen', () => {
  it('toont de kerncijfers van de wedstrijd', async () => {
    await renderDashboard();

    const points = screen.getByText('Punten wij').closest('.tile-stat');
    expect(within(points as HTMLElement).getByText('1')).toBeDefined();

    // Twee aanvallen: één punt, één fout — rendement nul.
    const efficiency = screen.getByText('Rendement aanval').closest('.tile-stat');
    expect(within(efficiency as HTMLElement).getByText('0%')).toBeDefined();
    expect(within(efficiency as HTMLElement).getByText(/1 punt · 1 fout · 2 totaal/)).toBeDefined();
  });

  it('zet de cijfers per speler in een tabel', async () => {
    await renderDashboard();

    const row = screen.getByRole('row', { name: /#9 Fem/ });
    expect(within(row).getByText('2 · 50% pt · 50% fout')).toBeDefined();
  });

  it('laat de zoneverdeling zien met aantallen naast de kleur', async () => {
    await renderDashboard();

    // Beide aanvallen kwamen uit zone 4, dus daar staat 100%.
    const cell = screen.getAllByTitle(/Zone 4 \(linksvoor\)/)[0];
    expect(cell?.textContent).toContain('2');
    expect(cell?.textContent).toContain('100%');
  });

  it('rekent opnieuw als er op een rotatie wordt gefilterd', async () => {
    const user = userEvent.setup();
    await renderDashboard();

    // In rotatie 2 is nog niets gespeeld: alle tellingen vallen terug op nul.
    await user.click(screen.getByRole('button', { name: 'R2' }));

    await waitFor(() => {
      const points = screen.getByText('Punten wij').closest('.tile-stat');
      expect(within(points as HTMLElement).getByText('0')).toBeDefined();
    });
    expect(screen.getByText(/Nog geen afgeronde rally's in deze selectie/)).toBeDefined();
  });
});
