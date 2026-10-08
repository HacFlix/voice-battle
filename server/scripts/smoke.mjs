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
