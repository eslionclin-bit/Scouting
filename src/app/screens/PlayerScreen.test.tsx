// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayerScreen } from './PlayerScreen';
import { StoreProvider } from '../StoreProvider';
import { openTestStore, seedMatch } from '../../test/factory';
import type { Quality } from '../../domain/types';

afterEach(cleanup);

describe('spelerscherm', () => {
  it('toont de cijfers van één speler en laat je naar de wedstrijd doorklikken', async () => {
    const store = await openTestStore();
    const fixture = await seedMatch(store);
    const fem = fixture.players.find((player) => player.number === 9)!;

    for (const quality of ['perfect', 'perfect', 'error'] as Quality[]) {
      const rally = await store.rallies.start({ setId: fixture.set.id });
      await store.actions.append({
        rallyId: rally.id,
        team: 'us',
        type: 'attack',
        quality,
        playerId: fem.id,
        zoneFrom: 4,
      });
      await store.rallies.complete(rally.id, quality === 'error' ? 'them' : 'us');
    }

    const opened: string[] = [];
    render(
      <StoreProvider store={store}>
        <PlayerScreen playerId={fem.id} onExit={() => {}} onOpenMatch={(id) => opened.push(id)} />
      </StoreProvider>,
    );

    expect(await screen.findByRole('heading', { level: 1, name: '#9 Fem' })).toBeTruthy();
    // Twee punten en één fout uit drie aanvallen: rendement +33%.
    expect(screen.getByText('+33%')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: fixture.match.date }));
    expect(opened).toStrictEqual([fixture.match.id]);

    store.close();
  });

  it('zegt het gewoon als er nog niets van deze speler is vastgelegd', async () => {
    const store = await openTestStore();
    const fixture = await seedMatch(store);

    render(
      <StoreProvider store={store}>
        <PlayerScreen
          playerId={fixture.players[0]!.id}
          onExit={() => {}}
          onOpenMatch={() => {}}
        />
      </StoreProvider>,
    );

    expect(await screen.findByText(/Nog geen acties van deze speler/)).toBeTruthy();
    store.close();
  });
});
