import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lobby, started, runUntil } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('recording phase', () => {
  it('starts round 1 with the same clip for every member', () => {
    const g = started();
    const s = g.publicState();
    expect(s.phase).toBe('record');
    expect(s.round).toBe(1);
    expect(s.roundClip).toBeTruthy();
    expect(s.members.map(m => m.clip.id)).toEqual([s.roundClip.id, s.roundClip.id]);
    expect(s.deadline - Date.now()).toBe(60000);
  });

  it('uses a different clip every round', () => {
    const g = started();
    const seen = [g.publicState().roundClip.id];
    for (let r = 2; r <= 3; r++) {
      vi.advanceTimersByTime(60000);
      runUntil(g, x => x.phase === 'record' && x.round === r);
      seen.push(g.publicState().roundClip.id);
    }
    expect(new Set(seen).size).toBe(3);
  });

  it('plays every clip before repeating one, even across games', () => {
    const clips = Array.from({ length: 5 }, (_, i) => ({ id: `k${i}`, title: `K${i}`, url: `/clips/k${i}.mp3`, duration: 2 }));
    const g = lobby({ clips });
    const seen = [];
    for (let game = 0; game < 2; game++) {
      g.start('h');
      g.phase = 'final';
      seen.push(g.publicState().roundClip.id);
      // Only round 1 matters per game here; jump back to the lobby for the next game.
      g.backToLobby();
    }
    g.setRounds('h', 3);
    g.start('h');
    seen.push(g.publicState().roundClip.id);
    for (let r = 2; r <= 3; r++) {
      vi.advanceTimersByTime(60000);
      runUntil(g, x => x.phase === 'record' && x.round === r);
      seen.push(g.publicState().roundClip.id);
    }
    expect(new Set(seen).size).toBe(5);
  });

  it('alternates Hindi and English rounds', () => {
    const clips = ['hi', 'en'].flatMap(lang =>
      Array.from({ length: 4 }, (_, i) => ({ id: `${lang}${i}`, title: `${lang}${i}`, url: `/clips/${lang}${i}.mp3`, duration: 2, lang })));
    const g = lobby({ clips });
    g.setRounds('h', 4);
    g.start('h');
    const langs = [g.publicState().roundClip.lang];
    for (let r = 2; r <= 4; r++) {
      vi.advanceTimersByTime(60000);
      runUntil(g, x => x.phase === 'record' && x.round === r);
      langs.push(g.publicState().roundClip.lang);
    }
    expect([['hi', 'en', 'hi', 'en'], ['en', 'hi', 'en', 'hi']]).toContainEqual(langs);
  });

  it('starts a fresh cycle once every clip has been played', () => {
    const g = lobby();
    const seen = [];
    for (let game = 0; game < 2; game++) {
      g.start('h');
      for (let r = 2; r <= 3; r++) {
        vi.advanceTimersByTime(60000);
        runUntil(g, x => x.phase === 'record' && x.round === r);
      }
      seen.push(g.playedClipIds.size);
      g.backToLobby();
    }
    expect(seen).toEqual([3, 3]);
  });

  it('drops players who left the lobby before the start', () => {
    const g = lobby();
    g.join('x', 'Ghost', 'member');
    g.disconnect('x');
    g.start('h');
    expect(g.publicState().members.map(m => m.name)).toEqual(['Mia', 'Neo']);
  });

  it('keeps the host when a stand-in starts the game', () => {
    const g = lobby();
    g.disconnect('h');
    expect(g.start('m').ok).toBe(true);
    expect(g.publicState().host).toMatchObject({ id: 'h', connected: false });
  });

  it('accepts exactly one recording per member', () => {
    const g = started();
    expect(g.submitRecording('m', { url: '/u/m.webm', duration: 2 })).toEqual({ ok: true });
    expect(g.submitRecording('m', { url: '/u/m2.webm', duration: 2 })).toEqual({ ok: false, error: 'Already submitted' });
    expect(g.submitRecording('h', { url: '/u/h.webm', duration: 2 })).toEqual({ ok: false, error: 'You have no clip this round' });
    expect(g.submitRecording('a', { url: '/u/a.webm', duration: 2 })).toEqual({ ok: false, error: 'You have no clip this round' });
  });

  it('shares each recording URL as soon as it is submitted, so devices can preload it', () => {
    const g = started();
    const mia = () => g.publicState().members.find(m => m.id === 'm');
    expect(mia().recordingUrl).toBeNull();
    g.submitRecording('m', { url: '/u/m.webm', duration: 2 });
    expect(mia().recordingUrl).toBe('/u/m.webm');
  });

  it('clamps the recording duration', () => {
    const g = started();
    g.submitRecording('m', { url: '/u/m.webm', duration: 99 });
    expect(g.player('m').recording.duration).toBe(15);
  });

  it('starts the show as soon as everyone submitted', () => {
    const g = started();
    g.submitRecording('m', { url: '/u/m.webm', duration: 2 });
    g.submitRecording('n', { url: '/u/n.webm', duration: 2 });
    const s = g.publicState();
    expect(s.phase).toBe('show');
    expect(s.show).toMatchObject({ performerId: 'm', step: 'original', count: 2 });
  });

  it('starts the show at the deadline with only the submitters', () => {
    const g = started();
    g.submitRecording('n', { url: '/u/n.webm', duration: 2 });
    vi.advanceTimersByTime(60000);
    expect(g.publicState().show).toMatchObject({ performerId: 'n', count: 1 });
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
    g.submitRecording('m', { url: '/u/m.webm', duration: 2 });
    g.disconnect('n');
    expect(g.publicState().phase).toBe('show');
  });
});
