export default function Header({ state, me }) {
  const inRound = ['record', 'show', 'leaderboard'].includes(state.phase);
  return (
    <header className="topbar">
      <span className="brand">🎤 Voice Battle</span>
      {state.teamName && <span className="pill team">{state.teamName}</span>}
      {inRound && <span className="pill">Round {state.round}/{state.rounds}</span>}
      {me && <span className="pill me">{me.name} · {me.isHost ? 'Host' : me.role === 'member' ? 'Team' : 'Audience'}</span>}
    </header>
  );
}
