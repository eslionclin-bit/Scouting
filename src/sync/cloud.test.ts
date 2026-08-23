/**
 * Wat hier getest wordt is de vertaling heen en terug tussen de app en de
 * sync-server. De server zelf staat in `server/cloud/worker.js`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudTransport, SyncCodeError } from './cloud';
import {
  couplingLink,
  generateTeamCode,
  normalizeTeamCode,
  takeCouplingCode,
  MIN_CODE_LENGTH,
} from './cloudConfig';
import type { ChangeEnvelope } from './types';

const config = { url: 'https://sync.example.workers.dev/', teamCode: 'wad-riet-molen-tij-0042' };

function answer(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

afterEach(() => vi.unstubAllGlobals());

const action: ChangeEnvelope = {
  entity: 'actions',
  record: {
    id: 'a1',
    rev: '2026-08-22T20:00:00.000Z-0001-tablet',
    updatedBy: 'tablet',
    createdAt: '2026-08-22T20:00:00.000Z',
    updatedAt: '2026-08-22T20:00:00.000Z',
    deletedAt: null,
    matchId: 'm1',
  } as ChangeEnvelope['record'],
};

describe('de online koppeling', () => {
  it('stuurt wijzigingen met de wedstrijd erbij, zodat meelezen kan filteren', async () => {
    const fetchMock = vi.fn(async () => answer({ acceptedRevs: [action.record.rev] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new CloudTransport(config).push({ deviceId: 'tablet', changes: [action] });
    expect(result.acceptedRevs).toStrictEqual([action.record.rev]);

    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    // De schuine streep aan het eind van het adres mag geen dubbele opleveren.
    expect(url).toBe('https://sync.example.workers.dev/sync/push');
    const body = JSON.parse(String(init.body));
    expect(body.teamCode).toBe(config.teamCode);
    expect(body.changes[0].matchId).toBe('m1');
  });

  it('geeft de cursor terug als tekst, want zo bewaart de app hem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer({ changes: [action], cursor: 42, hasMore: true, total: 9 })),
    );

    const response = await new CloudTransport(config).pull({ deviceId: 'tablet', cursor: '17' });

    expect(response.changes).toHaveLength(1);
    expect(response.cursor).toBe('42');
    expect(response.hasMore).toBe(true);
    expect(response.total).toBe(9);
  });

  it('praat de invoerder bij over een code die niet deugt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer({ error: 'De ploegcode ontbreekt of is te kort.' }, false, 400)),
    );

    await expect(
      new CloudTransport(config).pull({ deviceId: 'tablet', cursor: null }),
    ).rejects.toThrow(SyncCodeError);
  });

  it('praat niet met de server als er niets te sturen is', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await new CloudTransport(config).push({ deviceId: 'tablet', changes: [] });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('een ploegcode', () => {
  it('is lang genoeg om niet te raden te zijn', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateTeamCode().length).toBeGreaterThanOrEqual(MIN_CODE_LENGTH);
    }
  });

  it('is elke keer een andere', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateTeamCode()));
    expect(codes.size).toBe(100);
  });

  it('is over te tikken en door de telefoon te zeggen', () => {
    // Woorden en cijfers met streepjes ertussen; geen hoofdletters of tekens
    // die op een tablet fout worden overgenomen.
    expect(generateTeamCode()).toMatch(/^[a-z]+(-[a-z]+){3}-\d{4}$/);
  });
});

describe('een code die met de hand is overgetikt', () => {
  it('leest hoofdletters en spaties als dezelfde ploeg', () => {
    // Dit is precies wat een telefoonklavier ervan maakt: een hoofdletter aan
    // het begin, en soms een spatie erachter na automatisch aanvullen. Zonder
    // afvlakken levert dat een andere, lege ploeg op — zonder foutmelding, want
    // de server kent geen accounts en kan het verschil niet zien.
    const code = 'wad-riet-molen-tij-0042';

    expect(normalizeTeamCode('Wad-Riet-Molen-Tij-0042')).toBe(code);
    expect(normalizeTeamCode('  wad-riet-molen-tij-0042 ')).toBe(code);
    expect(normalizeTeamCode('wad-riet-molen-tij-0042\n')).toBe(code);
    expect(normalizeTeamCode('WAD-RIET-MOLEN-TIJ-0042')).toBe(code);
  });

  it('laat een code die al goed is met rust', () => {
    const code = generateTeamCode();
    expect(normalizeTeamCode(code)).toBe(code);
  });
});

describe('koppelen via een link', () => {
  const location = {
    origin: 'https://eslionclin-bit.github.io',
    pathname: '/Scouting/',
    search: '',
    hash: '',
  };

  afterEach(() => vi.unstubAllGlobals());

  function at(hash: string): void {
    vi.stubGlobal('location', { ...location, hash });
    vi.stubGlobal('history', { replaceState: vi.fn() });
  }

  it('zet de code achter een hekje, zodat hij nooit naar een server gaat', () => {
    at('');
    const link = couplingLink('wilg-molen-waard-wilg-1343');

    expect(link).toBe(
      'https://eslionclin-bit.github.io/Scouting/#ploeg=wilg-molen-waard-wilg-1343',
    );
    // Alles ná het hekje blijft in de browser. Dat is het hele punt: de server
    // die de app uitlevert ziet de code niet.
    expect(link.split('#')[0]).not.toContain('wilg');
  });

  it('leest de code uit de link en haalt hem uit de adresbalk', () => {
    at('#ploeg=wilg-molen-waard-wilg-1343');

    expect(takeCouplingCode()).toBe('wilg-molen-waard-wilg-1343');
    // Opruimen is niet cosmetisch: anders staat de code in de geschiedenis van
    // de browser en op elke schermafbeelding van de app.
    expect(globalThis.history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      'https://eslionclin-bit.github.io/Scouting/',
    );
  });

  it('vlakt af wat een klavier ervan gemaakt heeft', () => {
    at('#ploeg=Wilg-Molen-Waard-Wilg-1343');
    expect(takeCouplingCode()).toBe('wilg-molen-waard-wilg-1343');
  });

  it('geeft niets terug bij een gewone start of een te korte code', () => {
    at('');
    expect(takeCouplingCode()).toBeNull();

    at('#ploeg=kort');
    expect(takeCouplingCode()).toBeNull();
  });
});
