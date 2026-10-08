import Header from './components/Header.jsx';
import { useAudioUnlock } from './lib/audio.js';
import { playerId } from './lib/socket.js';
import { useGame } from './lib/useGame.js';
import { useReactions } from './lib/useReactions.js';
import Final from './screens/Final.jsx';
import Home from './screens/Home.jsx';
import Leaderboard from './screens/Leaderboard.jsx';
import Lobby from './screens/Lobby.jsx';
import Record from './screens/Record.jsx';
import Show from './screens/Show.jsx';
import Stage2D from './stage/Stage2D.jsx';
import { stageModel } from './stage/stageModel.js';

const SCREENS = { lobby: Lobby, record: Record, show: Show, leaderboard: Leaderboard, final: Final };

function findMe(state) {
  const isHost = state.actingHostId === playerId;
  if (state.host?.id === playerId) return { ...state.host, role: 'host', isHost };
  const member = state.members.find(m => m.id === playerId);
  if (member) return { ...member, role: 'member', isHost };
  const fan = state.audience.find(a => a.id === playerId);
  return fan ? { ...fan, role: 'audience', isHost: false } : null;
}

// center: one card in the middle (home); side: stage on the left, panel on the right
// (bottom sheet on phones); full: nothing but the stage.
function layoutFor(state, me) {
  if (!me || state.phase === 'none') return 'center';
  if (state.phase === 'show' && me.role !== 'audience') return 'full';
  return 'side';
}

export default function App() {
  const { state, offset } = useGame();
  const { floaters, hype } = useReactions();
  useAudioUnlock();

  let me = null;
  let screen;
  if (!state) {
    screen = (
      <div className="panel center">
        <h1 className="logo">Voice<br />Battle</h1>
        <p className="muted">Connecting…</p>
      </div>
    );
  } else {
    me = findMe(state);
    if (state.phase === 'none') screen = <Home mode="create" />;
    else if (!me) {
      screen = (
        <Home
          mode={state.phase === 'lobby' ? 'join' : 'busy'}
          teamName={state.teamName}
          hostName={state.host?.name}
          teamCount={state.members.length}
          audienceCount={state.audience.length}
        />
      );
    } else {
      const Screen = SCREENS[state.phase];
      screen = <Screen state={state} me={me} offset={offset} />;
    }
  }

  return (
    <div className={`game layout-${state ? layoutFor(state, me) : 'center'}`}>
      <Stage2D {...stageModel(state)} hype={hype} />
      {state && <Header state={state} me={me} />}
      {screen}
      <div className="floaters">
        {floaters.map(f => (
          <span key={f.id} className="floater" style={{ left: `${f.x}%` }}>{f.emoji}</span>
        ))}
      </div>
    </div>
  );
}
