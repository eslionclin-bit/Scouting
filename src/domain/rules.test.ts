import { describe, expect, it } from 'vitest';
import { criterionFor, PROTOCOL_CRITERIA, tooltipFor } from './protocol';
import { hasBlockingIssue, rallyOutcomeFor, validateAction, type ActionDraft } from './rules';
import { ACTION_TYPES, QUALITIES } from './types';

describe('validateAction', () => {
  const base = { team: 'us' as const, playerId: 'p1', quality: 'good' as const };

  it('eist een vertrekzone bij opslag en aanval', () => {
    const issues = validateAction({ ...base, type: 'attack' });
    expect(issues.some((issue) => issue.code === 'zone_from_required')).toBe(true);
    expect(hasBlockingIssue(issues)).toBe(true);

    expect(validateAction({ ...base, type: 'attack', zoneFrom: 4 })).toStrictEqual([]);
  });

  it('laat een receptie zonder zone toe', () => {
    expect(validateAction({ ...base, type: 'reception' })).toStrictEqual([]);
  });

  it('weigert een zone buiten 1 t/m 6', () => {
    const issues = validateAction({ ...base, type: 'serve', zoneFrom: 9 });
    expect(issues.some((issue) => issue.code === 'invalid_zone')).toBe(true);
  });

  it('eist een speler voor het eigen team, maar niet voor de tegenstander', () => {
    expect(
      validateAction({ team: 'us', type: 'reception', quality: 'good' }).some(
        (issue) => issue.code === 'player_required',
      ),
    ).toBe(true);
    expect(validateAction({ team: 'them', type: 'reception', quality: 'good' })).toStrictEqual([]);
  });

  it('registreert geen receptie na een ace (toewijzingsregel)', () => {
    const issues = validateAction(
      { ...base, type: 'reception' },
      { previousActions: [{ team: 'them', type: 'serve', quality: 'perfect' }] },
    );
    // De ace beëindigt de rally, dus de receptie kan er niet meer bij...
    expect(hasBlockingIssue(issues)).toBe(true);
    // ...en de invoerder krijgt te lezen waarom, plus wat hij anders moet doen.
    expect(issues.some((issue) => issue.code === 'reception_after_ace')).toBe(true);
  });

  it('blokkeert invoer in een rally die al beëindigd is', () => {
    const issues = validateAction(
      { ...base, type: 'dig' },
      { previousActions: [{ team: 'us', type: 'attack', quality: 'error' }] },
    );
    expect(issues.some((issue) => issue.code === 'rally_already_ended')).toBe(true);
    expect(hasBlockingIssue(issues)).toBe(true);
  });
});

describe('rallyOutcomeFor', () => {
  it('geeft het punt aan de tegenpartij bij een fout', () => {
    expect(rallyOutcomeFor({ team: 'us', type: 'reception', quality: 'error' })).toBe('them');
    expect(rallyOutcomeFor({ team: 'them', type: 'attack', quality: 'error' })).toBe('us');
  });

  it('geeft een punt bij een perfecte opslag, aanval of block', () => {
    expect(rallyOutcomeFor({ team: 'us', type: 'serve', quality: 'perfect' })).toBe('us');
    expect(rallyOutcomeFor({ team: 'us', type: 'attack', quality: 'perfect' })).toBe('us');
    expect(rallyOutcomeFor({ team: 'us', type: 'block', quality: 'perfect' })).toBe('us');
  });

  it('laat de rally doorlopen bij een perfecte receptie of toets', () => {
    expect(rallyOutcomeFor({ team: 'us', type: 'reception', quality: 'perfect' })).toBeNull();
    expect(rallyOutcomeFor({ team: 'us', type: 'set', quality: 'perfect' })).toBeNull();
    expect(rallyOutcomeFor({ team: 'us', type: 'attack', quality: 'poor' })).toBeNull();
  });
});

describe('scoutingprotocol', () => {
  it('heeft voor elk actietype alle vier de kwalificaties met criterium en voorbeeld', () => {
    for (const type of ACTION_TYPES) {
      for (const quality of QUALITIES) {
        const criterion = criterionFor(type, quality);
        expect(criterion.criterion.length).toBeGreaterThan(0);
        expect(criterion.example.length).toBeGreaterThan(0);
      }
    }
    expect(Object.keys(PROTOCOL_CRITERIA)).toHaveLength(ACTION_TYPES.length);
  });

  it('levert een complete tooltip voor een kwalificatieknop', () => {
    const tooltip = tooltipFor('serve', 'perfect');
    expect(tooltip.title).toBe('Service — Perfect');
    expect(tooltip.criterion).toContain('Ace');
  });
});

describe('controles met de opstelling erbij', () => {
  const lineup = {
    positions: { 1: 'server', 2: 'diagonaal', 3: 'midden', 4: 'passer', 5: 'libero', 6: 'midden2' },
    roleOf: (playerId: string) => (playerId === 'libero' ? ('libero' as const) : null),
  };

  const draft = (patch: Partial<ActionDraft> = {}): ActionDraft => ({
    team: 'us',
    type: 'attack',
    quality: 'perfect',
    playerId: 'passer',
    zoneFrom: 4,
    ...patch,
  });

  it('merkt op dat een speler niet in het veld staat', () => {
    const issues = validateAction(draft({ playerId: 'bank' }), { court: lineup });
    const issue = issues.find((entry) => entry.code === 'player_not_on_court');

    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toContain('niet in het veld');
  });

  it('laat een speler die er wel staat met rust', () => {
    expect(validateAction(draft(), { court: lineup })).toStrictEqual([]);
  });

  it('waarschuwt als de libero serveert of aanvalt', () => {
    const serve = validateAction(draft({ playerId: 'libero', type: 'serve', zoneFrom: 1 }), {
      court: lineup,
    });
    expect(serve.find((entry) => entry.code === 'libero_illegal_action')?.message).toContain(
      'serveert niet',
    );

    const attack = validateAction(draft({ playerId: 'libero' }), { court: lineup });
    expect(attack.some((entry) => entry.code === 'libero_illegal_action')).toBe(true);
  });

  it('waarschuwt bij een blok door een achterspeler', () => {
    const back = validateAction(draft({ playerId: 'server', type: 'block', zoneFrom: null }), {
      court: lineup,
    });
    expect(back.find((entry) => entry.code === 'back_row_block')?.message).toContain('zone 1');

    const front = validateAction(draft({ playerId: 'midden', type: 'block', zoneFrom: null }), {
      court: lineup,
    });
    expect(front.some((entry) => entry.code === 'back_row_block')).toBe(false);
  });

  it('zwijgt zolang er geen opstelling is ingevuld', () => {
    expect(validateAction(draft({ playerId: 'bank' }), { court: null })).toStrictEqual([]);
    expect(validateAction(draft({ playerId: 'bank' }), {})).toStrictEqual([]);
  });
});
