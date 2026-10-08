import Header from './components/Header.jsx';
import { useAudioUnlock } from './lib/audio.js';
import { playerId } from './lib/socket.js';
import { useGame } from './lib/useGame.js';
import Final from './screens/Final.jsx';
import Home from './screens/Home.jsx';
import Leaderboard from './screens/Leaderboard.jsx';
import Lobby from './screens/Lobby.jsx';
import Record from './screens/Record.jsx';
import Show from './screens/Show.jsx';

const SCREENS = { lobby: Lobby, record: Record, show: Show, leaderboard: Leaderboard, final: Final };

function findMe(state) {
  const member = state.members.find(m => m.id === playerId);
  if (member) return { ...member, role: 'member', isHost: state.hostId === playerId };
  const fan = state.audience.find(a => a.id === playerId);
  return fan ? { ...fan, role: 'audience', isHost: false } : null;
}

export default function App() {
  const { state, offset } = useGame();
  useAudioUnlock();

  if (!state) {
    return (
      <main className="screen home">
        <h1 className="logo">Voice<br />Battle</h1>
        <p className="muted">Connecting…</p>
      </main>
    );
  }

  const me = findMe(state);
  let screen;
  if (state.phase === 'none') screen = <Home mode="create" />;
  else if (!me) screen = <Home mode={state.phase === 'lobby' ? 'join' : 'busy'} teamName={state.teamName} teamCount={state.members.length} audienceCount={state.audience.length} />;
  else {
    const Screen = SCREENS[state.phase];
    screen = <Screen state={state} me={me} offset={offset} />;
  }

  return (
    <div className="app">
      <Header state={state} me={me} />
      {screen}
    </div>
  );
}
