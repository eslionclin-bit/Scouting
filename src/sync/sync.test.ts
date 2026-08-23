import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScoutingStore } from '../db/store';
import { openTestStore, seedMatch, type TestMatchFixture } from '../test/factory';
import { SyncEngine } from './engine';
import { LoopbackHub } from './loopback';
import { ackOutbox, compactOutbox, peekOutbox, pendingCount } from './outbox';

/**
 * Twee apparaten in dezelfde sporthal: de invoerder op de tribune (A) en de
 * coach op de bank (B). Ze praten via een hub die we naar believen offline
 * kunnen halen — precies het scenario uit §6 van de projectbrief.
 */
describe('sync tussen twee apparaten', () => {
  let hub: LoopbackHub;
  let scorer: ScoutingStore;
  let viewer: ScoutingStore;
  let scorerSync: SyncEngine;
  let viewerSync: SyncEngine;
  let fixture: TestMatchFixture;

  beforeEach(async () => {
    hub = new LoopbackHub();
    scorer = await openTestStore('device-scorer');
    viewer = await openTestStore('device-viewer');
    scorerSync = new SyncEngine(scorer, hub.transport('hub'), { retryBaseMs: 0 });
    viewerSync = new SyncEngine(viewer, hub.transport('hub'), { retryBaseMs: 0 });
    fixture = await seedMatch(scorer);
  });

  afterEach(() => {
    scorerSync.stop();
    viewerSync.stop();
    scorer.close();
    viewer.close();
  });

  async function roundTrip(): Promise<void> {
    await scorerSync.syncNow({ force: true });
    await viewerSync.syncNow({ force: true });
  }

  it('spiegelt wedstrijd, spelers en acties naar het meelees-apparaat', async () => {
    const rally = await scorer.rallies.start({ setId: fixture.set.id });
    await scorer.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'serve',
      quality: 'good',
      playerId: fixture.players[0]!.id,
      zoneFrom: 1,
    });

    await roundTrip();

    const mirrored = await viewer.matches.get(fixture.match.id);
    expect(mirrored?.date).toBe('2026-09-12');
    expect(await viewer.players.listByTeam(fixture.ownTeam.id)).toHaveLength(3);

    const chain = await viewer.actions.listByRally(rally.id);
    expect(chain).toHaveLength(1);
    expect(chain[0]!.type).toBe('serve');
  });

  it('leegt de outbox alleen voor bevestigde wijzigingen', async () => {
    expect(await pendingCount(scorer.db)).toBeGreaterThan(0);
    await scorerSync.syncNow({ force: true });
    expect(await pendingCount(scorer.db)).toBe(0);
  });

  it('stuurt binnengehaalde wijzigingen niet terug (geen echo)', async () => {
    await roundTrip();
    expect(await pendingCount(viewer.db)).toBe(0);

    const logSize = hub.size();
    await viewerSync.syncNow({ force: true });
    expect(hub.size()).toBe(logSize);
  });

  it('blijft invoeren zonder verbinding en haalt daarna alles in', async () => {
    await roundTrip();
    hub.online = false;

    const rally = await scorer.rallies.start({ setId: fixture.set.id });
    for (const quality of ['good', 'poor'] as const) {
      await scorer.actions.append({
        rallyId: rally.id,
        team: 'us',
        type: 'reception',
        quality,
        playerId: fixture.players[1]!.id,
      });
      await scorer.actions.undoLast(rally.id);
    }
    await scorer.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'attack',
      quality: 'perfect',
      playerId: fixture.players[2]!.id,
      zoneFrom: 4,
    });
    await scorer.rallies.complete(rally.id);

    // Sync mislukt, maar blokkeert niets: de invoer hierboven is gewoon gelukt.
    const state = await scorerSync.syncNow({ force: true });
    expect(state.status).toBe('offline');
    expect(await pendingCount(scorer.db)).toBeGreaterThan(0);
    expect(await viewer.actions.listByRally(rally.id)).toHaveLength(0);

    hub.online = true;
    await roundTrip();

    expect(await pendingCount(scorer.db)).toBe(0);
    const mirrored = await viewer.actions.listByRally(rally.id);
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]!.type).toBe('attack');
    expect((await viewer.sets.require(fixture.set.id)).pointsUs).toBe(1);
  });

  it('lost een gelijktijdige wijziging van hetzelfde record deterministisch op', async () => {
    await roundTrip();

    // Beide apparaten passen offline dezelfde wedstrijd aan.
    hub.online = false;
    await scorer.matches.update(fixture.match.id, { location: 'Sporthal Noord' });
    await viewer.matches.update(fixture.match.id, { location: 'Sporthal Zuid' });
    hub.online = true;

    // De laatste schrijver wint; beide apparaten komen op dezelfde waarde uit.
    await scorerSync.syncNow({ force: true });
    await viewerSync.syncNow({ force: true });
    await scorerSync.syncNow({ force: true });

    const onScorer = await scorer.matches.require(fixture.match.id);
    const onViewer = await viewer.matches.require(fixture.match.id);
    expect(onScorer.location).toBe(onViewer.location);
    expect(onScorer.rev).toBe(onViewer.rev);
  });

  it('laat een undo op het ene apparaat ook op het andere verdwijnen', async () => {
    const rally = await scorer.rallies.start({ setId: fixture.set.id });
    const { action } = await scorer.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'serve',
      quality: 'good',
      playerId: fixture.players[0]!.id,
      zoneFrom: 1,
    });
    await roundTrip();
    expect(await viewer.actions.listByRally(rally.id)).toHaveLength(1);

    await scorer.actions.remove(action.id);
    await roundTrip();

    expect(await viewer.actions.listByRally(rally.id)).toHaveLength(0);
    // De tombstone staat er wél, anders zou de actie bij een volgende sync
    // vanaf een derde apparaat weer opduiken.
    expect((await viewer.db.get('actions', action.id))?.deletedAt).not.toBeNull();
  });

  it('bouwt de wachttijd op na een mislukte poging', async () => {
    let now = 0;
    const failing = new SyncEngine(
      scorer,
      {
        name: 'kapot',
        isAvailable: () => true,
        push: async () => {
          throw new Error('netwerk weg');
        },
        pull: async () => ({ changes: [], cursor: null }),
      },
      { retryBaseMs: 1_000, maxBackoffMs: 4_000, now: () => now },
    );

    const first = await failing.syncNow({ force: true });
    expect(first.status).toBe('error');
    expect(first.failures).toBe(1);

    // Binnen de wachttijd proberen we niet opnieuw.
    now = 500;
    expect((await failing.syncNow()).failures).toBe(1);

    now = 1_500;
    expect((await failing.syncNow()).failures).toBe(2);
  });

  it('houdt alleen de nieuwste revisie per record over bij het opschonen', async () => {
    await scorer.matches.update(fixture.match.id, { notes: 'eerste' });
    await scorer.matches.update(fixture.match.id, { notes: 'tweede' });
    const before = await pendingCount(scorer.db);

    const removed = await compactOutbox(scorer.db);
    expect(removed).toBeGreaterThan(0);
    expect(await pendingCount(scorer.db)).toBe(before - removed);

    await roundTrip();
    expect((await viewer.matches.require(fixture.match.id)).notes).toBe('tweede');
  });
});

