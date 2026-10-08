import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lobby, started } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('recording phase', () => {
  it('starts round 1 with a different clip for each member', () => {
    const g = started();
    const s = g.publicState();
    expect(s.phase).toBe('record');
    expect(s.round).toBe(1);
    const ids = s.members.map(m => m.clip.id);
    expect(new Set(ids).size).toBe(2);
    expect(s.deadline - Date.now()).toBe(60000);
  });

  it('drops players who left the lobby before the start', () => {
    const g = lobby();
    g.join('x', 'Ghost', 'member');
    g.disconnect('x');
    g.start('h');
    expect(g.publicState().members.map(m => m.name)).toEqual(['Host', 'Mia']);
  });

  it('accepts exactly one recording per member', () => {
    const g = started();
    expect(g.submitRecording('h', { url: '/u/h.webm', duration: 2 })).toEqual({ ok: true });
    expect(g.submitRecording('h', { url: '/u/h2.webm', duration: 2 })).toEqual({ ok: false, error: 'Already submitted' });
    expect(g.submitRecording('a', { url: '/u/a.webm', duration: 2 })).toEqual({ ok: false, error: 'You have no clip this round' });
  });

  it('clamps the recording duration', () => {
    const g = started();
    g.submitRecording('h', { url: '/u/h.webm', duration: 99 });
    expect(g.player('h').recording.duration).toBe(15);
  });

  it('starts the show as soon as everyone submitted', () => {
    const g = started();
    g.submitRecording('h', { url: '/u/h.webm', duration: 2 });
    g.submitRecording('m', { url: '/u/m.webm', duration: 2 });
    const s = g.publicState();
    expect(s.phase).toBe('show');
    expect(s.show).toMatchObject({ performerId: 'h', step: 'original', count: 2 });
  });

  it('starts the show at the deadline with only the submitters', () => {
    const g = started();
    g.submitRecording('m', { url: '/u/m.webm', duration: 2 });
    vi.advanceTimersByTime(60000);
    expect(g.publicState().show).toMatchObject({ performerId: 'm', count: 1 });
  });

  it('goes straight to the leaderboard when nobody submitted', () => {
    const g = started();
    vi.advanceTimersByTime(60000);
    const s = g.publicState();
    expect(s.phase).toBe('leaderboard');
    expect(s.members.map(m => m.scores)).toEqual([[0], [0]]);
  });

  it('starts the show when the only missing member disconnects', () => {
    const g = started();
    g.submitRecording('h', { url: '/u/h.webm', duration: 2 });
    g.disconnect('m');
    expect(g.publicState().phase).toBe('show');
  });
});
