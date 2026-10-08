import { vi, expect } from 'vitest';
import { Game } from '../src/game.js';

export const CLIPS = [
  { id: 'c1', title: 'Clip 1', url: '/clips/c1.mp3', duration: 2 },
  { id: 'c2', title: 'Clip 2', url: '/clips/c2.mp3', duration: 3 },
  { id: 'c3', title: 'Clip 3', url: '/clips/c3.mp3', duration: 4 },
];

// Host "h" moderates; "m" (Mia) and "n" (Neo) are the team; "a" is the audience.
export function lobby(options = {}) {
  const g = new Game({ clips: CLIPS, ...options });
  g.createTeam('h', 'Host');
  g.join('m', 'Mia', 'member');
  g.join('n', 'Neo', 'member');
  g.join('a', 'Aud', 'audience');
  return g;
}

export function started(options) {
  const g = lobby(options);
  expect(g.start('h').ok).toBe(true);
  return g;
}

export function submitAll(g) {
  for (const m of g.members()) {
    if (m.connected && m.clip && !m.recording) g.submitRecording(m.id, { url: `/uploads/${m.id}.webm`, duration: 2 });
  }
}

export function runUntil(g, pred, maxTicks = 3000) {
  for (let i = 0; i < maxTicks && !pred(g); i++) vi.advanceTimersByTime(100);
  expect(pred(g)).toBe(true);
}

export function playRound(g, voteFor = () => 70) {
  submitAll(g);
  for (let i = 0; i < 5000 && g.phase === 'show'; i++) {
    const s = g.publicState().show;
    if (s.step === 'vote' && g.show.votes.a === undefined) g.vote('a', voteFor(s.performerId));
    vi.advanceTimersByTime(100);
  }
  expect(g.phase).toBe('leaderboard');
}
