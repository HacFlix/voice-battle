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
  finalSeconds: 20,
  padSeconds: 0.5,
  timeScale: 1,
};

export const EMOJIS = ['👏', '😂', '🔥', '🍅'];
export const STEPS = ['original', 'walkIn', 'perform', 'vote', 'reveal', 'walkOut'];

const ok = () => ({ ok: true });
const fail = error => ({ ok: false, error });

function cleanName(raw, max = 20) {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  return name.length >= 1 && name.length <= max ? name : null;
}

export class Game {
  constructor({ clips = [], config = {}, rng = Math.random, onChange = () => {}, onEvent = () => {} } = {}) {
    this.baseClips = clips;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rng = rng;
    this.onChange = onChange;
    this.onEvent = onEvent;
    this.timer = null;
    // Clips already used, kept across games so nothing repeats until the whole pack has played.
    this.playedClipIds = new Set();
    this.reset(false);
  }

  reset(notify = true) {
    clearTimeout(this.timer);
    this.timer = null;
    this.phase = 'none';
    this.teamName = null;
    this.players = [];
    this.hostId = null;
    this.rounds = 3;
    this.round = 0;
    this.roundClip = null;
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

  // The host moderates. While they are away, the first connected teammate stands in.
  actingHostId() {
    const host = this.player(this.hostId);
    if (host?.connected) return host.id;
    return this.connectedMembers()[0]?.id ?? null;
  }

  isHost(id) {
    return id === this.actingHostId();
  }

  // Players the game cannot continue without: the host and the team.
  anyoneRunningTheGame() {
    return this.players.some(p => p.connected && p.role !== 'audience');
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
    const p = { id, name, role, connected: true, character, scores: [], reactions: 0, clip: null, recording: null, recordingNow: false };
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

  createTeam(id, rawName, rawTeamName) {
    if (this.phase !== 'none') return fail('A game already exists');
    const name = cleanName(rawName);
    if (!name) return fail('Enter your name (1-20 characters)');
    this.teamName = cleanName(rawTeamName, 30) ?? `${name}'s Team`;
    this.addPlayer(id, name, 'host');
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
      if (same.connected) return fail(`Someone in this game is already called "${same.name}" — pick another name`);
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
    if (!this.anyoneRunningTheGame()) {
      this.reset();
      return;
    }
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
    this.players = this.players.filter(p => p.connected || p.id === this.hostId);
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
    // One clip per round, shared by every member.
    this.roundClip = this.nextClip();
    for (const m of this.members()) {
      m.clip = m.connected ? this.roundClip : null;
      m.recording = null;
      m.recordingNow = false;
    }
    this.later(this.config.recordSeconds, () => this.beginShow());
    this.changed();
  }

  // Rounds alternate Hindi and English (round 1's language is random each game).
  // Within a language, pick a random clip nobody has played yet; once that language's
  // clips are all used, start a new cycle for it. Clips without a language (uploads) fit either.
  nextClip() {
    const langs = ['hi', 'en'];
    if (this.round === 1) this.firstLang = langs[Math.floor(this.rng() * langs.length)];
    const lang = this.round % 2 === 1 ? this.firstLang : langs.find(l => l !== this.firstLang);
    let pool = this.clips.filter(c => !c.lang || c.lang === lang);
    if (pool.length === 0) pool = this.clips;
    let fresh = pool.filter(c => !this.playedClipIds.has(c.id));
    if (fresh.length === 0) {
      for (const c of pool) this.playedClipIds.delete(c.id);
      fresh = pool.filter(c => c.id !== this.roundClip?.id);
      if (fresh.length === 0) fresh = pool;
    }
    const clip = fresh[Math.floor(this.rng() * fresh.length)];
    this.playedClipIds.add(clip.id);
    return clip;
  }

  setRecording(id, on) {
    const p = this.player(id);
    if (this.phase !== 'record' || !p || p.role !== 'member' || !p.clip || p.recording) return fail('Not recording right now');
    p.recordingNow = Boolean(on);
    return this.changed();
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
    p.recordingNow = false;
    if (this.allSubmitted()) {
      this.beginShow();
      return ok();
    }
    return this.changed();
  }

  beginShow() {
    const order = this.members().filter(m => m.recording).map(m => m.id);
    this.phase = 'show';
    this.show = { order, index: -1, step: null, votes: {}, score: null, originalPlayed: false };
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
    // The original plays once, before the first performer.
    this.runStep(s.originalPlayed ? 'walkIn' : 'original');
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
    if (step === 'original') this.show.originalPlayed = true;
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
    if (!['record', 'show', 'leaderboard'].includes(this.phase)) return fail('Reactions are closed');
    if (!EMOJIS.includes(emoji)) return fail('Unknown reaction');
    // Only reactions aimed at someone at the mic count toward Crowd Favourite.
    if (this.phase === 'show' && this.show.step !== 'original') this.performer().reactions += 1;
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
    this.phase = 'final';
    this.awards = computeAwards(this.members());
    this.later(this.config.finalSeconds, () => this.backToLobby());
    this.changed();
  }

  // After the final scorecard the same people go back to the lobby for another game.
  backToLobby() {
    clearTimeout(this.timer);
    this.timer = null;
    this.players = this.players.filter(p => p.connected || p.id === this.hostId);
    for (const m of this.members()) {
      m.scores = [];
      m.reactions = 0;
      m.clip = null;
      m.recording = null;
    }
    this.round = 0;
    this.roundClip = null;
    this.awards = null;
    this.deadline = null;
    this.phase = 'lobby';
    this.onEvent('clearRecordings');
    this.changed();
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
    const host = this.player(this.hostId);
    return {
      phase: this.phase,
      teamName: this.teamName,
      hostId: this.hostId,
      actingHostId: this.actingHostId(),
      host: host ? { id: host.id, name: host.name, connected: host.connected } : null,
      rounds: this.rounds,
      round: this.round,
      roundClip: this.roundClip,
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
        recordingUrl: m.recording?.url ?? null,
        recordingNow: m.recordingNow,
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
