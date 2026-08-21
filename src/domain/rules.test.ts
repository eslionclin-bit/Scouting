import { describe, expect, it } from 'vitest';
import { criterionFor, PROTOCOL_CRITERIA, tooltipFor } from './protocol';
import { hasBlockingIssue, rallyOutcomeFor, validateAction } from './rules';
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
