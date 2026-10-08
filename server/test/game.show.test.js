import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Game } from '../src/game.js';
import { CLIPS, lobby, started, submitAll, runUntil } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const step = g => g.publicState().show?.step ?? null;

describe('stage show', () => {
  it('runs the stage steps in order for each performer', () => {
    const g = started();
    submitAll(g);
    const seen = [];
    for (let i = 0; i < 3000 && g.phase === 'show'; i++) {
      const s = g.publicState().show;
      const key = `${s.performerId}:${s.step}`;
      if (seen.at(-1) !== key) seen.push(key);
      vi.advanceTimersByTime(100);
    }
    const steps = ['walkIn', 'perform', 'vote', 'reveal', 'walkOut'];
    expect(seen).toEqual(['h:original', ...steps.map(s => `h:${s}`), ...steps.map(s => `m:${s}`)]);
    expect(g.phase).toBe('leaderboard');
  });

  it('plays the original once, for the clip length plus padding', () => {
    const g = started();
    submitAll(g);
    const clip = g.publicState().roundClip;
    expect(g.publicState().show.step).toBe('original');
    expect(g.deadline - Date.now()).toBe((clip.duration + 0.5) * 1000);
  });

  it('only accepts valid audience votes while voting is open', () => {
    const g = started();
    submitAll(g);
    expect(g.vote('a', 50)).toEqual({ ok: false, error: 'Voting is closed' });
    runUntil(g, x => step(x) === 'vote');
    expect(g.vote('m', 50)).toEqual({ ok: false, error: 'Only the audience can vote' });
    expect(g.vote('a', 101).ok).toBe(false);
    expect(g.vote('a', -1).ok).toBe(false);
    expect(g.vote('a', '80').ok).toBe(false);
    expect(g.vote('a', 60)).toEqual({ ok: true });
    expect(g.vote('a', 65)).toEqual({ ok: true });
    expect(g.publicState().show.votes).toBe(1);
    expect(g.publicState().show.score).toBeNull();
  });

  it('scores the rounded average of the audience votes', () => {
    const g = lobby();
    g.join('b', 'Bo', 'audience');
    g.start('h');
    submitAll(g);
    runUntil(g, x => step(x) === 'vote');
    g.vote('a', 80);
    g.vote('b', 71);
    runUntil(g, x => step(x) === 'reveal');
    expect(g.publicState().show.score).toBe(76);
    expect(g.player('h').scores).toEqual([76]);
  });

  it('scores 0 when nobody votes', () => {
    const g = started();
    submitAll(g);
    runUntil(g, x => step(x) === 'reveal');
    expect(g.publicState().show.score).toBe(0);
  });

  it('broadcasts audience reactions during voting', () => {
    const onEvent = vi.fn();
    const g = started({ onEvent });
    submitAll(g);
    expect(g.react('a', '🔥').ok).toBe(false);
    runUntil(g, x => step(x) === 'vote');
    expect(g.react('m', '🔥')).toEqual({ ok: false, error: 'Only the audience can react' });
    expect(g.react('a', '💩')).toEqual({ ok: false, error: 'Unknown reaction' });
    expect(g.react('a', '🔥')).toEqual({ ok: true });
    expect(onEvent).toHaveBeenCalledWith('reaction', { emoji: '🔥', from: 'Aud' });
    expect(g.player('h').reactions).toBe(1);
  });

  it('skips a performer who disconnected', () => {
    const g = started();
    submitAll(g);
    g.disconnect('m');
    const performers = new Set();
    for (let i = 0; i < 3000 && g.phase === 'show'; i++) {
      performers.add(g.publicState().show.performerId);
      vi.advanceTimersByTime(100);
    }
    expect([...performers]).toEqual(['h']);
  });

  it('applies the time scale to every timer', () => {
    const g = new Game({ clips: CLIPS, config: { timeScale: 0.01 } });
    g.createTeam('h', 'Host');
    g.join('m', 'Mia', 'member');
    g.join('a', 'Aud', 'audience');
    g.start('h');
    expect(g.deadline - Date.now()).toBe(600);
  });
});
