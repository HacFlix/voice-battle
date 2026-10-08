import Avatar from '../components/Avatar.jsx';
import ReactionBar from '../components/ReactionBar.jsx';
import { useSecondsLeft } from '../lib/time.js';

export default function Leaderboard({ state, me, offset }) {
  const left = useSecondsLeft(state.deadline, offset);
  const ranked = [...state.members].sort((a, b) => b.total - a.total);
  const last = state.round >= state.rounds;
  return (
    <aside className="panel side leaderboard">
      <h2 className="title">Round {state.round} done!</h2>
      <ol className="board">
        {ranked.map((m, i) => (
          <li key={m.id} style={{ animationDelay: `${i * 80}ms` }}>
            <span className="rank">{i + 1}</span>
            <Avatar character={m.character} size={40} />
            <span className="name">{m.name}</span>
            <span className="pts">+{m.scores[state.round - 1] ?? 0}</span>
            <span className="total">{m.total}</span>
          </li>
        ))}
      </ol>
      <p className="muted">{last ? 'Final results' : `Round ${state.round + 1}`} in {left}s…</p>
      {me.role === 'audience' && <ReactionBar />}
    </aside>
  );
}