describe('stoppen', () => {
  /**
   * De fout die hierachter zit kwam uit de praktijk: een sync die al onderweg
   * was, sprak de database aan nadat die gesloten werd. In de browser is dat
   * een fout in de console bij het verlaten van een wedstrijd; in de tests
   * liet hij de hele build omvallen terwijl alle tests slaagden.
   */
  it('raakt de database niet meer aan nadat hij gestopt is', async () => {
    const store = await openTestStore('device-stop');
    const hub = new LoopbackHub();
    const engine = new SyncEngine(store, hub.transport("stop"));

    engine.start();
    engine.stop();
    store.close();

    // Geen fout, en de status blijft staan zoals hij was.
    await expect(engine.syncNow({ force: true })).resolves.toBeDefined();
  });

  it('valt niet om als de database sluit terwijl een ronde loopt', async () => {
    const store = await openTestStore('device-race');
    const hub = new LoopbackHub();
    const engine = new SyncEngine(store, hub.transport("race"));

    const running = engine.syncNow({ force: true });
    store.close();

    const state = await running;
    // Of hij nog net klaar was of niet doet er niet toe; hij mag alleen niet
    // met een onbehandelde fout eindigen.
    expect(['idle', 'error', 'offline', 'syncing']).toContain(state.status);
  });
});

describe('van ploeg wisselen', () => {
  it('zet alles opnieuw in de wachtrij, zodat het bij de nieuwe ploeg aankomt', async () => {
    const store = await openTestStore();
    try {
      await seedMatch(store);

      // Alles is verstuurd en bevestigd: de outbox is leeg. Dat is de normale
      // toestand van een apparaat dat al een tijdje gekoppeld is.
      const sent = await peekOutbox(store.db, { limit: 1000 });
      await ackOutbox(
        store.db,
        sent.map((entry) => entry.seq).filter((seq): seq is number => seq != null),
      );
      expect(await pendingCount(store.db)).toBe(0);

      // Nu blijkt de code verkeerd te zijn geweest. Zonder opnieuw in de
      // wachtrij zetten zouden deze wedstrijden nooit bij de goede ploeg
      // aankomen: de outbox is een wachtrij, geen kopie.
      await store.setTeamCode('wilg-molen-waard-wilg-1343');

      expect(await pendingCount(store.db)).toBeGreaterThan(0);
      const queued = await peekOutbox(store.db, { limit: 1000 });
      expect(queued.map((entry) => entry.entity)).toContain('matches');
      expect(queued.map((entry) => entry.entity)).toContain('players');
    } finally {
      store.close();
    }
  });

  it('doet niets als dezelfde code opnieuw wordt ingevuld', async () => {
    const store = await openTestStore();
    try {
      await seedMatch(store);
      await store.setTeamCode('wilg-molen-waard-wilg-1343');
      const after = await pendingCount(store.db);

      await store.setTeamCode('wilg-molen-waard-wilg-1343');

      expect(await pendingCount(store.db)).toBe(after);
    } finally {
      store.close();
    }
  });
});

describe('een apparaat dat net gekoppeld is', () => {
  it('verstuurt zijn hele geschiedenis in één ronde', async () => {
    const hub = new LoopbackHub();
    const store = await openTestStore('vers-apparaat');
    try {
      const fixture = await seedMatch(store);

      // Ruim meer dan één batch (100). Zo ziet een seizoen eruit dat in één
      // keer naar de ploeg moet.
      for (let i = 0; i < 150; i++) {
        await store.rallies.addMissedPoint({ setId: fixture.set.id, wonBy: 'us' });
      }
      expect(await pendingCount(store.db)).toBeGreaterThan(100);

      const engine = new SyncEngine(store, hub.transport('vers-apparaat'), {
        intervalMs: 60_000,
      });
      // Eén ronde, niet vier: anders kijk je minuten naar een getal dat niet
      // zakt, en dat lijkt op stuk terwijl het alleen traag is.
      await engine.syncNow({ force: true });

      expect(await pendingCount(store.db)).toBe(0);
      engine.stop();
    } finally {
      store.close();
    }
  });
});
