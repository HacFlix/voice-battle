# Voice Battle (2D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable online Voice Battle with a 2D stage: one team, members record imitations of meme clips, characters perform them on stage, the audience votes 0–100, 3–4 rounds, final scorecard with awards.

**Architecture:** Node server (Express + Socket.IO) owns a single authoritative `Game` state machine with timers and broadcasts `publicState()` on every change; clients send intents over the socket and upload audio over HTTP. React (Vite) client renders screens from state; the stage is one component (`Stage2D`) so it can be swapped for 3D later.

**Tech Stack:** Node 22, Express 5, Socket.IO 4, multer, music-metadata, Vitest; React 19, Vite, socket.io-client, canvas-confetti; Kenney Toon Characters (CC0); ffmpeg (asset prep only).

**Spec:** `docs/superpowers/specs/2026-10-08-voice-battle-design.md`

## Global Constraints

- Only one game exists at a time; nobody can create a team while one exists.
- Team 2–6 members (host included); audience ≥1 to start, unlimited.
- Rounds 3 or 4, chosen by host. Same rules every round.
- Recording window 60 s, up to 3 takes, one submission. Recordings capped at 15 s.
- Voting window 10 s, audience only, 0–100; score = rounded average; no votes → 0.
- Emoji reactions 👏 😂 🔥 🍅, audience only, during voting.
- Stage step timeline: original (clip+0.5 s) → walkIn 1.5 s → perform (rec+0.5 s) → vote 10 s → reveal 3 s → walkOut 1.5 s.
- Cheer when score ≥70, groan when <40.
- Reconnect grace 5 s; no connected members → game closed.
- Player identity is a per-tab id in `sessionStorage` (so several tabs in one browser act as different players).
- Clip pack: Bollywood + English meme clips, ≤8 s, private use only.

## Review Focus

1. Page refresh mid-game → player must come back as themselves (same id via sessionStorage + 5 s grace). Covered by `reconnect` test (Task 1) and grace logic (Task 5).
2. A member disconnects during recording or while queued to perform → game must not stall. Tests in Task 2 and Task 3.
3. Bad votes (out of range, non-numeric, from team members, outside window) → rejected. Test in Task 3.
4. Mic blocked / insecure origin / no MediaRecorder → readable error, no crash. Handled in `micError` (Task 7), checked manually.
5. Player refreshes during the show → audio must still autoplay after one tap ("Tap to enter the stage" overlay, Task 8), checked manually.

---

## File Structure

```
package.json                 root scripts (dev/test/build/start), concurrently
.gitignore
README.md
scripts/fetch-assets.mjs     one-off: clip pack + characters
server/
  package.json
  src/game.js                Game state machine (pure, timer-driven)
  src/awards.js              computeAwards(members)
  src/index.js               Express + Socket.IO + uploads wiring
  clips/clips.json, *.mp3    clip pack
  scripts/smoke.mjs          end-to-end smoke test against a running server
  test/helpers.js
  test/game.lobby.test.js
  test/game.rounds.test.js
  test/game.show.test.js
  test/game.final.test.js
  test/awards.test.js
client/
  package.json, vite.config.js, index.html
  public/characters/<key>/<pose>.png
  src/main.jsx, App.jsx, styles.css
  src/lib/socket.js          playerId, socket, send()
  src/lib/useGame.js         state + server clock offset
  src/lib/time.js            useSecondsLeft
  src/lib/api.js             upload()
  src/lib/audio.js           playUrl, stopPlayback, sfx (WebAudio synth), unlock hooks
  src/lib/recorder.js        useRecorder
  src/lib/characters.js      pose(character, name)
  src/components/Avatar.jsx, Header.jsx
  src/screens/Home.jsx, Lobby.jsx, Record.jsx, Show.jsx, Leaderboard.jsx, Final.jsx
  src/stage/Stage2D.jsx
```

---

### Task 1: Project scaffold + Game lobby rules

**Files:**
- Create: `package.json`, `.gitignore`, `server/package.json`, `server/src/game.js`, `server/src/awards.js` (stub returning nulls, completed in Task 4), `server/test/helpers.js`, `server/test/game.lobby.test.js`

**Interfaces:**
- Produces: `new Game({ clips, config, rng, onChange, onEvent })`; methods `createTeam(id,name)`, `join(id,name,role)`, `reconnect(id)`, `disconnect(id)`, `setRounds(id,n)`, `addClip(id,clip)`, `start(id)`, `publicState()`, `player(id)`, `members()`. All actions return `{ok:true}` or `{ok:false,error}`. Clip shape `{id,title,url,duration}`.

- [ ] **Step 1: Scaffold**

`package.json`:
```json
{
  "name": "voice-battle",
  "private": true,
  "scripts": {
    "setup": "npm install && npm --prefix server install && npm --prefix client install",
    "dev": "concurrently -n server,client -c magenta,cyan \"npm --prefix server run dev\" \"npm --prefix client run dev\"",
    "test": "npm --prefix server test",
    "build": "npm --prefix client run build",
    "start": "npm --prefix server start"
  },
  "devDependencies": { "concurrently": "^9.2.0" }
}
```
`.gitignore`:
```
node_modules/
client/dist/
server/uploads/
```
`server/package.json`:
```json
{
  "name": "voice-battle-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "vitest run",
    "smoke": "node scripts/smoke.mjs"
  }
}
```
Run: `cd server && npm i express socket.io multer music-metadata && npm i -D vitest socket.io-client`

- [ ] **Step 2: Write test helpers and failing lobby tests**

`server/test/helpers.js`:
```js
import { vi, expect } from 'vitest';
import { Game } from '../src/game.js';

export const CLIPS = [
  { id: 'c1', title: 'Clip 1', url: '/clips/c1.mp3', duration: 2 },
  { id: 'c2', title: 'Clip 2', url: '/clips/c2.mp3', duration: 3 },
  { id: 'c3', title: 'Clip 3', url: '/clips/c3.mp3', duration: 4 },
];

export function lobby(options = {}) {
  const g = new Game({ clips: CLIPS, ...options });
  g.createTeam('h', 'Host');
  g.join('m', 'Mia', 'member');
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
```
`server/test/game.lobby.test.js`:
```js
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
```

- [ ] **Step 3: Run tests — expect FAIL** (`cd server && npx vitest run test/game.lobby.test.js` → cannot find `../src/game.js`).

- [ ] **Step 4: Implement `server/src/awards.js` stub and full `server/src/game.js`**

