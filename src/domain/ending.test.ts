import { describe, expect, it } from 'vitest';
import { endingOf } from './ending';

describe('waardoor de rally eindigde', () => {
  it('herkent een service die hem beslist', () => {
    const uit = endingOf({ contacts: [10], endWhistle: 11.3 });
    expect(uit.ending).toBe('service');
  });

  it('noemt hem ace of servicefout zodra de uitslag bekend is', () => {
    expect(endingOf({ contacts: [10], endWhistle: 11.3, servedBy: 'us', wonBy: 'us' }).named).toBe(
      'ace',
    );
    expect(endingOf({ contacts: [10], endWhistle: 11.3, servedBy: 'us', wonBy: 'them' }).named).toBe(
      'servicefout',
    );
  });

  it('herkent een ontvangst die hem beslist', () => {
    expect(endingOf({ contacts: [10, 10.9], endWhistle: 12 }).ending).toBe('pass');
  });

  it('herkent een technische fout aan de fluit op het contact', () => {
    // Drie aanrakingen, maar er wordt gefloten terwijl de bal nog hangt.
    const uit = endingOf({ contacts: [10, 10.9, 12.27], endWhistle: 12.5 });
    expect(uit.ending).toBe('techniek');
    expect(uit.because).toContain('nog in de lucht');
  });

  it('herkent een aanval aan de fluit ná de gevallen bal', () => {
    const uit = endingOf({ contacts: [10, 10.9, 12.27, 13.29], endWhistle: 14.3 });
    expect(uit.ending).toBe('aanval');
    expect(uit.because).toContain('1,0 seconde');
  });

  it('zwijgt als er geen aanrakingen gehoord zijn', () => {
    expect(endingOf({ contacts: [], endWhistle: 14 }).ending).toBe('onduidelijk');
  });

  it('zwijgt bij aanrakingen zonder eindfluit', () => {
    expect(endingOf({ contacts: [10, 10.9, 12.3, 13.3], endWhistle: null }).ending).toBe(
      'onduidelijk',
    );
  });

  it('houdt een korte fluit bij één aanraking geen technische fout', () => {
    // Een servicefout wordt ook snel afgefloten; met één aanraking kan er geen
    // techniekfout gemaakt zijn.
    expect(endingOf({ contacts: [10], endWhistle: 10.3 }).ending).toBe('service');
  });
});
