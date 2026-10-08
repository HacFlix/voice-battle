import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lobby, started, submitAll, runUntil } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const step = g => g.publicState().show?.step ?? null;
const live = (g, id) => g.publicState().members.find(m => m.id === id).recordingNow;

describe('live recording status', () => {
  it('shows who is recording right now', () => {
    const g = started();
    expect(g.setRecording('h', true)).toEqual({ ok: true });
    expect(live(g, 'h')).toBe(true);
    expect(g.setRecording('h', false)).toEqual({ ok: true });
    expect(live(g, 'h')).toBe(false);
  });

  it('clears the flag on submit', () => {
    const g = started();
    g.setRecording('h', true);
    g.submitRecording('h', { url: '/u/h.webm', duration: 2 });
    expect(live(g, 'h')).toBe(false);
  });

  it('only applies to members during the recording phase', () => {
    const g = lobby();
    expect(g.setRecording('h', true).ok).toBe(false);
    g.start('h');
    expect(g.setRecording('a', true).ok).toBe(false);
  });
});

describe('reactions outside voting', () => {
  it('lets the audience cheer while players record, without scoring it', () => {
    const onEvent = vi.fn();
    const g = started({ onEvent });
    expect(g.react('a', '👏')).toEqual({ ok: true });
    expect(onEvent).toHaveBeenCalledWith('reaction', { emoji: '👏', from: 'Aud' });
    expect(g.publicState().members.every(m => m.reactions === 0)).toBe(true);
  });

  it('credits reactions to whoever is at the mic', () => {
    const g = started();
    submitAll(g);
    runUntil(g, x => step(x) === 'perform');
    g.react('a', '🔥');
    expect(g.player('h').reactions).toBe(1);
  });

  it('does not credit anyone while the original plays', () => {
    const g = started();
    submitAll(g);
    expect(step(g)).toBe('original');
    expect(g.react('a', '🔥').ok).toBe(true);
    expect(g.player('h').reactions).toBe(0);
  });

  it('keeps reactions closed in the lobby', () => {
    const g = lobby();
    expect(g.react('a', '👏')).toEqual({ ok: false, error: 'Reactions are closed' });
  });
});