`server/src/awards.js` (stub; real logic in Task 4):
```js
export function computeAwards() {
  return { crowdFavourite: null, closestMatch: null, consistentPerformer: null };
}
```
`server/src/game.js` — the complete state machine (later tasks only add tests against it):
```js
import { computeAwards } from './awards.js';

export const DEFAULT_CONFIG = {
  maxMembers: 6,
  minMembers: 2,
  minAudience: 1,
  recordSeconds: 60,
  maxTakes: 3,
  maxRecordingSeconds: 15,
  voteSeconds: 10,
  walkSeconds: 1.5,
  revealSeconds: 3,
  leaderboardSeconds: 6,
  padSeconds: 0.5,
  timeScale: 1,
};

export const EMOJIS = ['👏', '😂', '🔥', '🍅'];
export const STEPS = ['original', 'walkIn', 'perform', 'vote', 'reveal', 'walkOut'];

const ok = () => ({ ok: true });
const fail = error => ({ ok: false, error });

function cleanName(raw) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= 20 ? name : null;
}

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  constructor({ clips = [], config = {}, rng = Math.random, onChange = () => {}, onEvent = () => {} } = {}) {
    this.baseClips = clips;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = rng;
    this.onChange = onChange;
    this.onEvent = onEvent;
    this.timer = null;
    this.reset(false);
  }

  reset(notify = true) {
    clearTimeout(this.timer);
    this.timer = null;
    this.phase = 'none';
    this.players = [];
    this.hostId = null;
    this.rounds = 3;
    this.round = 0;
    this.deadline = null;
    this.show = null;
    this.awards = null;
    this.extraClips = [];
    if (notify) {
      this.onEvent('reset');
      this.onChange();
    }
  }

  get clips() {
    return [...this.baseClips, ...this.extraClips];
  }

  player(id) {
    return this.players.find(p => p.id === id);
  }

  members() {
    return this.players.filter(p => p.role === 'member');
  }

  audience() {
    return this.players.filter(p => p.role === 'audience');
  }

  connectedMembers() {
    return this.members().filter(p => p.connected);
  }

  isHost(id) {
    return id === this.hostId;
  }

  changed() {
    this.onChange();
    return ok();
  }

  later(seconds, fn) {
    clearTimeout(this.timer);
    const ms = Math.round(seconds * this.config.timeScale * 1000);
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(fn, ms);
  }

  addPlayer(id, name, role) {
    let character = null;
    if (role === 'member') {
      const used = new Set(this.members().map(m => m.character));
      character = 0;
      while (used.has(character)) character++;
    }
    const p = { id, name, role, connected: true, character, scores: [], reactions: 0, clip: null, recording: null };
    this.players.push(p);
    return p;
  }

  rekey(p, newId) {
    if (this.hostId === p.id) this.hostId = newId;
    if (this.show) {
      this.show.order = this.show.order.map(id => (id === p.id ? newId : id));
      if (p.id in this.show.votes) {
        this.show.votes[newId] = this.show.votes[p.id];
        delete this.show.votes[p.id];
      }
    }
    p.id = newId;
  }

  createTeam(id, rawName) {
    if (this.phase !== 'none') return fail('A game already exists');
    const name = cleanName(rawName);
    if (!name) return fail('Enter a name (1-20 characters)');
    this.addPlayer(id, name, 'member');
    this.hostId = id;
    this.phase = 'lobby';
    return this.changed();
  }

  join(id, rawName, role) {
    const existing = this.player(id);
    if (existing) {
      existing.connected = true;
      return this.changed();
    }
    if (this.phase === 'none') return fail('No team has been created yet');
    const name = cleanName(rawName);
    if (!name) return fail('Enter a name (1-20 characters)');
    const same = this.players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (same) {
      if (same.connected) return fail('That name is taken');
      this.rekey(same, id);
      same.connected = true;
      return this.changed();
    }
    if (this.phase !== 'lobby') return fail('Game already started');
    if (role !== 'member' && role !== 'audience') return fail('Choose team member or audience');
    if (role === 'member' && this.members().length >= this.config.maxMembers) return fail('Team is full');
    this.addPlayer(id, name, role);
    return this.changed();
  }

  reconnect(id) {
    const p = this.player(id);
    if (p && !p.connected) {
      p.connected = true;
      this.changed();
    }
  }

  disconnect(id) {
    const p = this.player(id);
    if (!p || !p.connected) return;
    p.connected = false;
    const remaining = this.connectedMembers();
    if (remaining.length === 0) {
      this.reset();
      return;
    }
    if (this.isHost(id)) this.hostId = remaining[0].id;
    if (this.phase === 'record' && this.allSubmitted()) {
      this.beginShow();
      return;
    }
    this.changed();
  }

  setRounds(id, n) {
    if (!this.isHost(id) || this.phase !== 'lobby') return fail('Only the host can change rounds');
    if (n !== 3 && n !== 4) return fail('Rounds must be 3 or 4');
    this.rounds = n;
    return this.changed();
  }

  addClip(id, clip) {
    if (!this.isHost(id) || this.phase !== 'lobby') return fail('Only the host can add clips in the lobby');
    this.extraClips.push(clip);
    return this.changed();
  }

  startProblem() {
    const c = this.config;
    if (this.connectedMembers().length < c.minMembers) return `Need at least ${c.minMembers} team members`;
    if (this.audience().filter(p => p.connected).length < c.minAudience) return `Need at least ${c.minAudience} audience member`;
    if (this.clips.length === 0) return 'No clips available';
    return null;
  }

  start(id) {
    if (!this.isHost(id)) return fail('Only the host can start');
    if (this.phase !== 'lobby') return fail('Game already started');
    const problem = this.startProblem();
    if (problem) return fail(problem);
    this.players = this.players.filter(p => p.connected);
    for (const m of this.members()) {
      m.scores = [];
      m.reactions = 0;
    }
    this.round = 0;
    this.awards = null;
    this.startRound();
    return ok();
  }

  startRound() {
    this.round += 1;
    this.phase = 'record';
    this.show = null;
    const pool = shuffle(this.clips, this.rng);
    for (const m of this.members()) {
      m.clip = null;
      m.recording = null;
    }
    this.connectedMembers().forEach((m, i) => {
      m.clip = pool[i % pool.length];
    });
    this.later(this.config.recordSeconds, () => this.beginShow());
    this.changed();
  }

  allSubmitted() {
    return this.connectedMembers().filter(m => m.clip).every(m => m.recording);
  }

  submitRecording(id, { url, duration }) {
    const p = this.player(id);
    if (this.phase !== 'record') return fail('Not recording right now');
    if (!p || p.role !== 'member' || !p.clip) return fail('You have no clip this round');
    if (p.recording) return fail('Already submitted');
    const max = this.config.maxRecordingSeconds;
    const d = Number(duration);
    p.recording = { url, duration: Math.min(max, Math.max(0.5, Number.isFinite(d) ? d : max)) };
    if (this.allSubmitted()) {
      this.beginShow();
      return ok();
    }
    return this.changed();
  }

  beginShow() {
    const order = this.members().filter(m => m.recording).map(m => m.id);
    this.phase = 'show';
    this.show = { order, index: -1, step: null, votes: {}, score: null };
    this.nextPerformer();
  }

  performer() {
    return this.show ? this.player(this.show.order[this.show.index]) : null;
  }

  nextPerformer() {
    const s = this.show;
    do {
      s.index += 1;
    } while (s.index < s.order.length && !this.player(s.order[s.index])?.connected);
    if (s.index >= s.order.length) {
      this.endRound();
      return;
    }
    s.votes = {};
    s.score = null;
    this.runStep('original');
  }

  stepSeconds(step, p) {
    const c = this.config;
    switch (step) {
      case 'original': return p.clip.duration + c.padSeconds;
      case 'walkIn':
      case 'walkOut': return c.walkSeconds;
      case 'perform': return p.recording.duration + c.padSeconds;
      case 'vote': return c.voteSeconds;
      case 'reveal': return c.revealSeconds;
      default: throw new Error(`Unknown step ${step}`);
    }
  }

  runStep(step) {
    const p = this.performer();
    this.show.step = step;
    if (step === 'reveal') {
      const values = Object.values(this.show.votes);
      const score = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
      this.show.score = score;
      p.scores[this.round - 1] = score;
    }
    const next = STEPS[STEPS.indexOf(step) + 1];
    this.later(this.stepSeconds(step, p), () => (next ? this.runStep(next) : this.nextPerformer()));
    this.changed();
  }

  vote(id, value) {
    const p = this.player(id);
    if (!p || p.role !== 'audience') return fail('Only the audience can vote');
    if (this.phase !== 'show' || this.show.step !== 'vote') return fail('Voting is closed');
    const v = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isFinite(v) || v < 0 || v > 100) return fail('Vote must be 0-100');
    this.show.votes[id] = Math.round(v);
    return this.changed();
  }

  react(id, emoji) {
    const p = this.player(id);
    if (!p || p.role !== 'audience') return fail('Only the audience can react');
    if (this.phase !== 'show' || this.show.step !== 'vote') return fail('Reactions are closed');
    if (!EMOJIS.includes(emoji)) return fail('Unknown reaction');
    this.performer().reactions += 1;
    this.onEvent('reaction', { emoji, from: p.name });
    return ok();
  }

  endRound() {
    for (const m of this.members()) {
      if (m.scores[this.round - 1] === undefined) m.scores[this.round - 1] = 0;
    }
    this.phase = 'leaderboard';
    this.show = null;
    this.later(this.config.leaderboardSeconds, () => (this.round < this.rounds ? this.startRound() : this.finish()));
    this.changed();
  }

  finish() {
    clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
    this.phase = 'final';
    this.awards = computeAwards(this.members());
    this.changed();
  }

  playAgain(id) {
    if (!this.isHost(id) || this.phase !== 'final') return fail('Only the host can restart after the final');
    this.players = this.players.filter(p => p.connected);
    for (const m of this.members()) {
      m.scores = [];
      m.reactions = 0;
      m.clip = null;
      m.recording = null;
    }
    this.round = 0;
    this.awards = null;
    this.deadline = null;
    this.phase = 'lobby';
    this.onEvent('clearRecordings');
    return this.changed();
  }

  end(id) {
    if (!this.isHost(id)) return fail('Only the host can end the game');
    this.reset();
    return ok();
  }

  publicState() {
    const c = this.config;
    const s = this.show;
    const p = this.performer();
    const total = m => m.scores.reduce((a, b) => a + (b || 0), 0);
    return {
      phase: this.phase,
      hostId: this.hostId,
      rounds: this.rounds,
      round: this.round,
      deadline: this.deadline,
      now: Date.now(),
      clipCount: this.clips.length,
      startProblem: this.phase === 'lobby' ? this.startProblem() : null,
      config: {
        maxMembers: c.maxMembers,
        maxTakes: c.maxTakes,
        maxRecordingSeconds: c.maxRecordingSeconds,
        walkSeconds: c.walkSeconds * c.timeScale,
      },
      members: this.members().map(m => ({
        id: m.id,
        name: m.name,
        connected: m.connected,
        character: m.character,
        scores: [...m.scores],
        total: total(m),
        reactions: m.reactions,
        clip: m.clip,
        submitted: Boolean(m.recording),
      })),
      audience: this.audience().filter(a => a.connected).map(a => ({ id: a.id, name: a.name })),
      show: s && p ? {
        performerId: p.id,
        step: s.step,
        clip: p.clip,
        recordingUrl: p.recording.url,
        score: s.step === 'reveal' || s.step === 'walkOut' ? s.score : null,
        votes: Object.keys(s.votes).length,
        index: s.index,
        count: s.order.length,
      } : null,
      awards: this.awards,
    };
  }
}
```

- [ ] **Step 5: Run tests — expect PASS** (`npx vitest run test/game.lobby.test.js`).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: game lobby rules and server scaffold"`

---

### Task 2: Recording phase

**Files:** Test: `server/test/game.rounds.test.js` (game.js already implements this; fix game.js if any test fails)

**Interfaces:** Consumes `submitRecording(id,{url,duration})`, `publicState().show`, `deadline`.

- [ ] **Step 1: Write tests**
```js
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
```
- [ ] **Step 2: Run** `npx vitest run test/game.rounds.test.js` → PASS (fix `game.js` if not).
- [ ] **Step 3: Commit** — `git commit -am "test: recording phase"` (add file first).

---

### Task 3: Stage show, voting, reactions

**Files:** Test: `server/test/game.show.test.js`

- [ ] **Step 1: Write tests**
```js
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
    const steps = ['original', 'walkIn', 'perform', 'vote', 'reveal', 'walkOut'];
    expect(seen).toEqual([...steps.map(s => `h:${s}`), ...steps.map(s => `m:${s}`)]);
    expect(g.phase).toBe('leaderboard');
  });

  it('plays the original for the clip length plus padding', () => {
    const g = started();
    submitAll(g);
    const clip = g.player('h').clip;
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
```
- [ ] **Step 2: Run** `npx vitest run test/game.show.test.js` → PASS.
- [ ] **Step 3: Commit** — `git add server/test && git commit -m "test: stage show, voting, reactions"`

---

### Task 4: Awards, rounds, final, play again / end, rejoin

**Files:** Modify: `server/src/awards.js`. Test: `server/test/awards.test.js`, `server/test/game.final.test.js`

**Interfaces:** Produces `computeAwards(members) → { crowdFavourite, closestMatch, consistentPerformer }`, each `{playerId,name,value}` or `null`.

- [ ] **Step 1: Write failing tests**

