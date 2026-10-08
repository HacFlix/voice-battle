import confetti from 'canvas-confetti';
import { useEffect, useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import { sfx } from '../lib/audio.js';
import { send } from '../lib/socket.js';

const AWARDS = [
  ['crowdFavourite', '💖 Crowd Favourite', v => `${v} reaction${v === 1 ? '' : 's'}`],
  ['closestMatch', '🎯 Closest Match', v => `${v}/100 in one round`],
  ['consistentPerformer', '📏 Consistent', v => `only ${v} pts between rounds`],
];
const MEDALS = ['🥇', '🥈', '🥉'];

export default function Final({ state, me }) {
  const [error, setError] = useState('');
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

  const run = async event => {
    const result = await send(event);
    setError(result.ok ? '' : result.error);
  };

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
      {me.isHost
        ? <div className="row"><button className="btn primary" onClick={() => run('playAgain')}>Play Again</button><button className="btn" onClick={() => run('end')}>End Game</button></div>
        : <p className="muted">Waiting for the host…</p>}
      {error && <p className="error">{error}</p>}
    </aside>
  );
}
