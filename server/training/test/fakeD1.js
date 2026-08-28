/**
 * Een D1 van niks, voor de tests.
 *
 * De worker praat met Cloudflare D1 in gewone SQL. Om hem te kunnen testen
 * zonder Cloudflare is er dit: een handjevol tabellen in het geheugen dat
 * precies de vragen begrijpt die de worker stelt, en verder niets. Bewust geen
 * echte SQL-uitvoering — dan zou het testgereedschap zelf het ingewikkeldste
 * onderdeel van de repository worden.
 *
 * Komt er een vraag binnen die hier niet staat, dan klapt hij eruit met de
 * vraag erbij. Dat is met opzet: een stilzwijgend lege uitkomst zou een test
 * groen houden terwijl de worker iets anders doet dan hij denkt.
 */

export function fakeD1() {
  const tables = { users: [], sessions: [], shared: [] };
  let nextSeq = 1;

  function normalize(sql) {
    return sql.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function execute(sql, args) {
    const q = normalize(sql);
    const a = args;

    if (q.startsWith('create ')) return { rows: [] };

    // ---- users ----
    if (q === 'select count(*) as n from users') return { rows: [{ n: tables.users.length }] };
    if (q === "select count(*) as n from users where role = 'owner'") {
      return { rows: [{ n: tables.users.filter((u) => u.role === 'owner').length }] };
    }
    if (q === 'select * from users where email = ?') {
      return { rows: tables.users.filter((u) => u.email === a[0]) };
    }
    if (q === 'select * from users where id = ?' || q === 'select id from users where id = ?') {
      return { rows: tables.users.filter((u) => u.id === a[0]) };
    }
    if (q === 'select id from users where email = ?') {
      return { rows: tables.users.filter((u) => u.email === a[0]).map((u) => ({ id: u.id })) };
    }
    if (q === 'select * from users order by created_at') {
      return { rows: [...tables.users].sort((x, y) => x.created_at.localeCompare(y.created_at)) };
    }
    if (q.startsWith('insert into users')) {
      const [id, email, name, role, password, createdAt] = a;
      if (tables.users.some((u) => u.email === email)) throw new Error('unique constraint: users_email');
      tables.users.push({
        id, email, name, role, password,
        created_at: createdAt, last_login_at: null, failed_attempts: 0, locked_until: null,
      });
      return { rows: [] };
    }
    if (q === 'update users set failed_attempts = ?, locked_until = ? where id = ?') {
      patchUser(a[2], { failed_attempts: a[0], locked_until: a[1] });
      return { rows: [] };
    }
    if (q === 'update users set failed_attempts = 0, locked_until = null, last_login_at = ? where id = ?') {
      patchUser(a[1], { failed_attempts: 0, locked_until: null, last_login_at: a[0] });
      return { rows: [] };
    }
    if (q === 'update users set password = ? where id = ?') {
      patchUser(a[1], { password: a[0] });
      return { rows: [] };
    }
    if (q === 'update users set password = ?, failed_attempts = 0, locked_until = null where id = ?') {
      patchUser(a[1], { password: a[0], failed_attempts: 0, locked_until: null });
      return { rows: [] };
    }
    if (q === 'update users set last_login_at = ? where id = ?') {
      patchUser(a[1], { last_login_at: a[0] });
      return { rows: [] };
    }
    if (q === 'update users set role = ? where id = ?') {
      patchUser(a[1], { role: a[0] });
      return { rows: [] };
    }
    if (q === 'delete from users where id = ?') {
      tables.users = tables.users.filter((u) => u.id !== a[0]);
      return { rows: [] };
    }

    // ---- sessions ----
    if (q.startsWith('insert into sessions')) {
      const [token, userId, createdAt, expiresAt] = a;
      tables.sessions.push({ token, user_id: userId, created_at: createdAt, expires_at: expiresAt });
      return { rows: [] };
    }
    if (q === 'select * from sessions where token = ?') {
      return { rows: tables.sessions.filter((s) => s.token === a[0]) };
    }
    if (q === 'delete from sessions where token = ?') {
      tables.sessions = tables.sessions.filter((s) => s.token !== a[0]);
      return { rows: [] };
    }
    if (q === 'delete from sessions where user_id = ?') {
      tables.sessions = tables.sessions.filter((s) => s.user_id !== a[0]);
      return { rows: [] };
    }
    if (q === 'delete from sessions where user_id = ? and token != ?') {
      tables.sessions = tables.sessions.filter((s) => s.user_id !== a[0] || s.token === a[1]);
      return { rows: [] };
    }

    // ---- shared ----
    if (q === 'delete from shared where scope = ? and entity = ? and record_id = ? and rev < ?') {
      tables.shared = tables.shared.filter(
        (r) => !(r.scope === a[0] && r.entity === a[1] && r.record_id === a[2] && r.rev < a[3]),
      );
      return { rows: [] };
    }
    if (q.startsWith('insert into shared')) {
      const [scope, entity, recordId, rev, payload, updatedAt] = a;
      const clash = tables.shared.some(
        (r) => r.scope === scope && r.entity === entity && r.record_id === recordId,
      );
      if (!clash) {
        tables.shared.push({
          seq: nextSeq++, scope, entity, record_id: recordId, rev, payload, updated_at: updatedAt,
        });
      }
      return { rows: [] };
    }
    if (q === 'select seq, entity, payload from shared where scope = ? and seq > ? order by seq limit ?') {
      return {
        rows: tables.shared
          .filter((r) => r.scope === a[0] && r.seq > Number(a[1]))
          .sort((x, y) => x.seq - y.seq)
          .slice(0, Number(a[2]))
          .map((r) => ({ seq: r.seq, entity: r.entity, payload: r.payload })),
      };
    }
    if (q === 'select count(*) as n from shared where scope = ?') {
      return { rows: [{ n: tables.shared.filter((r) => r.scope === a[0]).length }] };
    }
    if (q === 'select count(*) as n from shared') return { rows: [{ n: tables.shared.length }] };

    throw new Error(`De nep-database kent deze vraag niet: ${q}`);
  }

  function patchUser(id, patch) {
    const user = tables.users.find((u) => u.id === id);
    if (user) Object.assign(user, patch);
  }

  class Statement {
    constructor(sql, args = []) {
      this.sql = sql;
      this.args = args;
    }
    bind(...args) {
      return new Statement(this.sql, args);
    }
    async first() {
      return execute(this.sql, this.args).rows[0] ?? null;
    }
    async all() {
      return { results: execute(this.sql, this.args).rows };
    }
    async run() {
      execute(this.sql, this.args);
      return { success: true };
    }
  }

  return {
    tables,
    prepare: (sql) => new Statement(sql),
    batch: async (statements) => {
      for (const statement of statements) await statement.run();
      return statements.map(() => ({ success: true }));
    },
  };
}

/** Een verzoek zoals de worker het krijgt. */
export function post(path, body, token) {
  return new Request(`https://deelserver.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
}

export function get(path, token) {
  return new Request(`https://deelserver.test${path}`, {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}
