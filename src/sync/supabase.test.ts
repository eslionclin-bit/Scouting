/**
 * Het transport praat met twee functies op de server. Wat hier getest wordt is
 * de vertaling heen en terug — niet de server zelf, die staat in
 * `server/supabase/schema.sql` en wordt daar door Postgres afgedwongen.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupabaseTransport, SyncAuthError } from './supabase';
import type { ChangeEnvelope } from './types';

const config = { url: 'https://project.supabase.co/', anonKey: 'anon', teamCode: 'geheim' };

function answer(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
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

    const result = await new SupabaseTransport(config).push({
      deviceId: 'tablet',
      changes: [action],
    });

    expect(result.acceptedRevs).toStrictEqual([action.record.rev]);

    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    // De schuine streep aan het eind van de project-URL mag niet leiden tot een
    // dubbele in het pad.
    expect(url).toBe('https://project.supabase.co/rest/v1/rpc/sync_push');
    const body = JSON.parse(String(init.body));
    expect(body.team_code).toBe('geheim');
    expect(body.changes[0].matchId).toBe('m1');
    expect((init.headers as Record<string, string>).apikey).toBe('anon');
  });

  it('geeft de cursor terug als tekst, want zo bewaart de app hem', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer({ changes: [action], cursor: 42, hasMore: true })),
    );

    const response = await new SupabaseTransport(config).pull({
      deviceId: 'tablet',
      cursor: '17',
      matchId: 'm1',
    });

    expect(response.changes).toHaveLength(1);
    expect(response.cursor).toBe('42');
    expect(response.hasMore).toBe(true);
  });

  it('praat de invoerder bij over een verkeerde ploegcode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer({ message: 'onbekende ploegcode' }, false, 400)),
    );

    await expect(
      new SupabaseTransport(config).pull({ deviceId: 'tablet', cursor: null }),
    ).rejects.toThrow(SyncAuthError);
  });

  it('praat niet met de server als er niets te sturen is', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await new SupabaseTransport(config).push({ deviceId: 'tablet', changes: [] });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