`server/test/awards.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { computeAwards } from '../src/awards.js';

const m = (id, scores, reactions = 0) => ({ id, name: id.toUpperCase(), scores, reactions });

describe('awards', () => {
  it('picks the winner of each award', () => {
    const a = computeAwards([m('a', [50, 60, 70], 3), m('b', [90, 10, 40], 5), m('c', [55, 55, 58])]);
    expect(a.crowdFavourite).toEqual({ playerId: 'b', name: 'B', value: 5 });
    expect(a.closestMatch).toEqual({ playerId: 'b', name: 'B', value: 90 });
    expect(a.consistentPerformer).toEqual({ playerId: 'c', name: 'C', value: 3 });
  });

  it('leaves an award empty when nobody qualifies', () => {
    const a = computeAwards([m('a', [0])]);
    expect(a).toEqual({ crowdFavourite: null, closestMatch: null, consistentPerformer: null });
  });

  it('gives ties to the earlier player', () => {
    const a = computeAwards([m('a', [80, 80], 2), m('b', [80, 80], 2)]);
    expect(a.crowdFavourite.playerId).toBe('a');
    expect(a.closestMatch.playerId).toBe('a');
    expect(a.consistentPerformer.playerId).toBe('a');
  });
});
```
`server/test/game.final.test.js`:
```js
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
      playRound(g, id => (id === 'h' ? 90 : 40));
      vi.advanceTimersByTime(6000);
    }
    const s = g.publicState();
    expect(s.phase).toBe('final');
    expect(s.members.map(m => m.total)).toEqual([270, 120]);
    expect(s.awards.closestMatch).toEqual({ playerId: 'h', name: 'Host', value: 90 });
  });

  it('lets a member rejoin by name mid-game and keep their scores', () => {
    const g = started();
    playRound(g);
    g.disconnect('m');
    expect(g.join('new', 'mia', 'member')).toEqual({ ok: true });
    expect(g.player('new')).toMatchObject({ name: 'Mia', connected: true, scores: [70] });
  });

  it('rejects new people once the game started', () => {
    const g = started();
    expect(g.join('z', 'Zed', 'audience')).toEqual({ ok: false, error: 'Game already started' });
  });

  it('play again returns everyone to the lobby with fresh scores', () => {
    const onEvent = vi.fn();
    const g = started({ onEvent });
    for (let r = 0; r < 3; r++) {
      playRound(g);
      vi.advanceTimersByTime(6000);
    }
    expect(g.playAgain('m').ok).toBe(false);
    expect(g.playAgain('h')).toEqual({ ok: true });
    const s = g.publicState();
    expect(s.phase).toBe('lobby');
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
```
- [ ] **Step 2: Run** `npx vitest run` → awards tests and the final-awards test FAIL (stub returns nulls).
- [ ] **Step 3: Implement `server/src/awards.js`**
```js
const entry = (m, value) => ({ playerId: m.id, name: m.name, value });

export function computeAwards(members) {
  let crowdFavourite = null;
  let closestMatch = null;
  let consistentPerformer = null;
  for (const m of members) {
    if (m.reactions > 0 && (!crowdFavourite || m.reactions > crowdFavourite.value)) {
      crowdFavourite = entry(m, m.reactions);
    }
    const best = m.scores.length ? Math.max(...m.scores) : 0;
    if (best > 0 && (!closestMatch || best > closestMatch.value)) closestMatch = entry(m, best);
    if (m.scores.length >= 2) {
      const spread = Math.max(...m.scores) - Math.min(...m.scores);
      if (!consistentPerformer || spread < consistentPerformer.value) consistentPerformer = entry(m, spread);
    }
  }
  return { crowdFavourite, closestMatch, consistentPerformer };
}
```
- [ ] **Step 4: Run** `npx vitest run` → all PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: awards, final scorecard, play again"`

---

### Task 5: Assets + server wiring + end-to-end smoke

**Files:** Create `scripts/fetch-assets.mjs`, `server/src/index.js`, `server/scripts/smoke.mjs`; generated `server/clips/*`, `client/public/characters/*`.

**Interfaces:** Socket events (client→server, ack `{ok,error}`): `create {name}`, `join {name,role}`, `setRounds {rounds}`, `start`, `vote {value}`, `react {emoji}`, `playAgain`, `end`. Server→client: `state` (publicState), `reaction {emoji,from}`. HTTP: `POST /api/recording` (multipart `audio`, `playerId`, `duration`), `POST /api/clip` (`audio`, `playerId`, `title`). Static: `/clips/*`, `/uploads/*`. Socket handshake `auth: { playerId }`.

- [ ] **Step 1: Write `scripts/fetch-assets.mjs`**
```js
// One-off asset fetch: meme clip pack (voicy.network) + Kenney Toon Characters (CC0).
// Clips are copyrighted material for private play only; replace before a public release.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIPS_OUT = path.join(ROOT, 'server', 'clips');
const CHARS_OUT = path.join(ROOT, 'client', 'public', 'characters');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36';
const MAX_SECONDS = 8;

const CLIPS = [
  ['1MjuoJyfYkWDabEbfwttYA', 'Padhaai likhaai mein dhyan do', 'hi'],
  ['7gKsIlltmUWZ2em-4JZthw', 'Arey kehna kya chahte ho', 'hi'],
  ['IQyrIWMsgkqlZjqrONjjjQ', 'Tareekh pe tareekh', 'hi'],
  ['U-xO2BJrykmtqXkWiPizjg', 'Abhi maza aayega na bhidu', 'hi'],
  ['UR-zPtsHokSErAtP7I8ajA', 'Jo main nahi bolta, woh main definitely karta hoon', 'hi'],
  ['h58gCnhjU0GUhTLN6ECTzA', 'Matlab kuch bhi', 'hi'],
  ['qbN65_ts9kONPktmHNcZ9w', 'Control Uday, control', 'hi'],
  ['riZmGaSy106qMLuU4eLoMQ', 'Golmaal hai bhai sab golmaal hai', 'hi'],
  ['Jm3yA4sFu0itHSr45HfHeA', 'Dhai kilo ka haath', 'hi'],
  ['1V9zV295Vkyey32Du_vq-A', 'Babuchak, chup re', 'hi'],
  ['Nwmx4aGwE06M3qGwiVRAIA', 'Emotional damage', 'en'],
  ['uWyzGQImvE6D-DuJBYfsrA', 'Bing chilling', 'en'],
  ['-TIxxuuockqkRtuqpsJzBg', "I'm Captain Jack Sparrow", 'en'],
  ['SIhT3aEDv0KrTlEb6YPGJw', 'Say hello to my little friend', 'en'],
  ['tkw1j3gzQEmO9eNyCL4MRw', "I'll be back", 'en'],
  ['BDohaLn9lEect2pt-_WIDg', 'I feel the need, the need for speed', 'en'],
  ['MY20nos99kOZ-cZRWI9RLQ', "You want to play? Let's play", 'en'],
  ['y6OqTHj9WE2-G6NkVCFnRg', 'We have a Hulk', 'en'],
  ['NVurE6hoEeihTtSuUqiQGg', 'The power of the dark side', 'en'],
  ['b1QL4gfJYEKxWN4S4lZ0tA', 'I thought we were friends', 'en'],
];

const CHARACTERS = {
  malePerson: 'Male person',
  femalePerson: 'Female person',
  maleAdventurer: 'Male adventurer',
  femaleAdventurer: 'Female adventurer',
  robot: 'Robot',
  zombie: 'Zombie',
};
const POSES = ['idle', 'talk', 'think', 'hurt', 'cheer0', 'cheer1', ...Array.from({ length: 8 }, (_, i) => `walk${i}`)];
const KENNEY_ZIP = 'https://kenney.nl/media/pages/assets/toon-characters/4e8a6e4e53-1774770819/kenney_toon-characters.zip';

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function download(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function fetchClips() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-clips-'));
  fs.mkdirSync(CLIPS_OUT, { recursive: true });
  const manifest = [];
  for (const [voicyId, title, lang] of CLIPS) {
    try {
      const api = await fetch(`https://server.voicy.network/api/clips/${voicyId}?premium=false`, { headers: { 'User-Agent': UA } }).then(r => r.json());
      const raw = path.join(tmp, `${voicyId}.mp3`);
      await download(`https://files.voicy.network/public${api.data.source}`, raw);
      const file = `${slug(title)}.mp3`;
      const out = path.join(CLIPS_OUT, file);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw,
        '-af', `silenceremove=start_periods=1:start_threshold=-45dB,loudnorm=I=-16:TP=-1.5,atrim=0:${MAX_SECONDS},afade=t=out:st=${MAX_SECONDS - 0.4}:d=0.4`,
        '-ac', '1', '-ar', '44100', '-b:a', '96k', out]);
      const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim());
      if (!(duration >= 0.8)) throw new Error('too short');
      manifest.push({ id: slug(title), title, lang, file, duration: Math.round(duration * 100) / 100 });
      console.log(`ok   ${title} (${duration.toFixed(1)}s)`);
    } catch (err) {
      console.warn(`skip ${title}: ${err.message}`);
    }
  }
  fs.writeFileSync(path.join(CLIPS_OUT, 'clips.json'), JSON.stringify(manifest, null, 2));
  console.log(`${manifest.length} clips written`);
}

async function fetchCharacters() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-kenney-'));
  const zip = path.join(tmp, 'toon.zip');
  await download(KENNEY_ZIP, zip);
  execFileSync('tar', ['-xf', zip, '-C', tmp]);
  for (const [key, folder] of Object.entries(CHARACTERS)) {
    const outDir = path.join(CHARS_OUT, key);
    fs.mkdirSync(outDir, { recursive: true });
    for (const pose of POSES) {
      fs.copyFileSync(path.join(tmp, folder, 'PNG', 'Poses HD', `character_${key}_${pose}.png`), path.join(outDir, `${pose}.png`));
    }
  }
  fs.copyFileSync(path.join(tmp, 'License.txt'), path.join(CHARS_OUT, 'LICENSE-kenney.txt'));
  console.log('characters written');
}

await fetchClips();
await fetchCharacters();
```
Run: `node scripts/fetch-assets.mjs` → expect ≥15 `ok` lines and `characters written`. Listen to 2–3 clips to sanity-check.

- [ ] **Step 2: Write `server/src/index.js`**
```js
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { parseFile } from 'music-metadata';
import { Server } from 'socket.io';
import { Game } from './game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIPS_DIR = path.join(ROOT, 'clips');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const REC_DIR = path.join(UPLOADS_DIR, 'recordings');
const CUSTOM_DIR = path.join(UPLOADS_DIR, 'clips');
const CLIENT_DIST = path.resolve(ROOT, '..', 'client', 'dist');
const PORT = Number(process.env.PORT || 3001);
const RECONNECT_GRACE_MS = 5000;
const MAX_CUSTOM_CLIP_SECONDS = 15;

function emptyDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}
emptyDir(REC_DIR);
emptyDir(CUSTOM_DIR);

const clips = JSON.parse(fs.readFileSync(path.join(CLIPS_DIR, 'clips.json'), 'utf8'))
  .map(c => ({ id: c.id, title: c.title, url: `/clips/${c.file}`, duration: c.duration }));

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const game = new Game({
  clips,
  config: { timeScale: Number(process.env.TIME_SCALE || 1) },
  onChange: () => io.emit('state', game.publicState()),
  onEvent: (type, data) => {
    if (type === 'reaction') io.emit('reaction', data);
    if (type === 'clearRecordings') emptyDir(REC_DIR);
    if (type === 'reset') {
      emptyDir(REC_DIR);
      emptyDir(CUSTOM_DIR);
    }
  },
});

function withUpload(dir, handler) {
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.webm';
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
  }).single('audio');

  return (req, res) => upload(req, res, async err => {
    if (err) return res.status(400).json({ ok: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5 MB)' : 'Upload failed' });
    if (!req.file) return res.status(400).json({ ok: false, error: 'No audio file' });
    const result = await handler(req).catch(() => ({ ok: false, error: 'Could not read that audio file' }));
    if (!result.ok) fs.rmSync(req.file.path, { force: true });
    res.status(result.ok ? 200 : 400).json(result);
  });
}

