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
  const homeX = slotX(slot);
  // Face the direction of travel: toward the mic on the way in, home on the way out.
  const movingLeft = walking && (step === 'walkIn' ? homeX > MIC_SPOT : homeX < MIC_SPOT);
  return (
    <div
      className={`stage-char ${member.connected ? '' : 'offline'}`}
      style={{ left: `${atMic ? MIC_SPOT : homeX}%`, transitionDuration: `${walkSeconds}s`, zIndex: active ? 5 : 2 }}
    >
      <img
        src={pose(member.character, poseFor(active, step, score, frame))}
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
