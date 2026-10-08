import { useEffect, useState } from 'react';
import { pose } from '../lib/characters.js';

const AT_MIC = new Set(['walkIn', 'perform', 'vote', 'reveal']);
const MIC_SPOT = 45;
const SLOTS = [18, 84, 26, 76, 34, 68];
const slotX = i => SLOTS[i % SLOTS.length];
const FRAMES = { walk: 8, talk: 2, cheer: 2 };
const CROWD_SIZE = 30;
const EMPTY = new Set();

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

// What a character is doing right now: walk / talk / think / cheer / hurt / idle.
function modeFor(member, { performerId, step, score, talking, cheering }) {
  if (member.id === performerId && step) {
    if (step === 'walkIn' || step === 'walkOut') return 'walk';
    if (step === 'perform') return 'talk';
    if (step === 'vote') return 'think';
    if (step === 'reveal') return score >= 70 ? 'cheer' : score < 40 ? 'hurt' : 'idle';
    return 'idle';
  }
  if (talking.has(member.id)) return 'talk';
  if (cheering.has(member.id)) return 'cheer';
  return 'idle';
}

function poseName(mode, frame) {
  if (mode === 'walk') return `walk${frame}`;
  if (mode === 'talk') return frame === 0 ? 'talk' : 'idle';
  if (mode === 'cheer') return `cheer${frame}`;
  return mode;
}

function StageCharacter({ member, slot, mode, atMic, step, badge, walkSeconds }) {
  const frame = useFrame(FRAMES[mode] ?? 1, mode === 'walk' ? 90 : 220);
  const homeX = slotX(slot);
  // Face the direction of travel: toward the mic on the way in, home on the way out.
  const movingLeft = mode === 'walk' && (step === 'walkIn' ? homeX > MIC_SPOT : homeX < MIC_SPOT);
  return (
    <div
      className={`stage-char ${member.connected ? '' : 'offline'} ${atMic ? 'at-mic' : ''}`}
      style={{ left: `${atMic ? MIC_SPOT : homeX}%`, transitionDuration: `${walkSeconds}s` }}
    >
      {badge && <span className="badge">{badge}</span>}
      <img
        src={pose(member.character, poseName(mode, frame))}
        alt={member.name}
        draggable={false}
        style={{ transform: movingLeft ? 'scaleX(-1)' : undefined }}
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

function Crowd({ audienceCount, hype, partying }) {
  const [jumping, setJumping] = useState(false);
  useEffect(() => {
    if (!hype) return undefined;
    setJumping(true);
    const t = setTimeout(() => setJumping(false), 650);
    return () => clearTimeout(t);
  }, [hype]);
  // A full house for atmosphere; the real audience members are the lit-up fans.
  return (
    <div className={`crowd ${jumping || partying ? 'jump' : ''} ${partying ? 'party' : ''}`}>
      {Array.from({ length: CROWD_SIZE }, (_, i) => {
        const seat = (i * 7) % CROWD_SIZE;
        return (
          <div
            key={i}
            className={`fan ${seat < audienceCount ? 'real' : ''}`}
            style={{ '--hue': (i * 47) % 360, animationDelay: `${(i % 6) * 0.06}s` }}
          />
        );
      })}
    </div>
  );
}

export default function Stage2D({
  members = [],
  performerId = null,
  step = null,
  score = null,
  talking = EMPTY,
  cheering = EMPTY,
  badges = {},
  audienceCount = 0,
  hype = 0,
  partying = false,
  walkSeconds = 1.5,
}) {
  const spotlight = performerId && AT_MIC.has(step);
  return (
    <div className="stage2d" aria-hidden="true">
      <div className="backwall" />
      <div className="floor" />
      <div className="curtain left" />
      <div className="curtain right" />
      <div className="valance" />
      <div className="stage-area">
        <div className={`spotlight ${spotlight ? 'on' : ''}`} />
        <Mic />
        {members.map((m, i) => (
          <StageCharacter
            key={m.id}
            member={m}
            slot={i}
            mode={modeFor(m, { performerId, step, score, talking, cheering })}
            atMic={m.id === performerId && AT_MIC.has(step)}
            step={step}
            badge={badges[m.id]}
            walkSeconds={walkSeconds}
          />
        ))}
      </div>
      <Crowd audienceCount={audienceCount} hype={hype} partying={partying} />
    </div>
  );
}