app.post('/api/recording', withUpload(REC_DIR, async req =>
  game.submitRecording(String(req.body.playerId), {
    url: `/uploads/recordings/${req.file.filename}`,
    duration: Number(req.body.duration),
  })));

app.post('/api/clip', withUpload(CUSTOM_DIR, async req => {
  const title = String(req.body.title || '').trim().slice(0, 60);
  if (!title) return { ok: false, error: 'Give the clip a title' };
  const { format } = await parseFile(req.file.path, { duration: true });
  if (!format.duration || format.duration > MAX_CUSTOM_CLIP_SECONDS) {
    return { ok: false, error: `Clip must be audio up to ${MAX_CUSTOM_CLIP_SECONDS} seconds` };
  }
  return game.addClip(String(req.body.playerId), {
    id: req.file.filename,
    title,
    url: `/uploads/clips/${req.file.filename}`,
    duration: format.duration,
  });
}));

app.use('/clips', express.static(CLIPS_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));
if (fs.existsSync(CLIENT_DIST)) app.use(express.static(CLIENT_DIST));

const pendingDisconnects = new Map();

io.on('connection', socket => {
  const playerId = String(socket.handshake.auth?.playerId || '').slice(0, 64);
  if (!playerId) {
    socket.disconnect(true);
    return;
  }
  clearTimeout(pendingDisconnects.get(playerId));
  pendingDisconnects.delete(playerId);
  game.reconnect(playerId);
  socket.emit('state', game.publicState());

  const actions = {
    create: p => game.createTeam(playerId, p.name),
    join: p => game.join(playerId, p.name, p.role),
    setRounds: p => game.setRounds(playerId, Number(p.rounds)),
    start: () => game.start(playerId),
    vote: p => game.vote(playerId, p.value),
    react: p => game.react(playerId, p.emoji),
    playAgain: () => game.playAgain(playerId),
    end: () => game.end(playerId),
  };
  for (const [event, action] of Object.entries(actions)) {
    socket.on(event, (payload, ack) => {
      const result = action(payload && typeof payload === 'object' ? payload : {});
      if (typeof ack === 'function') ack(result);
    });
  }

  socket.on('disconnect', () => {
    pendingDisconnects.set(playerId, setTimeout(async () => {
      pendingDisconnects.delete(playerId);
      const sockets = await io.fetchSockets();
      if (!sockets.some(s => s.handshake.auth?.playerId === playerId)) game.disconnect(playerId);
    }, RECONNECT_GRACE_MS));
  });
});

server.listen(PORT, () => console.log(`Voice Battle server on http://localhost:${PORT}`));
```

- [ ] **Step 3: Write `server/scripts/smoke.mjs`** (plays a full 3-round game through the real server)
```js
import fs from 'node:fs';
import { io } from 'socket.io-client';

const BASE = process.env.BASE || 'http://localhost:3001';
const clipsDir = new URL('../clips/', import.meta.url);
const sample = fs.readFileSync(new URL(fs.readdirSync(clipsDir).find(f => f.endsWith('.mp3')), clipsDir));

