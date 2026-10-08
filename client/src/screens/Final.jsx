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
