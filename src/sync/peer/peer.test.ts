import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ScoutingStore } from '../../db/store';
import { openTestStore, seedMatch, type TestMatchFixture } from '../../test/factory';
import { SyncEngine } from '../engine';
import { createMemoryChannelPair } from './channel';
import { PeerClient } from './client';
import { PeerHost } from './host';

/**
 * De invoerder op de tribune (host) en de coach op de bank (meelezer). De coach
 * voert niets in; hij ziet wat de ander vastlegt, en haalt bij het koppelen op
 * wat er vóór die tijd gebeurd is.
 */
describe('live meelezen', () => {
  let scorer: ScoutingStore;
  let viewer: ScoutingStore;
  let host: PeerHost;
  let client: PeerClient | null = null;
  let fixture: TestMatchFixture;

  beforeEach(async () => {
    scorer = await openTestStore('device-scorer');
    viewer = await openTestStore('device-viewer');
    fixture = await seedMatch(scorer);
    host = new PeerHost(scorer, { matchId: fixture.match.id });
  });

  afterEach(() => {
    client?.close();
    client = null;
    host.stop();
    scorer.close();
    viewer.close();
  });

  function connect(): { engine: SyncEngine; detach: () => void } {
    const [hostChannel, viewerChannel] = createMemoryChannelPair();
    const detach = host.attach(hostChannel);
    client = new PeerClient(viewer, viewerChannel, { matchId: fixture.match.id });
    return { engine: new SyncEngine(viewer, client, { retryBaseMs: 0 }), detach };
  }

  async function addAction(quality: 'good' | 'perfect' = 'good'): Promise<string> {
    const rally = await scorer.rallies.start({ setId: fixture.set.id });
    const { action } = await scorer.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'serve',
      quality,
      playerId: fixture.players[0]!.id,
      zoneFrom: 1,
    });
    return action.id;
  }

  it('haalt bij het koppelen op wat er al is ingevoerd', async () => {
    await addAction();
    const { engine } = connect();

    await engine.syncNow({ force: true });

    expect(await viewer.matches.get(fixture.match.id)).toBeDefined();
    expect(await viewer.players.listByTeam(fixture.ownTeam.id)).toHaveLength(3);
    expect(await viewer.actions.listByMatch(fixture.match.id)).toHaveLength(1);
  });

  it('stuurt nieuwe acties meteen door, zonder dat de meelezer erom vraagt', async () => {
    const { engine } = connect();
    await engine.syncNow({ force: true });

    const actionId = await addAction('perfect');
    await waitFor(async () => (await viewer.actions.get(actionId)) !== undefined);

    const mirrored = await viewer.actions.get(actionId);
    expect(mirrored?.quality).toBe('perfect');
  });

  it('spiegelt ook een undo, want een tombstone is gewoon een wijziging', async () => {
    const { engine } = connect();
    const actionId = await addAction();
    await waitFor(async () => (await viewer.actions.get(actionId)) !== undefined);

    await scorer.actions.remove(actionId);
    await waitFor(async () => (await viewer.actions.get(actionId)) === undefined);

    await engine.syncNow({ force: true });
    expect(await viewer.actions.listByMatch(fixture.match.id)).toHaveLength(0);
  });

  it('haalt na een onderbreking alleen op wat er in de tussentijd bij kwam', async () => {
    const first = connect();
    await first.engine.syncNow({ force: true });
    const before = await viewer.actions.listByMatch(fixture.match.id);

    // Verbinding weg: de invoerder werkt gewoon door.
    first.detach();
    client?.close();
    const missed = await addAction();
    expect(await viewer.actions.get(missed)).toBeUndefined();

    // Opnieuw gekoppeld: de meelezer loopt de achterstand in.
    const second = connect();
    await second.engine.syncNow({ force: true });

    expect(await viewer.actions.get(missed)).toBeDefined();
    expect((await viewer.actions.listByMatch(fixture.match.id)).length).toBe(before.length + 1);
  });

  it('meldt aan het scherm hoeveel apparaten er meelezen', async () => {
    const states: number[] = [];
    host.subscribe((state) => states.push(state.peers));

    const { detach } = connect();
    expect(host.getState().peers).toBe(1);

    detach();
    expect(host.getState().peers).toBe(0);
    expect(states).toStrictEqual([0, 1, 0]);
  });

  it('laat de meelezer niets kapotmaken aan de invoerkant', async () => {
    const { engine } = connect();
    await engine.syncNow({ force: true });

    // De meelezer verandert lokaal iets; dat blijft van hem, want zijn engine
    // stuurt alleen door wat in zijn eigen outbox staat — en dat wordt aan de
    // invoerkant samengevoegd met last-writer-wins, niet blind overschreven.
    await viewer.matches.update(fixture.match.id, { notes: 'kijkt mee' });
    await engine.syncNow({ force: true });

    const onScorer = await scorer.matches.require(fixture.match.id);
    expect(onScorer.notes).toBe('kijkt mee');
  });
});