const fail = msg => { console.error(`SMOKE FAIL: ${msg}`); process.exit(1); };
const assert = (cond, msg) => { if (!cond) fail(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(pred, label, ms = 60000) {
  const end = Date.now() + ms;
  while (!pred()) { if (Date.now() > end) fail(`timeout waiting for ${label}`); await sleep(20); }
}
function client(playerId) {
  const s = io(BASE, { auth: { playerId }, transports: ['websocket'] });
  s.state = null;
  s.on('state', st => { s.state = st; });
  return s;
}
const send = (s, event, payload = {}) => new Promise(r => s.emit(event, payload, r));
async function upload(playerId) {
  const fd = new FormData();
  fd.append('playerId', playerId);
  fd.append('duration', '1.5');
  fd.append('audio', new Blob([sample], { type: 'audio/mpeg' }), 'take.mp3');
  return (await fetch(`${BASE}/api/recording`, { method: 'POST', body: fd })).json();
}

const host = client('smoke-host');
const mem = client('smoke-mem');
const aud = client('smoke-aud');
await until(() => host.state && mem.state && aud.state, 'initial state');
assert(host.state.phase === 'none', 'a game is already running — restart the server first');

assert((await send(host, 'create', { name: 'Host' })).ok, 'create team');
assert(!(await send(mem, 'create', { name: 'Other' })).ok, 'second team must be rejected');
assert((await send(mem, 'join', { name: 'Mia', role: 'member' })).ok, 'join member');
assert((await send(aud, 'join', { name: 'Aud', role: 'audience' })).ok, 'join audience');
let reactions = 0;
aud.on('reaction', () => { reactions += 1; });
assert((await send(host, 'start')).ok, 'start');

for (let round = 1; round <= 3; round++) {
  await until(() => host.state.phase === 'record' && host.state.round === round, `record r${round}`);
  const clipUrl = host.state.members[0].clip.url;
  assert((await fetch(`${BASE}${clipUrl}`)).ok, `clip served ${clipUrl}`);
  assert((await upload('smoke-host')).ok, `upload host r${round}`);
  assert((await upload('smoke-mem')).ok, `upload mem r${round}`);
  for (let k = 0; k < 2; k++) {
    await until(() => aud.state.show?.step === 'vote' && aud.state.show.index === k, `vote r${round} p${k}`);
    assert((await send(aud, 'vote', { value: k === 0 ? 80 : 50 })).ok, 'vote');
    assert((await send(aud, 'react', { emoji: '👏' })).ok, 'react');
    await until(() => aud.state.show?.step !== 'vote', `reveal r${round} p${k}`);
  }
  await until(() => ['leaderboard', 'final'].includes(host.state.phase), `leaderboard r${round}`);
}
await until(() => host.state.phase === 'final', 'final');

const totals = Object.fromEntries(host.state.members.map(m => [m.name, m.total]));
console.log('totals', totals);
console.log('awards', JSON.stringify(host.state.awards));
assert(totals.Host === 240 && totals.Mia === 150, 'totals should be Host 240 / Mia 150');
assert(host.state.awards.closestMatch?.name === 'Host', 'closest match award');
assert(reactions === 6, `expected 6 reactions, got ${reactions}`);
assert((await send(host, 'end')).ok, 'end');
await until(() => host.state.phase === 'none', 'reset');
console.log('SMOKE PASS');
process.exit(0);
```

- [ ] **Step 4: Run** — terminal 1: `cd server && TIME_SCALE=0.05 node src/index.js`; terminal 2: `cd server && npm run smoke` → `SMOKE PASS`. Also `npm test` → all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: server wiring, asset pack, smoke test"`

---

### Task 6: Client scaffold, Home and Lobby

**Files:** Create `client/package.json` (via Vite), `client/vite.config.js`, `client/index.html`, `client/src/main.jsx`, `client/src/App.jsx`, `client/src/styles.css`, `client/src/lib/{socket,useGame,time,api,characters,audio}.js`, `client/src/components/{Avatar,Header}.jsx`, `client/src/screens/{Home,Lobby}.jsx`.

**Interfaces:**
- `playerId: string`, `socket`, `send(event, payload) → Promise<{ok,error}>` (socket.js)
- `useGame() → { state, offset }` (offset = server clock − local clock, ms)
- `useSecondsLeft(deadline, offset) → number`
- `upload(url, fields, blob, filename) → Promise<{ok,error}>`
- `pose(character, poseName) → url`
- audio.js: `audioCtx()`, `playUrl(url)`, `stopPlayback()`, `sfx[emoji|'cheer'|'groan'|'pop']()`, `unlockAudio()`, `useAudioUnlocked()`, `useAudioUnlock()`
- Screens receive `{ state, me, offset }`; `me = { ...member|audience, role, isHost }`.

- [ ] **Step 1: Create the Vite app and deps**

Run: `npm create vite@latest client -- --template react` then `cd client && npm i socket.io-client canvas-confetti`; delete `src/App.css`, `src/index.css`, `src/assets/`, `public/vite.svg`.

`client/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': target,
      '/clips': target,
      '/uploads': target,
      '/socket.io': { target, ws: true },
    },
  },
});
```
`client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Voice Battle</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bungee&family=Nunito:wght@400;700;800;900&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```
`client/src/main.jsx`:
```jsx
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
```

- [ ] **Step 2: lib files**

`client/src/lib/socket.js`:
```js
import { io } from 'socket.io-client';

function tabPlayerId() {
  let id = sessionStorage.getItem('vb-player');
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('vb-player', id);
  }
  return id;
}

export const playerId = tabPlayerId();
export const socket = io({ auth: { playerId } });

export function send(event, payload = {}) {
  return new Promise(resolve => socket.emit(event, payload, resolve));
}
```
`client/src/lib/useGame.js`:
```js
import { useEffect, useState } from 'react';
import { socket } from './socket.js';

export function useGame() {
  const [game, setGame] = useState({ state: null, offset: 0 });
  useEffect(() => {
    const onState = state => setGame({ state, offset: state.now - Date.now() });
    socket.on('state', onState);
    return () => socket.off('state', onState);
  }, []);
  return game;
}
```
`client/src/lib/time.js`:
```js
import { useEffect, useState } from 'react';

const secondsLeft = (deadline, offset) =>
  deadline ? Math.max(0, Math.ceil((deadline - (Date.now() + offset)) / 1000)) : 0;

export function useSecondsLeft(deadline, offset) {
  const [left, setLeft] = useState(() => secondsLeft(deadline, offset));
  useEffect(() => {
    setLeft(secondsLeft(deadline, offset));
    const t = setInterval(() => setLeft(secondsLeft(deadline, offset)), 250);
    return () => clearInterval(t);
  }, [deadline, offset]);
  return left;
}
```
`client/src/lib/api.js`:
```js
export async function upload(url, fields, blob, filename) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append('audio', blob, filename);
  try {
    const res = await fetch(url, { method: 'POST', body: form });
    return await res.json();
  } catch {
    return { ok: false, error: 'Upload failed — check your connection' };
  }
}
```
`client/src/lib/characters.js`:
```js
export const CHARACTERS = ['malePerson', 'femalePerson', 'maleAdventurer', 'femaleAdventurer', 'robot', 'zombie'];

export const pose = (character, name = 'idle') =>
  `/characters/${CHARACTERS[(character ?? 0) % CHARACTERS.length]}/${name}.png`;
```
`client/src/lib/audio.js`:
```js
import { useEffect, useState } from 'react';

let ctx = null;
export function audioCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

let current = null;
export function playUrl(url) {
  stopPlayback();
  current = new Audio(url);
  current.play().catch(() => {});
  return current;
}
export function stopPlayback() {
  if (current) current.pause();
  current = null;
}

function noise(c, seconds) {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  return src;
}

function envelope(c, peak, at, attack, release) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
  g.connect(c.destination);
  return g;
}

function burst(c, at, { freq, q = 1, type = 'bandpass', peak = 0.4, attack = 0.003, release = 0.08 }) {
  const src = noise(c, attack + release + 0.05);
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, at);
  filter.Q.value = q;
  src.connect(filter).connect(envelope(c, peak, at, attack, release));
  src.start(at);
  src.stop(at + attack + release + 0.05);
  return filter;
}

function tone(c, at, { type = 'sine', from, to = from, dur, peak = 0.25 }) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + dur);
  osc.connect(envelope(c, peak, at, 0.01, dur));
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

const withCtx = fn => () => {
  const c = audioCtx();
  fn(c, c.currentTime);
};

export const sfx = {
  '👏': withCtx((c, t) => {
    for (let i = 0; i < 3; i++) burst(c, t + i * 0.09, { freq: 1400 + Math.random() * 400, q: 1.2 });
  }),
  '😂': withCtx((c, t) => {
    [520, 470, 430, 400].forEach((f, i) => tone(c, t + i * 0.11, { type: 'triangle', from: f, to: f * 0.85, dur: 0.08 }));
  }),
  '🔥': withCtx((c, t) => {
    const f = burst(c, t, { freq: 400, q: 2, peak: 0.35, attack: 0.05, release: 0.45 });
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.45);
  }),
  '🍅': withCtx((c, t) => {
    burst(c, t, { freq: 600, type: 'lowpass', peak: 0.6, release: 0.22 });
    tone(c, t, { from: 160, to: 60, dur: 0.18, peak: 0.5 });
  }),
  cheer: withCtx((c, t) => {
    for (let i = 0; i < 40; i++) burst(c, t + Math.random() * 2, { freq: 1000 + Math.random() * 1500, peak: 0.15 + Math.random() * 0.15 });
    burst(c, t, { freq: 900, q: 0.7, peak: 0.12, attack: 0.4, release: 1.8 });
    [523, 659, 784].forEach((f, i) => tone(c, t + i * 0.12, { type: 'square', from: f, dur: 0.25, peak: 0.06 }));
  }),
  groan: withCtx((c, t) => {
    tone(c, t, { type: 'sawtooth', from: 220, to: 110, dur: 1.1, peak: 0.12 });
    tone(c, t + 0.05, { type: 'sawtooth', from: 165, to: 82, dur: 1.1, peak: 0.1 });
  }),
  pop: withCtx((c, t) => {
    tone(c, t, { from: 300, to: 900, dur: 0.15, peak: 0.3 });
  }),
};

let unlocked = false;
const listeners = new Set();

export function unlockAudio() {
  audioCtx();
  unlocked = true;
  listeners.forEach(fn => fn(true));
}

export function useAudioUnlocked() {
  const [value, setValue] = useState(unlocked);
  useEffect(() => {
    listeners.add(setValue);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}

export function useAudioUnlock() {
  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, []);
}
```

- [ ] **Step 3: Components, App, Home, Lobby**

`client/src/components/Avatar.jsx`:
```jsx
import { pose } from '../lib/characters.js';

export default function Avatar({ character, pose: poseName = 'idle', size = 64 }) {
  return <img className="avatar" src={pose(character, poseName)} width={size * 0.75} height={size} alt="" draggable={false} />;
}
```
`client/src/components/Header.jsx`:
```jsx
export default function Header({ state, me }) {
  const inRound = ['record', 'show', 'leaderboard'].includes(state.phase);
  return (
    <header className="topbar">
      <span className="brand">🎤 Voice Battle</span>
      {inRound && <span className="pill">Round {state.round}/{state.rounds}</span>}
      {me && <span className="pill me">{me.name} · {me.isHost ? 'Host' : me.role === 'member' ? 'Team' : 'Audience'}</span>}
    </header>
  );
}
```
`client/src/App.jsx`:
```jsx
import Header from './components/Header.jsx';
import { useAudioUnlock } from './lib/audio.js';
import { playerId } from './lib/socket.js';
import { useGame } from './lib/useGame.js';
import Final from './screens/Final.jsx';
import Home from './screens/Home.jsx';
import Leaderboard from './screens/Leaderboard.jsx';
import Lobby from './screens/Lobby.jsx';
import Record from './screens/Record.jsx';
import Show from './screens/Show.jsx';

const SCREENS = { lobby: Lobby, record: Record, show: Show, leaderboard: Leaderboard, final: Final };

function findMe(state) {
  const member = state.members.find(m => m.id === playerId);
  if (member) return { ...member, role: 'member', isHost: state.hostId === playerId };
  const fan = state.audience.find(a => a.id === playerId);
  return fan ? { ...fan, role: 'audience', isHost: false } : null;
}

export default function App() {
  const { state, offset } = useGame();
  useAudioUnlock();

  if (!state) {
    return (
      <main className="screen home">
        <h1 className="logo">Voice<br />Battle</h1>
        <p className="muted">Connecting…</p>
      </main>
    );
  }

  const me = findMe(state);
  let screen;
  if (state.phase === 'none') screen = <Home mode="create" />;
  else if (!me) screen = <Home mode={state.phase === 'lobby' ? 'join' : 'busy'} />;
  else {
    const Screen = SCREENS[state.phase];
    screen = <Screen state={state} me={me} offset={offset} />;
  }

  return (
    <div className="app">
      <Header state={state} me={me} />
      {screen}
    </div>
  );
}
```
`client/src/screens/Home.jsx`:
```jsx
import { useState } from 'react';
import { send } from '../lib/socket.js';

export default function Home({ mode }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function act(event, extra = {}) {
    setBusy(true);
    setError('');
    const result = await send(event, { name, ...extra });
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <main className="screen home">
      <h1 className="logo">Voice<br />Battle</h1>
      <p className="tagline">Hear the clip. Copy the voice. Let the crowd decide.</p>
      {mode === 'busy' && (
        <p className="notice">A game is in progress. If you're on the team, enter the same name to rejoin.</p>
      )}
      <form className="card form" onSubmit={e => { e.preventDefault(); if (mode === 'create') act('create'); }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={20} autoFocus />
        {mode === 'create' && <button className="btn primary big" disabled={busy}>Create Team</button>}
        {mode === 'join' && (
          <div className="row">
            <button type="button" className="btn primary" disabled={busy} onClick={() => act('join', { role: 'member' })}>Join the Team</button>
            <button type="button" className="btn" disabled={busy} onClick={() => act('join', { role: 'audience' })}>Join the Audience</button>
          </div>
        )}
        {mode === 'busy' && (
          <button type="button" className="btn primary" disabled={busy} onClick={() => act('join', { role: 'member' })}>Rejoin</button>
        )}
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}
```
`client/src/screens/Lobby.jsx`:
```jsx
import { useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import { upload } from '../lib/api.js';
import { playerId, send } from '../lib/socket.js';

export default function Lobby({ state, me }) {
  const [error, setError] = useState('');
  const run = async (event, payload) => {
    const result = await send(event, payload);
    setError(result.ok ? '' : result.error);
  };

  return (
    <main className="screen lobby">
      <section className="card">
        <h2>The Team <small>{state.members.length}/{state.config.maxMembers}</small></h2>
        <ul className="roster">
          {state.members.map(m => (
            <li key={m.id} className={m.connected ? '' : 'offline'}>
              <Avatar character={m.character} size={56} />
              <span>{m.name}</span>
              {m.id === state.hostId && <span className="tag">HOST</span>}
              {m.id === me.id && <span className="tag you">YOU</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Audience <small>{state.audience.length}</small></h2>
        {state.audience.length === 0
          ? <p className="muted">Nobody yet. Share this page's link so people can join as audience.</p>
          : <div className="chips">{state.audience.map(a => <span className="chip" key={a.id}>{a.name}</span>)}</div>}
      </section>

      {me.isHost
        ? <HostControls state={state} run={run} setError={setError} />
        : <section className="card"><p className="muted">Waiting for the host to start… {state.rounds} rounds · {state.clipCount} clips</p></section>}
      {error && <p className="error">{error}</p>}
    </main>
  );
}

function HostControls({ state, run, setError }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [uploading, setUploading] = useState(false);

  async function addClip() {
    if (!title.trim() || !file) return setError('Pick an audio file and give it a title');
    setUploading(true);
    const result = await upload('/api/clip', { playerId, title }, file, file.name);
    setUploading(false);
    if (!result.ok) return setError(result.error);
    setError('');
    setTitle('');
    setFile(null);
    setFileKey(k => k + 1);
  }

  return (
    <section className="card host">
      <h2>Host controls</h2>
      <div className="row">
        <span>Rounds</span>
        {[3, 4].map(n => (
          <button key={n} className={`btn small ${state.rounds === n ? 'primary' : ''}`} onClick={() => run('setRounds', { rounds: n })}>{n}</button>
        ))}
      </div>
      <div className="upload">
        <span>Add your own clip <small className="muted">({state.clipCount} clips in the pack, max 15 s)</small></span>
        <input value={title} placeholder="Clip title, e.g. Mogambo khush hua" maxLength={60} onChange={e => setTitle(e.target.value)} />
        <input key={fileKey} type="file" accept="audio/*" onChange={e => setFile(e.target.files[0] || null)} />
        <button className="btn small" disabled={uploading} onClick={addClip}>{uploading ? 'Uploading…' : 'Upload clip'}</button>
      </div>
      <button className="btn primary big" disabled={Boolean(state.startProblem)} onClick={() => run('start')}>Start the Battle</button>
      {state.startProblem && <p className="muted">{state.startProblem}</p>}
    </section>
  );
}
```
Create temporary placeholder screens so the app compiles: `Record.jsx`, `Show.jsx`, `Leaderboard.jsx`, `Final.jsx` each `export default function X() { return <main className="screen"><p>Coming soon</p></main>; }` (replaced in Tasks 7–9).

- [ ] **Step 4: `client/src/styles.css`** — full stylesheet:
```css
:root {
  --bg: #120a24; --card: #24164a; --line: #3a2a6e; --text: #f6f1ff; --muted: #a99cd0;
  --pink: #ff3d8b; --yellow: #ffd23f; --cyan: #3de1ff; --green: #4dff9a; --red: #ff5d5d;
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; }
body { background: radial-gradient(circle at 50% -20%, #3b1d7a 0%, var(--bg) 60%) fixed var(--bg); color: var(--text); font-family: 'Nunito', system-ui, sans-serif; }
h1, h2, h3, .logo, .brand, .title { font-family: 'Bungee', system-ui, sans-serif; letter-spacing: .5px; margin: 0 0 .5rem; }
.app { max-width: 1100px; margin: 0 auto; padding: 0 16px 40px; }
.topbar { display: flex; gap: .5rem; align-items: center; padding: 14px 0; flex-wrap: wrap; }
.brand { font-size: 1.1rem; margin-right: auto; color: var(--yellow); }
.pill { background: var(--card); border: 1px solid var(--line); padding: 4px 12px; border-radius: 999px; font-size: .85rem; font-weight: 800; }
.pill.me { color: var(--cyan); }
.screen { display: flex; flex-direction: column; gap: 16px; }
.center { text-align: center; align-items: center; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 18px; box-shadow: 0 8px 30px rgba(0,0,0,.25); }
.card h2 small { color: var(--muted); font-family: 'Nunito', sans-serif; font-size: .9rem; }
.muted { color: var(--muted); }
.error { color: var(--red); font-weight: 800; margin: .5rem 0 0; }
.notice { background: #3a2410; border: 1px solid #6b4416; padding: 10px 14px; border-radius: 12px; max-width: 440px; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.row.center { justify-content: center; }
input { background: #160d30; border: 1px solid var(--line); color: var(--text); border-radius: 12px; padding: 12px 14px; font: inherit; font-size: 1rem; width: 100%; }
input[type=range] { padding: 0; accent-color: var(--pink); }
input[type=file] { padding: 8px; }
.btn { appearance: none; border: 2px solid var(--line); background: #2e1d5e; color: var(--text); font: 800 1rem 'Nunito', sans-serif; padding: 12px 18px; border-radius: 14px; cursor: pointer; transition: transform .12s ease, background .2s; }
.btn:hover:not(:disabled) { transform: translateY(-1px); background: #3a2774; }
.btn:active:not(:disabled) { transform: translateY(1px) scale(.98); }
.btn:disabled { opacity: .45; cursor: not-allowed; }
.btn.primary { background: linear-gradient(135deg, var(--pink), #ff7a3d); border-color: transparent; }
.btn.small { padding: 6px 12px; font-size: .9rem; border-radius: 10px; }
.btn.big { font-size: 1.2rem; padding: 16px 24px; width: 100%; }

/* home */
.home { align-items: center; text-align: center; padding-top: 6vh; }
.logo { font-size: clamp(3rem, 12vw, 6rem); line-height: .9; background: linear-gradient(180deg, var(--yellow), var(--pink)); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 6px 0 #5a1d4a); }
.tagline { color: var(--muted); font-size: 1.1rem; }
.form { width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 12px; }
.form .row .btn { flex: 1; }

/* lobby */
.lobby { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); }
.roster { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.roster li { display: flex; align-items: center; gap: 12px; background: #1b1040; border-radius: 12px; padding: 6px 12px; font-weight: 800; }
.roster li.offline { opacity: .4; }
.tag { font-size: .7rem; background: var(--yellow); color: #241000; padding: 2px 8px; border-radius: 6px; }
.tag.you { background: var(--cyan); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { background: #1b1040; padding: 4px 10px; border-radius: 999px; }
.host { display: flex; flex-direction: column; gap: 14px; }
.upload { display: grid; gap: 8px; }

/* record */
.record-top { display: flex; justify-content: space-between; align-items: center; }
.countdown { font-family: 'Bungee', sans-serif; color: var(--yellow); font-size: 1.4rem; }
.recorder { display: flex; flex-direction: column; gap: 14px; align-items: center; text-align: center; max-width: 560px; margin: 0 auto; width: 100%; }
.label { margin: 0; color: var(--muted); text-transform: uppercase; font-weight: 900; font-size: .8rem; letter-spacing: 2px; }
.clip-title { font-size: clamp(1.4rem, 5vw, 2rem); color: var(--yellow); }
.btn.rec { background: #3b0d22; border-color: var(--red); font-size: 1.2rem; padding: 18px 28px; border-radius: 999px; }
.btn.rec.on { background: var(--red); animation: pulse 1s infinite; }
@keyframes pulse { 50% { box-shadow: 0 0 0 12px rgba(255,93,93,.15); } }
.takes { list-style: none; padding: 0; margin: 0; width: 100%; display: grid; gap: 8px; }
.takes li { display: flex; gap: 8px; align-items: center; background: #1b1040; padding: 8px 12px; border-radius: 12px; }
.takes li span { margin-right: auto; }

/* stage */
.stage-wrap { position: relative; }
.stage2d { position: relative; aspect-ratio: 16 / 9; border-radius: 18px; overflow: hidden; background: linear-gradient(#1a0b2e, #2a1450 55%); border: 2px solid var(--line); }
.floor { position: absolute; left: 0; right: 0; bottom: 0; height: 34%; background: repeating-linear-gradient(90deg, #7a4a26 0 60px, #6c4021 60px 120px); border-top: 6px solid #a0683a; }
.curtain { position: absolute; top: 0; bottom: 20%; width: 11%; background: repeating-linear-gradient(90deg, #a3122f 0 14px, #7c0c22 14px 28px); z-index: 6; }
.curtain.left { left: 0; border-radius: 0 0 40% 0; }
.curtain.right { right: 0; border-radius: 0 0 0 40%; }
.valance { position: absolute; top: 0; left: 0; right: 0; height: 9%; background: repeating-linear-gradient(90deg, #c0183a 0 30px, #9b1230 30px 60px); z-index: 7; box-shadow: 0 6px 12px rgba(0,0,0,.4); }
.spotlight { position: absolute; left: 47%; top: -10%; width: 40%; height: 110%; transform: translateX(-50%); background: radial-gradient(ellipse at 50% 100%, rgba(255,240,180,.45), transparent 60%); opacity: 0; transition: opacity .5s; pointer-events: none; z-index: 3; }
.spotlight.on { opacity: 1; }
.mic { position: absolute; left: 53%; bottom: 22%; height: 34%; transform: translateX(-50%); z-index: 4; }
.stage-char { position: absolute; bottom: 22%; height: 40%; transform: translateX(-50%); transition-property: left; transition-timing-function: linear; display: flex; flex-direction: column; align-items: center; }
.stage-char img { height: 100%; }
.stage-char.offline { opacity: .3; }
.nametag { position: absolute; bottom: -14%; white-space: nowrap; background: rgba(0,0,0,.6); padding: 1px 8px; border-radius: 8px; font-weight: 800; font-size: clamp(.6rem, 1.4vw, .85rem); }
.crowd { position: absolute; left: 0; right: 0; bottom: -2%; height: 20%; display: flex; justify-content: center; align-items: flex-end; z-index: 8; }
.fan { position: relative; width: clamp(18px, 4vw, 44px); height: 100%; margin: 0 -3px; animation: sway 2.4s ease-in-out infinite; }
.fan::before { content: ''; position: absolute; bottom: 45%; left: 50%; width: 55%; aspect-ratio: 1; transform: translateX(-50%); border-radius: 50%; background: hsl(var(--hue) 35% 22%); }
.fan::after { content: ''; position: absolute; bottom: 0; left: 50%; width: 100%; height: 50%; transform: translateX(-50%); border-radius: 50% 50% 0 0; background: hsl(var(--hue) 35% 16%); }
@keyframes sway { 50% { transform: translateY(-3px); } }
.crowd.jump .fan { animation: jump .5s ease-out; }
@keyframes jump { 40% { transform: translateY(-18px); } }
.caption { position: absolute; top: 12%; left: 50%; transform: translateX(-50%); background: rgba(10,4,24,.82); border: 1px solid var(--line); padding: 8px 18px; border-radius: 999px; font-weight: 800; white-space: nowrap; z-index: 9; font-size: clamp(.8rem, 2.2vw, 1.1rem); max-width: 92%; overflow: hidden; text-overflow: ellipsis; }
.score-pop { position: absolute; top: 22%; left: 50%; transform: translateX(-50%); z-index: 9; font-family: 'Bungee', sans-serif; font-size: clamp(3rem, 12vw, 7rem); color: var(--yellow); text-shadow: 0 6px 0 #5a1d4a; animation: pop .5s cubic-bezier(.2,1.6,.4,1); }
.score-pop small { font-size: .35em; color: var(--text); }
.score-pop.hot { color: var(--green); }
.score-pop.cold { color: var(--red); }
@keyframes pop { from { transform: translateX(-50%) scale(.2); opacity: 0; } }
.floaters { position: absolute; inset: 0; pointer-events: none; z-index: 10; overflow: hidden; }
.floater { position: absolute; bottom: 10%; font-size: clamp(1.8rem, 5vw, 3rem); animation: float 2.2s ease-out forwards; display: flex; flex-direction: column; align-items: center; }
.floater small { font-size: .7rem; font-weight: 800; background: rgba(0,0,0,.5); padding: 0 6px; border-radius: 6px; }
@keyframes float { to { transform: translateY(-260%) rotate(12deg); opacity: 0; } }
.unlock { position: absolute; inset: 0; z-index: 20; background: rgba(10,4,24,.75); color: var(--text); border: 0; font: 900 1.4rem 'Nunito', sans-serif; cursor: pointer; border-radius: 18px; }
.vote-panel { display: flex; flex-direction: column; gap: 12px; text-align: center; }
.slider-row { display: flex; gap: 12px; align-items: center; }
.big-num { font-family: 'Bungee', sans-serif; font-size: 2rem; min-width: 3ch; color: var(--yellow); }
.emoji-row { display: flex; justify-content: center; gap: 10px; }
.emoji-btn { font-size: 2rem; background: #1b1040; border: 2px solid var(--line); border-radius: 16px; padding: 6px 14px; cursor: pointer; transition: transform .1s; }
.emoji-btn:active { transform: scale(.88); }

/* leaderboard */
.title { text-align: center; font-size: clamp(1.6rem, 6vw, 2.6rem); color: var(--yellow); }
.board { list-style: none; padding: 0; margin: 0 auto; max-width: 720px; width: 100%; display: grid; gap: 10px; }
.board li { display: grid; grid-template-columns: 2rem 40px 1fr 2fr 3rem 3.5rem; gap: 10px; align-items: center; background: var(--card); padding: 8px 14px; border-radius: 14px; border: 1px solid var(--line); animation: slidein .4s both; }
.rank { font-family: 'Bungee', sans-serif; color: var(--yellow); }
.name { font-weight: 900; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar { height: 12px; background: #160d30; border-radius: 6px; overflow: hidden; }
.bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--cyan), var(--pink)); transition: width .8s; }
.pts { color: var(--green); font-weight: 900; }
.total { font-family: 'Bungee', sans-serif; text-align: right; }
@keyframes slidein { from { transform: translateX(-20px); opacity: 0; } }
@media (max-width: 560px) {
  .board li { grid-template-columns: 1.5rem 32px 1fr 2.5rem 3rem; }
  .bar { display: none; }
}

/* final */
.podium { display: flex; justify-content: center; align-items: flex-end; gap: 12px; }
.step { display: flex; flex-direction: column; align-items: center; gap: 4px; width: min(30%, 180px); text-align: center; }
.step .block { width: 100%; display: grid; place-items: center; font-family: 'Bungee', sans-serif; font-size: 2rem; border-radius: 12px 12px 0 0; background: linear-gradient(#3a2774, #24164a); }
.place-1 .block { height: 140px; background: linear-gradient(var(--yellow), #c99a10); color: #3a2500; }
.place-2 .block { height: 100px; }
.place-3 .block { height: 70px; }
.scores { width: 100%; border-collapse: collapse; }
.scores th, .scores td { padding: 8px; text-align: center; border-bottom: 1px solid var(--line); }
.scores th:first-child, .scores td:first-child { text-align: left; }
.table-wrap { overflow-x: auto; }
.awards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 12px; }
.award { display: flex; flex-direction: column; gap: 4px; text-align: center; }
.award h3 { font-size: 1rem; color: var(--cyan); }
.award b { font-size: 1.3rem; }
.avatar { object-fit: contain; }
@media (prefers-reduced-motion: reduce) {
  .fan, .floater, .score-pop, .board li { animation: none !important; }
}
```

- [ ] **Step 5: Verify** — `npm run dev` from root; open http://localhost:5173 in 3 tabs: tab1 Create Team, tab2 Join the Team, tab3 Join the Audience. Expect: lobby lists 2 members with avatars + HOST/YOU tags, audience chip, host sees rounds toggle and Start enabled; a 4th tab on Home sees join options; a second "Create Team" is impossible (Home shows join mode). `npm run build` succeeds.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat: client scaffold, home and lobby"`

---

### Task 7: Record screen

**Files:** Create `client/src/lib/recorder.js`; replace `client/src/screens/Record.jsx`.

**Interfaces:** `useRecorder(maxSeconds) → { recording, start(): Promise<{blob,url,duration}>, stop() }`.

- [ ] **Step 1: `client/src/lib/recorder.js`**
```js
import { useRef, useState } from 'react';

export function useRecorder(maxSeconds) {
  const [recording, setRecording] = useState(false);
  const active = useRef(null);

  function stop() {
    const r = active.current;
    if (!r) return;
    active.current = null;
    clearTimeout(r.timeout);
    if (r.recorder.state !== 'inactive') r.recorder.stop();
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    const startedAt = performance.now();
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(resolve => {
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        resolve({ blob, url: URL.createObjectURL(blob), duration: (performance.now() - startedAt) / 1000 });
      };
    });
    recorder.start();
    active.current = { recorder, timeout: setTimeout(stop, maxSeconds * 1000) };
    setRecording(true);
    return done;
  }

  return { recording, start, stop };
}
```
- [ ] **Step 2: `client/src/screens/Record.jsx`**
```jsx
import { useState } from 'react';
import { upload } from '../lib/api.js';
import { playUrl } from '../lib/audio.js';
import { useRecorder } from '../lib/recorder.js';
import { playerId } from '../lib/socket.js';
import { useSecondsLeft } from '../lib/time.js';

function micError(err) {
  if (!window.isSecureContext) return 'The microphone only works on https (or localhost).';
  if (err?.name === 'NotAllowedError') return 'Microphone permission was blocked. Allow it in your browser and try again.';
  if (err?.name === 'NotSupportedError') return 'This browser cannot record audio.';
  return 'Could not start the microphone.';
}

function extensionFor(type) {
  if (type.includes('mp4')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  return 'webm';
}

export default function Record({ state, me, offset }) {
  const left = useSecondsLeft(state.deadline, offset);
  const withClip = state.members.filter(m => m.clip);
  const submitted = withClip.filter(m => m.submitted).length;

  let body;
  if (me.role === 'audience') {
    body = <div className="card center"><h2>🎙️ Players are recording…</h2><p>{submitted}/{withClip.length} submitted. Get ready to vote!</p></div>;
  } else if (!me.clip) {
    body = <div className="card center"><h2>Sitting this round out</h2><p>You'll get a clip next round.</p></div>;
  } else if (me.submitted) {
    body = <div className="card center"><h2>Submitted ✓</h2><p>Waiting for the others… {submitted}/{withClip.length}</p></div>;
  } else {
    body = <Recorder clip={me.clip} maxTakes={state.config.maxTakes} maxSeconds={state.config.maxRecordingSeconds} />;
  }

  return (
    <main className="screen record">
      <div className="record-top">
        <h2>Recording time</h2>
        <span className="countdown">{left}s</span>
      </div>
      {body}
    </main>
  );
}

function Recorder({ clip, maxTakes, maxSeconds }) {
  const { recording, start, stop } = useRecorder(maxSeconds);
  const [takes, setTakes] = useState([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function record() {
    setError('');
    try {
      const take = await start();
      setTakes(t => [...t, take]);
    } catch (err) {
      setError(micError(err));
    }
  }

  async function submit(take) {
    setSending(true);
    const result = await upload('/api/recording', { playerId, duration: take.duration.toFixed(2) }, take.blob, `take.${extensionFor(take.blob.type)}`);
    setSending(false);
    if (!result.ok) setError(result.error);
  }

  const outOfTakes = takes.length >= maxTakes;
  return (
    <div className="card recorder">
      <p className="label">Your clip</p>
      <h2 className="clip-title">“{clip.title}”</h2>
      <button className="btn" onClick={() => playUrl(clip.url)}>▶ Play original</button>
      {recording
        ? <button className="btn rec on" onClick={stop}>■ Stop</button>
        : <button className="btn rec" disabled={outOfTakes} onClick={record}>● {outOfTakes ? 'No takes left' : `Record take ${takes.length + 1}/${maxTakes}`}</button>}
      <p className="muted">Up to {maxSeconds}s per take. Pick your best one and submit it.</p>
      <ul className="takes">
        {takes.map((take, i) => (
          <li key={take.url}>
            <span>Take {i + 1} · {take.duration.toFixed(1)}s</span>
            <button className="btn small" onClick={() => playUrl(take.url)}>▶</button>
            <button className="btn small primary" disabled={sending} onClick={() => submit(take)}>Submit</button>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```
- [ ] **Step 3: Verify** — 3 tabs on localhost, start the game: members see their clip, Play original plays, recording up to 3 takes works, Submit flips to "Submitted ✓"; audience sees progress; when both submit, phase moves to show. Deny mic permission in one tab → readable error.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: record screen"`

---

### Task 8: Show screen with 2D stage, voting, reactions

**Files:** Create `client/src/stage/Stage2D.jsx`; replace `client/src/screens/Show.jsx`.

**Interfaces:** `<Stage2D members performerId step score audienceCount hype walkSeconds />` — the swap point for the 3D stage later.

- [ ] **Step 1: `client/src/stage/Stage2D.jsx`**
```jsx
import { useEffect, useState } from 'react';
import { pose } from '../lib/characters.js';

const AT_MIC = new Set(['walkIn', 'perform', 'vote', 'reveal']);
const MIC_SPOT = 45;
const SLOTS = [18, 84, 26, 76, 34, 68];
const slotX = i => SLOTS[i % SLOTS.length];

function useFrame(count, ms) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (count <= 1) return undefined;
    const t = setInterval(() => setFrame(f => (f + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms]);
  return frame;
}

function poseFor(active, step, score, frame) {
  if (!active) return 'idle';
  if (step === 'walkIn' || step === 'walkOut') return `walk${frame}`;
  if (step === 'perform') return frame === 0 ? 'talk' : 'idle';
  if (step === 'vote') return 'think';
  if (step === 'reveal') {
    if (score >= 70) return `cheer${frame}`;
    if (score < 40) return 'hurt';
  }
  return 'idle';
}

function frameCount(active, step, score) {
  if (!active) return 1;
  if (step === 'walkIn' || step === 'walkOut') return 8;
  if (step === 'perform') return 2;
  if (step === 'reveal' && score >= 70) return 2;
  return 1;
}

function StageCharacter({ member, slot, active, step, score, walkSeconds }) {
  const walking = active && (step === 'walkIn' || step === 'walkOut');
  const frame = useFrame(frameCount(active, step, score), walking ? 90 : 200);
  const atMic = active && AT_MIC.has(step);
  return (
    <div
      className={`stage-char ${member.connected ? '' : 'offline'}`}
      style={{ left: `${atMic ? MIC_SPOT : slotX(slot)}%`, transitionDuration: `${walkSeconds}s`, zIndex: active ? 5 : 2 }}
    >
      <img
        src={pose(member.character, poseFor(active, step, score, frame))}
        alt={member.name}
        draggable={false}
        style={{ transform: active && step === 'walkOut' ? 'scaleX(-1)' : undefined }}
      />
      <span className="nametag">{member.name}</span>
    </div>
  );
}

function Mic() {
  return (
    <svg className="mic" viewBox="0 0 40 160" aria-hidden="true">
      <rect x="18" y="30" width="4" height="120" fill="#555" />
      <rect x="6" y="148" width="28" height="7" rx="3" fill="#333" />
      <rect x="11" y="2" width="18" height="32" rx="9" fill="#9a9a9a" />
      <rect x="13" y="6" width="6" height="22" rx="3" fill="#d8d8d8" opacity=".6" />
    </svg>
  );
}

function Crowd({ count, hype }) {
  const [jumping, setJumping] = useState(false);
  useEffect(() => {
    if (!hype) return undefined;
    setJumping(true);
    const t = setTimeout(() => setJumping(false), 600);
    return () => clearTimeout(t);
  }, [hype]);
  return (
    <div className={`crowd ${jumping ? 'jump' : ''}`}>
      {Array.from({ length: Math.min(count, 24) }, (_, i) => (
        <div key={i} className="fan" style={{ '--hue': (i * 47) % 360, animationDelay: `${(i % 5) * 0.07}s` }} />
      ))}
    </div>
  );
}

export default function Stage2D({ members, performerId, step, score, audienceCount, hype, walkSeconds }) {
  return (
    <div className="stage2d">
      <div className="curtain left" />
      <div className="curtain right" />
      <div className="valance" />
      <div className={`spotlight ${AT_MIC.has(step) ? 'on' : ''}`} />
      <div className="floor" />
      <Mic />
      {members.map((m, i) => (
        <StageCharacter key={m.id} member={m} slot={i} active={m.id === performerId} step={step} score={score} walkSeconds={walkSeconds} />
      ))}
      <Crowd count={audienceCount} hype={hype} />
    </div>
  );
}
```
Lineup slots alternate left/right of the mic (53%) so the mic spot (45%) stays clear with 6 members.

- [ ] **Step 2: `client/src/screens/Show.jsx`**
```jsx
import { useEffect, useRef, useState } from 'react';
import { playUrl, sfx, stopPlayback, unlockAudio, useAudioUnlocked } from '../lib/audio.js';
import { send, socket } from '../lib/socket.js';
import { useSecondsLeft } from '../lib/time.js';
import Stage2D from '../stage/Stage2D.jsx';

const EMOJIS = ['👏', '😂', '🔥', '🍅'];

function useStageAudio(show) {
  const key = show ? `${show.performerId}:${show.step}` : '';
  useEffect(() => {
    if (!show) return;
    if (show.step === 'original') playUrl(show.clip.url);
    if (show.step === 'perform') playUrl(show.recordingUrl);
    if (show.step === 'reveal') {
      if (show.score >= 70) sfx.cheer();
      else if (show.score < 40) sfx.groan();
      else sfx.pop();
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stopPlayback, []);
}

function useReactions() {
  const [floaters, setFloaters] = useState([]);
  const [hype, setHype] = useState(0);
  useEffect(() => {
    const onReaction = ({ emoji, from }) => {
      const id = `${Date.now()}-${Math.random()}`;
      setFloaters(f => [...f.slice(-30), { id, emoji, from, x: 10 + Math.random() * 80 }]);
      setHype(Date.now());
      sfx[emoji]?.();
      setTimeout(() => setFloaters(f => f.filter(x => x.id !== id)), 2200);
    };
    socket.on('reaction', onReaction);
    return () => socket.off('reaction', onReaction);
  }, []);
  return { floaters, hype };
}

function Caption({ show, performer, left }) {
  const name = performer?.name ?? '';
  const texts = {
    original: <>🎬 Original: <b>“{show.clip.title}”</b></>,
    walkIn: <>Up next: <b>{name}</b></>,
    perform: <>🎤 <b>{name}</b> is performing…</>,
    vote: <>🗳️ Vote now! <b>{left}s</b> · {show.votes} vote{show.votes === 1 ? '' : 's'}</>,
  };
  const scored = (show.step === 'reveal' || show.step === 'walkOut') && show.score !== null;
  return (
    <>
      {texts[show.step] && <div className="caption">{texts[show.step]}</div>}
      {scored && (
        <div className={`score-pop ${show.score >= 70 ? 'hot' : show.score < 40 ? 'cold' : ''}`}>
          {show.score}<small>/100</small>
        </div>
      )}
    </>
  );
}

function VotePanel({ open, performer }) {
  const [value, setValue] = useState(50);
  const [sent, setSent] = useState(null);
  const lastReact = useRef(0);

  async function submit() {
    const result = await send('vote', { value });
    if (result.ok) setSent(value);
  }
  function react(emoji) {
    if (Date.now() - lastReact.current < 250) return;
    lastReact.current = Date.now();
    send('react', { emoji });
  }

  if (!open) {
    return (
      <section className="card vote-panel">
        <p className="muted">{sent !== null ? `You gave ${performer?.name} ${sent}/100` : 'Voting opens after the performance'}</p>
      </section>
    );
  }
  return (
    <section className="card vote-panel">
      <p>How close was <b>{performer?.name}</b> to the original?</p>
      <div className="slider-row">
        <input type="range" min="0" max="100" value={value} onChange={e => setValue(Number(e.target.value))} aria-label="Score" />
        <span className="big-num">{value}</span>
      </div>
      <button className="btn primary" onClick={submit}>{sent === null ? 'Lock in vote' : `Update vote (sent ${sent})`}</button>
      <div className="emoji-row">
        {EMOJIS.map(e => <button key={e} className="emoji-btn" onClick={() => react(e)}>{e}</button>)}
      </div>
    </section>
  );
}

export default function Show({ state, me, offset }) {
  const show = state.show;
  const unlocked = useAudioUnlocked();
  const left = useSecondsLeft(state.deadline, offset);
  const { floaters, hype } = useReactions();
  useStageAudio(show);

  if (!show) return <main className="screen center"><p className="muted">Setting the stage…</p></main>;
  const performer = state.members.find(m => m.id === show.performerId);

  return (
    <main className="screen show">
      <p className="muted center">Performer {show.index + 1} of {show.count}</p>
      <div className="stage-wrap">
        <Stage2D
          members={state.members}
          performerId={show.performerId}
          step={show.step}
          score={show.score}
          audienceCount={state.audience.length}
          hype={hype}
          walkSeconds={state.config.walkSeconds}
        />
        <Caption show={show} performer={performer} left={left} />
        <div className="floaters">
          {floaters.map(f => (
            <span key={f.id} className="floater" style={{ left: `${f.x}%` }}>{f.emoji}<small>{f.from}</small></span>
          ))}
        </div>
        {!unlocked && <button className="unlock" onClick={unlockAudio}>🔊 Tap to enter the stage</button>}
      </div>
      {me.role === 'audience' && (
        <VotePanel key={`${state.round}-${show.performerId}`} open={show.step === 'vote'} performer={performer} />
      )}
    </main>
  );
}
```
- [ ] **Step 3: Verify** — full round in 3 tabs: original plays with caption, character walks to mic, recording plays with talk animation, audience slider + emoji buttons appear for 10 s, emojis float on all tabs with sounds and the crowd jumps, score pops with cheer/groan, character walks back facing left. Reload the audience tab mid-show → "Tap to enter the stage" overlay, then audio resumes on next step.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat: 2D stage show with live voting and reactions"`

---

### Task 9: Leaderboard, Final scorecard, README

**Files:** Replace `client/src/screens/Leaderboard.jsx`, `client/src/screens/Final.jsx`; create `README.md`.

- [ ] **Step 1: `client/src/screens/Leaderboard.jsx`**
```jsx
import Avatar from '../components/Avatar.jsx';
import { useSecondsLeft } from '../lib/time.js';

export default function Leaderboard({ state, offset }) {
  const left = useSecondsLeft(state.deadline, offset);
  const ranked = [...state.members].sort((a, b) => b.total - a.total);
  const top = Math.max(1, ...ranked.map(m => m.total));
  const last = state.round >= state.rounds;
  return (
    <main className="screen leaderboard">
      <h1 className="title">Round {state.round} done!</h1>
      <ol className="board">
        {ranked.map((m, i) => (
          <li key={m.id} style={{ animationDelay: `${i * 80}ms` }}>
            <span className="rank">{i + 1}</span>
            <Avatar character={m.character} size={48} />
            <span className="name">{m.name}</span>
            <span className="bar"><i style={{ width: `${(m.total / top) * 100}%` }} /></span>
            <span className="pts">+{m.scores[state.round - 1] ?? 0}</span>
            <span className="total">{m.total}</span>
          </li>
        ))}
      </ol>
      <p className="muted center">{last ? 'Final results' : `Round ${state.round + 1}`} in {left}s…</p>
    </main>
  );
}
```
- [ ] **Step 2: `client/src/screens/Final.jsx`**
```jsx
import confetti from 'canvas-confetti';
import { useEffect, useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import { sfx } from '../lib/audio.js';
import { send } from '../lib/socket.js';

const AWARDS = [
  ['crowdFavourite', '💖 Crowd Favourite', v => `${v} reaction${v === 1 ? '' : 's'}`],
  ['closestMatch', '🎯 Closest Match', v => `${v}/100 in one round`],
  ['consistentPerformer', '📏 Consistent Performer', v => `only ${v} pts between rounds`],
];

export default function Final({ state, me }) {
  const [error, setError] = useState('');
  const ranked = [...state.members].sort((a, b) => b.total - a.total);
  const podium = [[ranked[1], 2], [ranked[0], 1], [ranked[2], 3]];

  useEffect(() => {
    sfx.cheer();
    const end = Date.now() + 3000;
    const t = setInterval(() => {
      if (Date.now() > end) return clearInterval(t);
      confetti({ particleCount: 40, spread: 70, origin: { x: Math.random(), y: 0.3 } });
    }, 250);
    return () => clearInterval(t);
  }, []);

  const run = async event => {
    const result = await send(event);
    setError(result.ok ? '' : result.error);
  };

  return (
    <main className="screen final">
      <h1 className="title">🏆 Final Scorecard</h1>
      <div className="podium">
        {podium.map(([m, place]) => m && (
          <div key={m.id} className={`step place-${place}`}>
            <Avatar character={m.character} pose={place === 1 ? 'cheer0' : 'idle'} size={place === 1 ? 110 : 84} />
            <b>{m.name}</b>
            <span>{m.total} pts</span>
            <div className="block">{place}</div>
          </div>
        ))}
      </div>
      <section className="card table-wrap">
        <table className="scores">
          <thead>
            <tr><th>Player</th>{Array.from({ length: state.rounds }, (_, i) => <th key={i}>R{i + 1}</th>)}<th>Total</th></tr>
          </thead>
          <tbody>
            {ranked.map(m => (
              <tr key={m.id}>
                <td>{m.name}</td>
                {Array.from({ length: state.rounds }, (_, i) => <td key={i}>{m.scores[i] ?? 0}</td>)}
                <td><b>{m.total}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="awards">
        {AWARDS.map(([key, label, describe]) => {
          const award = state.awards?.[key];
          return (
            <div className="card award" key={key}>
              <h3>{label}</h3>
              {award ? <><b>{award.name}</b><small className="muted">{describe(award.value)}</small></> : <small className="muted">No winner this time</small>}
            </div>
          );
        })}
      </section>
      {me.isHost
        ? <div className="row center"><button className="btn primary" onClick={() => run('playAgain')}>Play Again</button><button className="btn" onClick={() => run('end')}>End Game</button></div>
        : <p className="muted center">Waiting for the host…</p>}
      {error && <p className="error center">{error}</p>}
    </main>
  );
}
```
- [ ] **Step 3: `README.md`**
```markdown
# Voice Battle

Online party game: team members imitate meme clips, characters perform them on stage, the audience votes.

## Run locally
    npm run setup      # installs root, server and client deps
    npm run dev        # server :3001 + client :5173
Open http://localhost:5173 in several tabs (each tab is its own player): one creates the team,
others join as team members or audience.

Microphone recording needs https or localhost — to play with friends over the internet, deploy
(`npm run build && npm start` serves the built client from the server on $PORT) behind https,
e.g. Render or Railway.

## Tests
    npm test                                     # game rules (Vitest)
    TIME_SCALE=0.05 npm start   # then, in another terminal:
    npm --prefix server run smoke                # full 3-round game end to end

## Assets
- Characters: Kenney Toon Characters (CC0) — `client/public/characters`.
- Clips: meme / movie dialogue clips in `server/clips` for private play only. Replace with
  royalty-free or self-recorded clips before any public release. Regenerate with
  `node scripts/fetch-assets.mjs` (needs ffmpeg).
```
- [ ] **Step 4: Verify** — `npm test` passes; smoke passes; full manual 3-round game in 3 tabs reaches the final with podium, per-round table, awards, confetti; Play Again returns to lobby with zero scores; End returns everyone to Home with Create Team available; `npm run build && npm start` serves the app on :3001.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: leaderboard, final scorecard, README"`
