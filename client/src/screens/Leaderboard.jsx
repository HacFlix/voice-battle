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
