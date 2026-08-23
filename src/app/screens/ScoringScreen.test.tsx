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
  // De app vraagt vóór het eerste punt om de opstelling; deze tests gaan over
  // de invoer zelf, dus die stap wordt hier overgeslagen zoals een invoerder
  // dat ook kan.
  const later = screen.queryByRole('button', { name: /Weet ik nog niet/ });
  if (later) await userEvent.click(later);
  return { store, matchId: fixture.match.id, setId: fixture.set.id };
}

describe('ScoringScreen', () => {
  it('legt een actie vast via speler, zone en kwalificatie', async () => {
    const user = userEvent.setup();
    const { store, matchId } = await renderScoring();

    await user.click(screen.getByRole('button', { name: '#4 Sanne' }));
    await user.click(screen.getByRole('button', { name: 'Service' }));
    // Bij een service kies je een plek achter de achterlijn, geen veldzone.
    await user.click(screen.getByRole('button', { name: 'Rechts' }));
    // Daarna: op wie. Zonder die tik weet de app niet waar er geserveerd werd,
    // en dan blijft het serveeradvies leeg.
    await user.click(screen.getByRole('button', { name: 'Positie 5' }));
    await user.click(screen.getByRole('button', { name: /^Goed/ }));

    await waitFor(async () => {
      const actions = await store.actions.listByMatch(matchId);
      // Twee: onze service, en de pass van de tegenstander die daaruit volgt.
      expect(actions).toHaveLength(2);
      expect(actions.find((action) => action.type === 'serve')).toMatchObject({
        quality: 'good',
        zoneFrom: 1,
        zoneTo: 5,
        team: 'us',
      });
      expect(actions.find((action) => action.type === 'reception')).toMatchObject({
        team: 'them',
        // Onze service zette hen onder druk, dus hun pass was matig. Gespiegeld,
        // niet apart gevraagd — vandaar het merkteken.
        quality: 'poor',
        zoneFrom: 5,
        derived: true,
      });
    });

    // De keten laat de actie zien zoals in het schermontwerp: #4 service z1→z5.
    expect(await screen.findByText('#4')).toBeDefined();
    expect(screen.getByText('service')).toBeDefined();
    expect(screen.getByText('z1→z5')).toBeDefined();
  });

  it('rondt de rally af zodra een actie hem beëindigt', async () => {
    const user = userEvent.setup();
    const { store, setId } = await renderScoring();

    await user.click(screen.getByRole('button', { name: '#9 Fem' }));
    await user.click(screen.getByRole('button', { name: 'Aanval' }));
    await user.click(screen.getByRole('button', { name: 'Zone 4 (linksvoor)' }));

    // Waarheen ze slaat komt eerst: bij 'matig' is dat de enige vraag die nog
    // overblijft, en dan wil je hem al gesteld hebben.
    await user.click(screen.getByRole('button', { name: /^Positie 1/ }));

    // Daarna de vraag naar tempo en blok; het blok brengt je door naar de
    // kwalificatie.
    expect(screen.getByText('Hoe ging de aanval?')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Snel' }));
    await user.click(screen.getByRole('button', { name: '2 blok' }));
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
    // Waarheen mag je overslaan; soms zie je het niet.
    await user.click(screen.getByRole('button', { name: 'Weet ik niet' }));
    await user.click(screen.getByRole('button', { name: 'Overslaan' }));
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

describe('ScoringScreen: regels van het spel', () => {
  it('vraagt eerst wie begint met serveren als dat nog niet bekend is', async () => {
    const user = userEvent.setup();
    const store = await openTestStore();
    const ownTeam = await store.teams.create({ name: 'VCH DS 1', isOwnTeam: true });
    const opponent = await store.teams.findOrCreateOpponent('VC Noord');
    await store.players.createMany([{ teamId: ownTeam.id, number: 4, name: 'Sanne' }]);
    const match = await store.matches.create({
      date: '2026-09-12',
      ownTeamId: ownTeam.id,
      opponentTeamId: opponent.id,
      homeAway: 'home',
      status: 'live',
    });
    // Zonder beginservice: die weet je pas na de warming-up.
    const set = await store.sets.start({ matchId: match.id });

    render(
      <StoreProvider store={store}>
        <ScoringScreen
          matchId={match.id}
          session={idleSession}
          role="scorer"
          onExit={() => {}}
          onOpenDashboard={() => {}}
        />
      </StoreProvider>,
    );

    expect(await screen.findByText('Wie begint met serveren?')).toBeDefined();
    expect(screen.queryByText('Wie speelde de bal?')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Tegenstander' }));

    await waitFor(async () => {
      expect((await store.sets.require(set.id)).startingServe).toBe('them');
    });

    // Daarna vraagt hij om de opstelling, want die moet er staan vóór het
    // eerste punt: de rotatie telt door vanaf de zes van het begin.
    await user.click(await screen.findByRole('button', { name: /Weet ik nog niet/ }));
    expect(await screen.findByText('Wie speelde de bal?')).toBeDefined();
  });

  it('laat dezelfde speler niet twee keer achter elkaar de bal spelen', async () => {
    const user = userEvent.setup();
    await renderScoring();

    await user.click(screen.getByRole('button', { name: '#4 Sanne' }));
    await user.click(screen.getByRole('button', { name: 'Pass' }));
    await user.click(screen.getByRole('button', { name: /^Goed/ }));

    // Terug naar de spelerstap voor de volgende actie in dezelfde rally. De
    // spelerslijst komt uit de opslag, dus even wachten tot die is bijgewerkt.
    await waitFor(() => expect(screen.getByText('Wie speelde de bal?')).toBeDefined());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '#4 Sanne' })).toHaveProperty('disabled', true),
    );
    expect(screen.getByRole('button', { name: '#7 Noor' })).toHaveProperty('disabled', false);
  });

  it('zet bij een eigen service de speler uit zone 1 al klaar', async () => {
    const store = await openTestStore();
    const fixture = await seedMatch(store);
    const [sanne, noor, fem] = fixture.players;

    await store.lineups.set({
      setId: fixture.set.id,
      positions: { 1: fem!.id, 2: noor!.id, 3: sanne!.id, 4: null, 5: null, 6: null },
    });

    render(
      <StoreProvider store={store}>
        <ScoringScreen
          matchId={fixture.match.id}
          session={idleSession}
          role="scorer"
          onExit={() => {}}
          onOpenDashboard={() => {}}
        />
      </StoreProvider>,
    );

    // Met een opstelling verschijnt de veldinvoer: #9 staat in zone 1, is dus
    // aan de beurt, en staat al geselecteerd. Een ace is één tik.
    const cell = await screen.findByRole('button', { name: '#9 Fem' });
    expect(cell.textContent).toContain('serveert');
    // De voorselectie volgt zodra de opstelling geladen is.
    await waitFor(() => expect(cell.getAttribute('aria-pressed')).toBe('true'));
    expect(await screen.findByText(/#9 Fem · zone 6/)).toBeDefined();
  });

  it('legt met de veldinvoer een actie vast in twee tikken', async () => {
    const user = userEvent.setup();
    const store = await openTestStore();
    const fixture = await seedMatch(store);
    const [sanne, noor, fem] = fixture.players;

    await store.lineups.set({
      setId: fixture.set.id,
      positions: { 1: fem!.id, 2: noor!.id, 3: sanne!.id, 4: null, 5: null, 6: null },
    });

    render(
      <StoreProvider store={store}>
        <ScoringScreen
          matchId={fixture.match.id}
          session={idleSession}
          role="scorer"
          onExit={() => {}}
          onOpenDashboard={() => {}}
        />
      </StoreProvider>,
    );

    // Eén tik: de server staat al klaar, dus alleen nog de kwalificatie.
    await user.click(await screen.findByRole('button', { name: 'Perfect' }));

    await waitFor(async () => {
      const actions = await store.actions.listBySet(fixture.set.id);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        team: 'us',
        type: 'serve',
        quality: 'perfect',
        playerId: fem!.id,
        zoneFrom: 6,
      });
    });

    // Een ace beëindigt de rally: de volgende staat klaar met dezelfde server.
    await waitFor(async () => {
      expect((await store.sets.require(fixture.set.id)).pointsUs).toBe(1);
    });
  });

  it('legt bij onze service met een tik op hun helft vast waar hij naartoe ging', async () => {
    const user = userEvent.setup();
    const store = await openTestStore();
    const fixture = await seedMatch(store);
    const [sanne, noor, fem] = fixture.players;

    await store.lineups.set({
      setId: fixture.set.id,
      positions: { 1: fem!.id, 2: noor!.id, 3: sanne!.id, 4: null, 5: null, 6: null },
    });

    render(
      <StoreProvider store={store}>
        <ScoringScreen
          matchId={fixture.match.id}
          session={idleSession}
          role="scorer"
          onExit={() => {}}
          onOpenDashboard={() => {}}
        />
      </StoreProvider>,
    );

    // Wij serveren: hun helft ligt leeg, dus een tik daar is het doel en niet
    // een actie van hen.
    await user.click(await screen.findByRole('button', { name: 'Serveren op Zone 5 (linksachter)' }));
    await user.click(screen.getByRole('button', { name: 'Perfect' }));

    await waitFor(async () => {
      const actions = await store.actions.listBySet(fixture.set.id);
      expect(actions[0]).toMatchObject({ team: 'us', type: 'serve', zoneTo: 5 });
    });
  });

  it('legt een actie van de tegenstander vast door op hun zone te tikken', async () => {
    const user = userEvent.setup();
    const store = await openTestStore();
    const fixture = await seedMatch(store);
    const [sanne, noor, fem] = fixture.players;

    await store.lineups.set({
      setId: fixture.set.id,
      positions: { 1: fem!.id, 2: noor!.id, 3: sanne!.id, 4: null, 5: null, 6: null },
    });
    // Zij winnen een punt, dus zij serveren: nu betekent een tik op hun helft
    // wél een actie van hen.
    await store.rallies.addMissedPoint({ setId: fixture.set.id, wonBy: 'them' });

    render(
      <StoreProvider store={store}>
        <ScoringScreen
          matchId={fixture.match.id}
          session={idleSession}
          role="scorer"
          onExit={() => {}}
          onOpenDashboard={() => {}}
        />
      </StoreProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Tegenstander Zone 4 (linksvoor)' }));
    await user.click(screen.getByRole('button', { name: 'Perfect' }));

    await waitFor(async () => {
      const actions = await store.actions.listBySet(fixture.set.id);
      expect(actions[0]).toMatchObject({ team: 'them', zoneFrom: 4, playerId: null });
    });
  });
});

describe('ScoringScreen: setverloop', () => {
  /** Speelt punten tot de gevraagde stand, met gemiste punten (snel en zonder acties). */
  async function playTo(
    store: ScoutingStore,
    setId: string,
    pointsUs: number,
    pointsThem: number,
  ): Promise<void> {
    for (let i = 0; i < pointsUs; i++) {
      await store.rallies.addMissedPoint({ setId, wonBy: 'us' });
    }
    for (let i = 0; i < pointsThem; i++) {
      await store.rallies.addMissedPoint({ setId, wonBy: 'them' });
    }
  }

  it('vraagt bij 25 om bevestiging in plaats van zelf te sluiten', async () => {
    const user = userEvent.setup();
    const store = await openTestStore();
    const fixture = await seedMatch(store);
    await playTo(store, fixture.set.id, 25, 19);

    render(
      <StoreProvider store={store}>
        <ScoringScreen
          matchId={fixture.match.id}
          session={idleSession}
          role="scorer"
          onExit={() => {}}
          onOpenDashboard={() => {}}
        />
      </StoreProvider>,
    );

    expect(await screen.findByText('Set 1 klaar? 25–19')).toBeDefined();
    // De set staat nog open tot de invoerder het bevestigt.
    expect((await store.sets.require(fixture.set.id)).status).toBe('live');

    await user.click(screen.getByRole('button', { name: 'Set sluiten' }));

    await waitFor(async () => {
      expect((await store.sets.require(fixture.set.id)).status).toBe('finished');
    });
    // En er staat meteen een volgende set klaar, met de service aan de andere
    // kant. Die wordt aangemaakt nadat de set is afgesloten, dus erop wachten:
    // anders is het toeval of de test hem al ziet.
    await waitFor(async () => {
      const sets = await store.sets.listByMatch(fixture.match.id);
      expect(sets).toHaveLength(2);
      expect(sets[1]?.startingServe).toBe('them');
    });
  });

  it('sluit niet bij 25-24, want er moeten twee punten verschil zijn', async () => {
    const store = await openTestStore();
    const fixture = await seedMatch(store);
    await playTo(store, fixture.set.id, 25, 24);

    render(
      <StoreProvider store={store}>
        <ScoringScreen
          matchId={fixture.match.id}
          session={idleSession}
          role="scorer"
          onExit={() => {}}
          onOpenDashboard={() => {}}
        />
      </StoreProvider>,
    );

    expect(await screen.findByText('Wie speelde de bal?')).toBeDefined();
    expect(screen.queryByText(/klaar\?/)).toBeNull();
  });

  it('laat de set met "nog niet" openstaan om de stand te corrigeren', async () => {
    const user = userEvent.setup();
    const store = await openTestStore();
    const fixture = await seedMatch(store);
    await playTo(store, fixture.set.id, 25, 10);

    render(
      <StoreProvider store={store}>
        <ScoringScreen
          matchId={fixture.match.id}
          session={idleSession}
          role="scorer"
          onExit={() => {}}
          onOpenDashboard={() => {}}
        />
      </StoreProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Nog niet' }));

    expect(await screen.findByText('Wie speelde de bal?')).toBeDefined();
    expect((await store.sets.require(fixture.set.id)).status).toBe('live');
  });
});

describe('ScoringScreen: opstelling vóór het eerste punt', () => {
  it('vraagt om de opstelling zolang de set nog leeg is, en laat hem overslaan', async () => {
    const user = userEvent.setup();
    const store = await openTestStore();
    const fixture = await seedMatch(store);

    render(
      <StoreProvider store={store}>
        <ScoringScreen
          matchId={fixture.match.id}
          session={idleSession}
          role="scorer"
          onExit={() => {}}
          onOpenDashboard={() => {}}
        />
      </StoreProvider>,
    );

    expect(await screen.findByText('Zet eerst de opstelling neer')).toBeDefined();
    expect(screen.queryByText('Wie speelde de bal?')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Weet ik nog niet/ }));
    expect(await screen.findByText('Wie speelde de bal?')).toBeDefined();
  });

  it('vraagt er niet meer om zodra de opstelling er staat', async () => {
    const store = await openTestStore();
    const fixture = await seedMatch(store);
    const [sanne, noor, fem] = fixture.players;
    await store.lineups.set({
      setId: fixture.set.id,
      positions: { 1: fem!.id, 2: noor!.id, 3: sanne!.id, 4: null, 5: null, 6: null },
    });

    render(
      <StoreProvider store={store}>
        <ScoringScreen
          matchId={fixture.match.id}
          session={idleSession}
          role="scorer"
          onExit={() => {}}
          onOpenDashboard={() => {}}
        />
      </StoreProvider>,
    );

    await screen.findByText(/Nog geen acties in deze rally/);
    expect(screen.queryByText('Zet eerst de opstelling neer')).toBeNull();
  });
});