async function waitFor(condition: () => Promise<boolean>, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Voorwaarde werd niet gehaald binnen de tijd.');
}

/**
 * Twee invoerders tegelijk (projectbrief v5): de hoofdinvoerder bepaalt het
 * verloop van de rally, een assistent vult acties aan. Beide apparaten moeten
 * op dezelfde keten uitkomen, in dezelfde volgorde.
 */
describe('twee invoerders tegelijk', () => {
  let lead: ScoutingStore;
  let assistant: ScoutingStore;
  let host: PeerHost;
  let client: PeerClient;
  let engine: SyncEngine;
  let fixture: TestMatchFixture;

  beforeEach(async () => {
    lead = await openTestStore('device-lead');
    assistant = await openTestStore('device-assistant');
    fixture = await seedMatch(lead);
    host = new PeerHost(lead, { matchId: fixture.match.id });

    const [hostChannel, peerChannel] = createMemoryChannelPair();
    host.attach(hostChannel);
    client = new PeerClient(assistant, peerChannel, { matchId: fixture.match.id });
    engine = new SyncEngine(assistant, client, { retryBaseMs: 0 });
    await engine.syncNow({ force: true });
  });

  afterEach(() => {
    engine.stop();
    client.close();
    host.stop();
    lead.close();
    assistant.close();
  });

  it('laat de assistent acties aanvullen in de rally van de hoofdinvoerder', async () => {
    const rally = await lead.rallies.start({ setId: fixture.set.id });
    await lead.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'serve',
      quality: 'good',
      playerId: fixture.players[0]!.id,
      zoneFrom: 1,
    });
    await waitFor(async () => (await assistant.rallies.get(rally.id)) !== undefined);

    // De assistent schrijft in zijn eigen database en stuurt dat door.
    await assistant.actions.append({
      rallyId: rally.id,
      team: 'them',
      type: 'reception',
      quality: 'poor',
    });
    await engine.syncNow({ force: true });

    await waitFor(async () => (await lead.actions.listByRally(rally.id)).length === 2);
    const onLead = await lead.actions.listByRally(rally.id);
    expect(onLead.map((action) => action.type)).toStrictEqual(['serve', 'reception']);
  });

  it('houdt de volgorde gelijk als beide tegelijk hetzelfde volgnummer pakken', async () => {
    const rally = await lead.rallies.start({ setId: fixture.set.id });
    await waitFor(async () => (await assistant.rallies.get(rally.id)) !== undefined);

    // Geen van beide weet van de ander: allebei denken ze actie 1 toe te voegen.
    await Promise.all([
      lead.actions.append({
        rallyId: rally.id,
        team: 'us',
        type: 'serve',
        quality: 'good',
        playerId: fixture.players[0]!.id,
        zoneFrom: 1,
      }),
      assistant.actions.append({
        rallyId: rally.id,
        team: 'them',
        type: 'reception',
        quality: 'good',
      }),
    ]);
    await engine.syncNow({ force: true });
    await waitFor(async () => (await lead.actions.listByRally(rally.id)).length === 2);
    await waitFor(async () => (await assistant.actions.listByRally(rally.id)).length === 2);

    const onLead = (await lead.actions.listByRally(rally.id)).map((action) => action.id);
    const onAssistant = (await assistant.actions.listByRally(rally.id)).map((action) => action.id);
    expect(onLead).toStrictEqual(onAssistant);
  });

  it('stuurt een eigen wijziging vanzelf door zodra de engine draait', async () => {
    const rally = await lead.rallies.start({ setId: fixture.set.id });
    await waitFor(async () => (await assistant.rallies.get(rally.id)) !== undefined);

    engine.start();
    await assistant.actions.append({
      rallyId: rally.id,
      team: 'them',
      type: 'attack',
      quality: 'error',
      zoneFrom: 4,
    });

    // Zonder handmatige sync: de engine merkt de eigen wijziging op.
    await waitFor(async () => (await lead.actions.listByRally(rally.id)).length === 1, 3_000);
  });
});
