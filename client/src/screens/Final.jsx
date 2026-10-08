import confetti from 'canvas-confetti';
import { useEffect } from 'react';
import Avatar from '../components/Avatar.jsx';
import { sfx } from '../lib/audio.js';
import { useSecondsLeft } from '../lib/time.js';

const AWARDS = [
  ['crowdFavourite', '💖 Crowd Favourite', v => `${v} reaction${v === 1 ? '' : 's'}`],
  ['closestMatch', '🎯 Closest Match', v => `${v}/100 in one round`],
  ['consistentPerformer', '📏 Consistent', v => `only ${v} pts between rounds`],
];
const MEDALS = ['🥇', '🥈', '🥉'];

export default function Final({ state, offset }) {
  const left = useSecondsLeft(state.deadline, offset);
  const ranked = [...state.members].sort((a, b) => b.total - a.total);

  useEffect(() => {
    sfx.cheer();
    const end = Date.now() + 4000;
    const t = setInterval(() => {
      if (Date.now() > end) return clearInterval(t);
      confetti({ particleCount: 40, spread: 80, origin: { x: Math.random(), y: 0.2 }, zIndex: 25 });
    }, 250);
    return () => clearInterval(t);
  }, []);

  return (
    <aside className="panel side final">
      <h2 className="title">🏆 {ranked[0]?.name} wins!</h2>
      <ol className="board">
        {ranked.map((m, i) => (
          <li key={m.id}>
            <span className="rank">{MEDALS[i] ?? i + 1}</span>
            <Avatar character={m.character} pose={i === 0 ? 'cheer0' : 'idle'} size={40} />
            <span className="name">{m.name}</span>
            <span className="rounds">{Array.from({ length: state.rounds }, (_, r) => m.scores[r] ?? 0).join(' · ')}</span>
            <span className="total">{m.total}</span>
          </li>
        ))}
      </ol>
      <div className="awards">
        {AWARDS.map(([key, label, describe]) => {
          const award = state.awards?.[key];
          return (
            <div className="award" key={key}>
              <h3>{label}</h3>
              {award ? <><b>{award.name}</b><small className="muted">{describe(award.value)}</small></> : <small className="muted">No winner</small>}
            </div>
          );
        })}
      </div>
      <p className="muted">Back to the lobby for another game in {left}s…</p>
    </aside>
  );
}
