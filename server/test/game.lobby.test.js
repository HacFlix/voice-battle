import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Game } from '../src/game.js';
import { CLIPS, lobby } from './helpers.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('lobby', () => {
  it('creates a single team with the creator as host', () => {
    const g = new Game({ clips: CLIPS });
    expect(g.createTeam('h', 'Host')).toEqual({ ok: true });
    const s = g.publicState();
    expect(s.phase).toBe('lobby');
    expect(s.hostId).toBe('h');
    expect(s.members.map(m => m.name)).toEqual(['Host']);
    expect(g.createTeam('x', 'Other')).toEqual({ ok: false, error: 'A game already exists' });
  });

  it('rejects joining before a team exists', () => {
    const g = new Game({ clips: CLIPS });
    expect(g.join('x', 'Ann', 'audience')).toEqual({ ok: false, error: 'No team has been created yet' });
  });

  it('lets people join as team member or audience', () => {
    const s = lobby().publicState();
    expect(s.members.map(m => m.name)).toEqual(['Host', 'Mia']);
    expect(s.audience.map(a => a.name)).toEqual(['Aud']);
  });

  it('validates names and roles', () => {
    const g = lobby();
    expect(g.join('x', '   ', 'member').ok).toBe(false);
    expect(g.join('x', 'a'.repeat(21), 'member').ok).toBe(false);
    expect(g.join('x', 'mia', 'audience')).toEqual({ ok: false, error: 'That name is taken' });
    expect(g.join('x', 'Zed', 'judge')).toEqual({ ok: false, error: 'Choose team member or audience' });
  });

  it('caps the team at 6 members but not the audience', () => {
    const g = lobby();
    for (let i = 0; i < 4; i++) expect(g.join(`m${i}`, `P${i}`, 'member').ok).toBe(true);
    expect(g.join('m9', 'P9', 'member')).toEqual({ ok: false, error: 'Team is full' });
    for (let i = 0; i < 20; i++) expect(g.join(`a${i}`, `A${i}`, 'audience').ok).toBe(true);
  });

  it('gives each member a different character', () => {
    const g = lobby();
    g.join('x', 'Xi', 'member');
    const chars = g.publicState().members.map(m => m.character);
    expect(new Set(chars).size).toBe(chars.length);
  });

  it('only lets the host set rounds to 3 or 4', () => {
    const g = lobby();
    expect(g.setRounds('m', 4).ok).toBe(false);
    expect(g.setRounds('h', 5)).toEqual({ ok: false, error: 'Rounds must be 3 or 4' });
    expect(g.setRounds('h', 4)).toEqual({ ok: true });
    expect(g.publicState().rounds).toBe(4);
  });

  it('only lets the host add clips', () => {
    const g = lobby();
    const clip = { id: 'u1', title: 'Mine', url: '/uploads/clips/u1.mp3', duration: 3 };
    expect(g.addClip('m', clip).ok).toBe(false);
    expect(g.addClip('h', clip).ok).toBe(true);
    expect(g.publicState().clipCount).toBe(4);
  });

  it('explains why the game cannot start yet', () => {
    const g = new Game({ clips: CLIPS });
    g.createTeam('h', 'Host');
    expect(g.publicState().startProblem).toBe('Need at least 2 team members');
    g.join('m', 'Mia', 'member');
    expect(g.publicState().startProblem).toBe('Need at least 1 audience member');
    expect(g.start('h')).toEqual({ ok: false, error: 'Need at least 1 audience member' });
    g.join('a', 'Aud', 'audience');
    expect(g.publicState().startProblem).toBeNull();
    expect(g.start('m')).toEqual({ ok: false, error: 'Only the host can start' });
  });

  it('restores a player who reconnects with the same id', () => {
    const g = lobby();
    g.disconnect('m');
    expect(g.player('m').connected).toBe(false);
    g.reconnect('m');
    expect(g.player('m').connected).toBe(true);
  });

  it('hands the host role to the next connected member', () => {
    const g = lobby();
    g.disconnect('h');
    expect(g.publicState().hostId).toBe('m');
  });

  it('closes the game when no team members remain connected', () => {
    const onEvent = vi.fn();
    const g = lobby({ onEvent });
    g.disconnect('h');
    g.disconnect('m');
    expect(g.publicState().phase).toBe('none');
    expect(onEvent).toHaveBeenCalledWith('reset');
  });
});
