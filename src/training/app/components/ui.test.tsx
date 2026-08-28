// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DraftInput } from './ui';

afterEach(cleanup);

describe('een veld waar je in typt', () => {
  it('bewaart wat je net tikte, ook als je meteen ergens anders klikt', () => {
    const bewaard = vi.fn();
    render(<DraftInput aria-label="Naam" value="" onCommit={bewaard} />);
    const veld = screen.getByLabelText('Naam');

    // Tikken en in dezelfde tel het veld verlaten: dat is wat er gebeurt als
    // iemand een veld invult en meteen op een knop drukt.
    fireEvent.change(veld, { target: { value: 'Marit' } });
    fireEvent.blur(veld);

    expect(bewaard).toHaveBeenCalledWith('Marit');
  });

  it('bewaart één keer, ook als je erna nog een keer het veld verlaat', () => {
    const bewaard = vi.fn();
    render(<DraftInput aria-label="Naam" value="" onCommit={bewaard} />);
    const veld = screen.getByLabelText('Naam');

    fireEvent.change(veld, { target: { value: 'Marit' } });
    fireEvent.blur(veld);
    fireEvent.blur(veld);

    expect(bewaard).toHaveBeenCalledTimes(1);
  });

  it('bewaart vanzelf als je even stopt met typen', async () => {
    vi.useFakeTimers();
    try {
      const bewaard = vi.fn();
      render(<DraftInput aria-label="Naam" value="" onCommit={bewaard} delay={300} />);
      fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Sanne' } });
      expect(bewaard).not.toHaveBeenCalled();
      vi.advanceTimersByTime(350);
      expect(bewaard).toHaveBeenCalledWith('Sanne');
    } finally {
      vi.useRealTimers();
    }
  });

  it('laat wat van buiten komt staan zolang je zelf niet typt', () => {
    const { rerender } = render(<DraftInput aria-label="Naam" value="Oud" onCommit={() => {}} />);
    rerender(<DraftInput aria-label="Naam" value="Nieuw" onCommit={() => {}} />);
    expect((screen.getByLabelText('Naam') as HTMLInputElement).value).toBe('Nieuw');
  });

  it('laat zich niet overschrijven terwijl je aan het typen bent', () => {
    const { rerender } = render(<DraftInput aria-label="Naam" value="Oud" onCommit={() => {}} />);
    const veld = screen.getByLabelText('Naam');
    fireEvent.change(veld, { target: { value: 'Ik typ nog' } });
    rerender(<DraftInput aria-label="Naam" value="Van elders" onCommit={() => {}} />);
    expect((veld as HTMLInputElement).value).toBe('Ik typ nog');
  });
});
