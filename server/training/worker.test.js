import { beforeEach, describe, expect, it } from 'vitest';
import worker from './worker.js';
import { fakeD1, get, post } from './test/fakeD1.js';

/**
 * De inlog van de deelserver, gedraaid tegen een nep-database.
 *
 * Dit is het deel waar een fout niet 'vervelend' maar 'iedereen kan naar
 * binnen' betekent, dus staat hier meer dan alleen het gelukkige pad: wat er
 * gebeurt bij een verkeerd wachtwoord, bij tien keer achter elkaar mis, bij een
 * trainer die probeert gebruikers te beheren, en bij een sessie van iemand die
 * net verwijderd is.
 */

let env;

beforeEach(() => {
  env = { DB: fakeD1() };
});

async function call(request, environment = env) {
  const response = await worker.fetch(request, environment);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

const OWNER = { name: 'Marit', email: 'Marit@Voorbeeld.nl', password: 'eerstewachtwoord' };

async function setupOwner() {
  const result = await call(post('/auth/setup', OWNER));
  expect(result.status).toBe(200);
  return result.body;
}

describe('de eerste keer', () => {
  it('meldt dat er nog geen account is', async () => {
    const result = await call(get('/auth/status'));
    expect(result.body).toEqual({ setupNeeded: true, users: 0 });
  });

  it('maakt één eigenaar aan en logt die meteen in', async () => {
    const session = await setupOwner();
    expect(session.user.role).toBe('owner');
    expect(env.DB.tables.users[0].last_login_at).toBeTruthy();
    expect(session.user.email).toBe('marit@voorbeeld.nl');
    expect(session.token).toBeTruthy();
    expect((await call(get('/auth/status'))).body.setupNeeded).toBe(false);
  });

  it('doet daarna dicht', async () => {
    await setupOwner();
    const tweede = await call(post('/auth/setup', { name: 'Vreemde', email: 'x@y.nl', password: 'zomaareentje' }));
    expect(tweede.status).toBe(403);
    expect(env.DB.tables.users).toHaveLength(1);
  });

  it('vraagt om de code als die is ingesteld', async () => {
    const beveiligd = { DB: fakeD1(), SETUP_TOKEN: 'geheim-en-lang' };
    const zonder = await call(post('/auth/setup', OWNER), beveiligd);
    expect(zonder.status).toBe(403);
    const met = await call(post('/auth/setup', { ...OWNER, setupToken: 'geheim-en-lang' }), beveiligd);
    expect(met.status).toBe(200);
  });

  it('weigert een te kort wachtwoord en een adres dat geen adres is', async () => {
    expect((await call(post('/auth/setup', { ...OWNER, password: 'kort' }))).status).toBe(400);
    expect((await call(post('/auth/setup', { ...OWNER, email: 'geen adres' }))).status).toBe(400);
    expect(env.DB.tables.users).toHaveLength(0);
  });

  it('bewaart het wachtwoord niet, ook niet versleuteld', async () => {
    await setupOwner();
    const bewaard = env.DB.tables.users[0].password;
    expect(bewaard).not.toContain(OWNER.password);
    expect(bewaard.startsWith('pbkdf2$')).toBe(true);
  });
});

describe('inloggen', () => {
  it('laat de eigenaar binnen, met hoofdletters in het adres', async () => {
    await setupOwner();
    const result = await call(post('/auth/login', { email: 'MARIT@voorbeeld.nl ', password: OWNER.password }));
    expect(result.status).toBe(200);
    expect(result.body.user.name).toBe('Marit');
  });

  it('zegt bij een onbekend adres hetzelfde als bij een fout wachtwoord', async () => {
    await setupOwner();
    const onbekend = await call(post('/auth/login', { email: 'niemand@voorbeeld.nl', password: 'zomaareentje' }));
    const fout = await call(post('/auth/login', { email: OWNER.email, password: 'ietsandersdan' }));
    expect(onbekend.status).toBe(401);
    expect(fout.status).toBe(401);
    expect(onbekend.body.error).toBe(fout.body.error);
  });

  it('zet het slot erop na tien pogingen en laat het juiste wachtwoord dan ook niet door', async () => {
    await setupOwner();
    for (let poging = 0; poging < 10; poging++) {
      await call(post('/auth/login', { email: OWNER.email, password: 'steedsfoutzeg' }));
    }
    const result = await call(post('/auth/login', { email: OWNER.email, password: OWNER.password }));
    expect(result.status).toBe(429);
    expect(result.body.lockedUntil).toBeTruthy();
  });

  it('zet de teller terug zodra het wél lukt', async () => {
    await setupOwner();
    await call(post('/auth/login', { email: OWNER.email, password: 'fouteboel' }));
    await call(post('/auth/login', { email: OWNER.email, password: OWNER.password }));
    expect(env.DB.tables.users[0].failed_attempts).toBe(0);
  });

  it('geeft met het token terug wie je bent, en zonder token niets', async () => {
    const session = await setupOwner();
    expect((await call(post('/auth/me', {}, session.token))).body.user.email).toBe('marit@voorbeeld.nl');
    expect((await call(post('/auth/me', {}))).status).toBe(401);
    expect((await call(post('/auth/me', {}, 'verzonnen-token'))).status).toBe(401);
  });

  it('maakt het token bij uitloggen ongeldig', async () => {
    const session = await setupOwner();
    await call(post('/auth/logout', {}, session.token));
    expect((await call(post('/auth/me', {}, session.token))).status).toBe(401);
  });

  it('bewaart het token alleen gehasht', async () => {
    const session = await setupOwner();
    expect(env.DB.tables.sessions[0].token).not.toBe(session.token);
    expect(env.DB.tables.sessions[0].token).toHaveLength(64);
  });
});

describe('gebruikers beheren', () => {
  async function ownerAndTrainer() {
    const owner = await setupOwner();
    await call(
      post('/admin/users/add', { name: 'Joost', email: 'joost@voorbeeld.nl', password: 'tweedewachtwoord' }, owner.token),
    );
    const trainer = await call(post('/auth/login', { email: 'joost@voorbeeld.nl', password: 'tweedewachtwoord' }));
    return { owner, trainer: trainer.body };
  }

  it('laat de eigenaar iemand toevoegen die daarna kan inloggen', async () => {
    const { trainer } = await ownerAndTrainer();
    expect(trainer.user.role).toBe('trainer');
    expect(trainer.token).toBeTruthy();
  });

  it('houdt een trainer buiten het beheer', async () => {
    const { trainer } = await ownerAndTrainer();
    expect((await call(post('/admin/users', {}, trainer.token))).status).toBe(403);
    expect(
      (await call(post('/admin/users/add', { name: 'X', email: 'x@y.nl', password: 'zomaareentje' }, trainer.token)))
        .status,
    ).toBe(403);
  });

  it('vraagt om een inlog voordat het beheer iets zegt', async () => {
    await setupOwner();
    expect((await call(post('/admin/users', {}))).status).toBe(401);
  });

  it('weigert een tweede account op hetzelfde adres', async () => {
    const { owner } = await ownerAndTrainer();
    const nogmaals = await call(
      post('/admin/users/add', { name: 'Joost 2', email: 'JOOST@voorbeeld.nl', password: 'derdewachtwoord' }, owner.token),
    );
    expect(nogmaals.status).toBe(400);
    expect(env.DB.tables.users).toHaveLength(2);
  });

  it('geeft de lijst met accounts terug zonder wachtwoorden', async () => {
    const { owner } = await ownerAndTrainer();
    const result = await call(post('/admin/users', {}, owner.token));
    expect(result.body.users).toHaveLength(2);
    expect(JSON.stringify(result.body)).not.toContain('pbkdf2');
  });

  it('zet iemand die verwijderd wordt meteen buiten de deur', async () => {
    const { owner, trainer } = await ownerAndTrainer();
    expect((await call(post('/auth/me', {}, trainer.token))).status).toBe(200);

    const weg = await call(post('/admin/users/remove', { id: trainer.user.id }, owner.token));
    expect(weg.status).toBe(200);
    expect((await call(post('/auth/me', {}, trainer.token))).status).toBe(401);
    expect(env.DB.tables.users).toHaveLength(1);
  });

  it('laat de eigenaar zichzelf en de laatste eigenaar niet weghalen', async () => {
    const { owner } = await ownerAndTrainer();
    const zelf = await call(post('/admin/users/remove', { id: owner.user.id }, owner.token));
    expect(zelf.status).toBe(400);
    expect(env.DB.tables.users).toHaveLength(2);
  });

  it('zet een wachtwoord opnieuw en gooit de oude sessies eruit', async () => {
    const { owner, trainer } = await ownerAndTrainer();
    await call(post('/admin/users/password', { id: trainer.user.id, password: 'nieuwwachtwoord' }, owner.token));

    expect((await call(post('/auth/me', {}, trainer.token))).status).toBe(401);
    const opnieuw = await call(post('/auth/login', { email: 'joost@voorbeeld.nl', password: 'nieuwwachtwoord' }));
    expect(opnieuw.status).toBe(200);
  });

  it('maakt van een trainer een eigenaar, maar houdt er altijd één over', async () => {
    const { owner, trainer } = await ownerAndTrainer();
    expect((await call(post('/admin/users/role', { id: trainer.user.id, role: 'owner' }, owner.token))).status).toBe(200);
    expect((await call(post('/admin/users/role', { id: owner.user.id, role: 'trainer' }, owner.token))).status).toBe(200);
    // Nu is Joost de enige eigenaar; hem degraderen mag niet meer.
    const laatste = await call(
      post('/admin/users/role', { id: trainer.user.id, role: 'trainer' }, (await call(
        post('/auth/login', { email: 'joost@voorbeeld.nl', password: 'tweedewachtwoord' }),
      )).body.token),
    );
    expect(laatste.status).toBe(400);
  });
});

describe('je eigen wachtwoord', () => {
  it('verandert alleen met het oude erbij, en zet andere sessies eruit', async () => {
    const eerste = await setupOwner();
    const tweede = (await call(post('/auth/login', { email: OWNER.email, password: OWNER.password }))).body;

    const mis = await call(
      post('/auth/password', { currentPassword: 'ietsverzonnen', newPassword: 'nieuwwachtwoord' }, eerste.token),
    );
    expect(mis.status).toBe(400);

    const goed = await call(
      post('/auth/password', { currentPassword: OWNER.password, newPassword: 'nieuwwachtwoord' }, eerste.token),
    );
    expect(goed.status).toBe(200);

    // De sessie waarmee je het deed blijft werken, de andere niet.
    expect((await call(post('/auth/me', {}, eerste.token))).status).toBe(200);
    expect((await call(post('/auth/me', {}, tweede.token))).status).toBe(401);
  });

  it('weigert een nieuw wachtwoord dat te kort is', async () => {
    const session = await setupOwner();
    const result = await call(
      post('/auth/password', { currentPassword: OWNER.password, newPassword: 'kort' }, session.token),
    );
    expect(result.status).toBe(400);
  });
});

describe('delen zit achter de inlog', () => {
  const change = {
    entity: 'exercises',
    record: { id: 'oef-1', rev: '000000000000001-00000-a', title: 'Pepperen' },
  };

  it('neemt zonder sessie niets aan en geeft niets terug', async () => {
    await setupOwner();
    expect((await call(post('/share/push', { scope: 'public', changes: [change] }))).status).toBe(401);
    expect((await call(post('/share/pull', { scope: 'public', cursor: '0' }))).status).toBe(401);
    expect(env.DB.tables.shared).toHaveLength(0);
  });

  it('werkt gewoon met een sessie', async () => {
    const session = await setupOwner();
    const geduwd = await call(post('/share/push', { scope: 'public', changes: [change] }, session.token));
    expect(geduwd.status).toBe(200);
    expect(geduwd.body.acceptedRevs).toEqual([change.record.rev]);

    const opgehaald = await call(post('/share/pull', { scope: 'public', cursor: '0' }, session.token));
    expect(opgehaald.body.changes).toHaveLength(1);
    expect(opgehaald.body.changes[0].record.title).toBe('Pepperen');
  });

  it('houdt een verwijderde trainer ook buiten het delen', async () => {
    const owner = await setupOwner();
    await call(post('/admin/users/add', { name: 'Joost', email: 'joost@voorbeeld.nl', password: 'tweedewachtwoord' }, owner.token));
    const trainer = (await call(post('/auth/login', { email: 'joost@voorbeeld.nl', password: 'tweedewachtwoord' }))).body;
    await call(post('/admin/users/remove', { id: trainer.user.id }, owner.token));

    expect((await call(post('/share/pull', { scope: 'public', cursor: '0' }, trainer.token))).status).toBe(401);
  });
});
