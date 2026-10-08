import { setSoundOn, useSoundOn } from '../lib/audio.js';
import { send } from '../lib/socket.js';

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
      {me?.isHost && state.phase !== 'none' && (
        <button
          className="pill end-game"
          onClick={() => {
            if (window.confirm('End the game for everyone? Scores and recordings will be cleared.')) send('end');
          }}
        >
          ✖ End game
        </button>
      )}
      {me && <span className="pill me">{me.name} · {me.role === 'host' ? 'Host' : me.role === 'member' ? (me.isHost ? 'Team · standing in as host' : 'Team') : 'Audience'}</span>}
    </header>
  );
}
