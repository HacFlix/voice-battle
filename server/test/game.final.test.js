import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { started, playRound } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('rounds and final', () => {
  it('shows the leaderboard, then starts the next round', () => {
    const g = started();
    playRound(g);
    expect(g.publicState().deadline - Date.now()).toBe(6000);
    vi.advanceTimersByTime(6000);
    expect(g.publicState()).toMatchObject({ phase: 'record', round: 2 });
  });

  it('ends with totals and awards after the last round', () => {
    const g = started();
    for (let r = 0; r < 3; r++) {
      playRound(g, id => (id === 'm' ? 90 : 40));
      vi.advanceTimersByTime(6000);
    }
    const s = g.publicState();
    expect(s.phase).toBe('final');
    expect(s.members.map(m => m.total)).toEqual([270, 120]);
    expect(s.awards.closestMatch).toEqual({ playerId: 'm', name: 'Mia', value: 90 });
  });

  it('lets a member rejoin by name mid-game and keep their scores', () => {
    const g = started();
    playRound(g);
    g.disconnect('n');
    expect(g.join('new', 'neo', 'member')).toEqual({ ok: true });
    expect(g.player('new')).toMatchObject({ name: 'Neo', connected: true, scores: [70] });
  });

  it('lets the host rejoin by name mid-game', () => {
    const g = started();
    g.disconnect('h');
    expect(g.join('h2', 'host', 'member')).toEqual({ ok: true });
    expect(g.publicState()).toMatchObject({ hostId: 'h2', actingHostId: 'h2' });
  });

  it('rejects new people once the game started', () => {
    const g = started();
    expect(g.join('z', 'Zed', 'audience')).toEqual({ ok: false, error: 'Game already started' });
  });

  it('shows the final for 20 seconds, then returns everyone to the lobby with fresh scores', () => {
    const onEvent = vi.fn();
    const g = started({ onEvent });
    for (let r = 0; r < 3; r++) {
      playRound(g);
      vi.advanceTimersByTime(6000);
    }
    expect(g.publicState().phase).toBe('final');
    expect(g.publicState().deadline - Date.now()).toBe(20000);
    vi.advanceTimersByTime(20000);
    const s = g.publicState();
    expect(s.phase).toBe('lobby');
    expect(s.host.id).toBe('h');
    expect(s.members.every(m => m.total === 0)).toBe(true);
    expect(onEvent).toHaveBeenCalledWith('clearRecordings');
  });

  it('only the host can end the game', () => {
    const g = started();
    expect(g.end('m').ok).toBe(false);
    expect(g.end('h')).toEqual({ ok: true });
    expect(g.publicState().phase).toBe('none');
  });
});
