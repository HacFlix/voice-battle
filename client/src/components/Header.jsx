import { setSoundOn, useSoundOn } from '../lib/audio.js';

export default function Header({ state, me }) {
  const soundOn = useSoundOn();
  const inRound = ['record', 'show', 'leaderboard'].includes(state.phase);
  return (
    <header className="topbar">
      <span className="brand">🎤 Voice Battle</span>
      {state.teamName && <span className="pill team">{state.teamName}</span>}
      {inRound && <span className="pill">Round {state.round}/{state.rounds}</span>}
      <button className="pill sound" onClick={() => setSoundOn(!soundOn)} title="Several devices in one room? Keep sound on for just one of them.">
        {soundOn ? '🔊 Sound on' : '🔇 Muted'}
      </button>
      {me && <span className="pill me">{me.name} · {me.isHost ? 'Host' : me.role === 'member' ? 'Team' : 'Audience'}</span>}
    </header>
  );
}
