import { useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import { upload } from '../lib/api.js';
import { playerId, send } from '../lib/socket.js';

export default function Lobby({ state, me }) {
  const [error, setError] = useState('');
  const run = async (event, payload) => {
    const result = await send(event, payload);
    setError(result.ok ? '' : result.error);
  };

  return (
    <main className="screen lobby">
      <section className="card">
        <h2>The Team <small>{state.members.length}/{state.config.maxMembers}</small></h2>
        <ul className="roster">
          {state.members.map(m => (
            <li key={m.id} className={m.connected ? '' : 'offline'}>
              <Avatar character={m.character} size={56} />
              <span>{m.name}</span>
              {m.id === state.hostId && <span className="tag">HOST</span>}
              {m.id === me.id && <span className="tag you">YOU</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Audience <small>{state.audience.length}</small></h2>
        {state.audience.length === 0
          ? <p className="muted">Nobody yet. Share this page's link so people can join as audience.</p>
          : <div className="chips">{state.audience.map(a => <span className="chip" key={a.id}>{a.name}</span>)}</div>}
      </section>

      {me.isHost
        ? <HostControls state={state} run={run} setError={setError} />
        : <section className="card"><p className="muted">Waiting for the host to start… {state.rounds} rounds · {state.clipCount} clips</p></section>}
      {error && <p className="error">{error}</p>}
    </main>
  );
}

function HostControls({ state, run, setError }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [uploading, setUploading] = useState(false);

  async function addClip() {
    if (!title.trim() || !file) return setError('Pick an audio file and give it a title');
    setUploading(true);
    const result = await upload('/api/clip', { playerId, title }, file, file.name);
    setUploading(false);
    if (!result.ok) return setError(result.error);
    setError('');
    setTitle('');
    setFile(null);
    setFileKey(k => k + 1);
  }

  return (
    <section className="card host">
      <h2>Host controls</h2>
      <div className="row">
        <span>Rounds</span>
        {[3, 4].map(n => (
          <button key={n} className={`btn small ${state.rounds === n ? 'primary' : ''}`} onClick={() => run('setRounds', { rounds: n })}>{n}</button>
        ))}
      </div>
      <div className="upload">
        <span>Add your own clip <small className="muted">({state.clipCount} clips in the pack, max 15 s)</small></span>
        <input value={title} placeholder="Clip title, e.g. Mogambo khush hua" maxLength={60} onChange={e => setTitle(e.target.value)} />
        <input key={fileKey} type="file" accept="audio/*" onChange={e => setFile(e.target.files[0] || null)} />
        <button className="btn small" disabled={uploading} onClick={addClip}>{uploading ? 'Uploading…' : 'Upload clip'}</button>
      </div>
      <button className="btn primary big" disabled={Boolean(state.startProblem)} onClick={() => run('start')}>Start the Battle</button>
      {state.startProblem && <p className="muted">{state.startProblem}</p>}
    </section>
  );
}
